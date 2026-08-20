create or replace function public.get_player_analytics_facts(p_group_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_group public.groups%rowtype;
  v_subject public.profiles%rowtype;
  v_current public.group_rating_states%rowtype;
  v_available_groups jsonb;
  v_base jsonb;
  v_ranked_count integer;
begin
  if v_actor is null then
    raise exception using errcode = 'MR401', message = 'Authentication required';
  end if;

  select group_row.* into v_group
  from public.groups as group_row
  join public.group_memberships as viewer_membership
    on viewer_membership.group_id = group_row.id
    and viewer_membership.user_id = v_actor
    and viewer_membership.status = 'active'
    and viewer_membership.left_at is null
  join public.group_memberships as subject_membership
    on subject_membership.group_id = group_row.id
    and subject_membership.user_id = p_user_id
    and subject_membership.status = 'active'
    and subject_membership.left_at is null
  where group_row.id = p_group_id
    and group_row.archived_at is null;

  if not found then return null; end if;

  select profile.* into v_subject
  from public.profiles as profile
  where profile.id = p_user_id;
  if not found then return null; end if;

  select state.* into v_current
  from public.group_rating_states as state
  where state.group_id = p_group_id and state.user_id = p_user_id;

  select count(*)::integer into v_ranked_count
  from public.group_rating_states as state
  join public.group_memberships as membership
    on membership.group_id = state.group_id
    and membership.user_id = state.user_id
    and membership.status = 'active'
    and membership.left_at is null
  where state.group_id = p_group_id;

  select coalesce(jsonb_agg(
    jsonb_build_object('id', shared.id, 'name', shared.name)
    order by shared.name, shared.id
  ), '[]'::jsonb)
  into v_available_groups
  from (
    select distinct group_row.id, group_row.name
    from public.groups as group_row
    join public.group_memberships as viewer_membership
      on viewer_membership.group_id = group_row.id
      and viewer_membership.user_id = v_actor
      and viewer_membership.status = 'active'
      and viewer_membership.left_at is null
    join public.group_memberships as subject_membership
      on subject_membership.group_id = group_row.id
      and subject_membership.user_id = p_user_id
      and subject_membership.status = 'active'
      and subject_membership.left_at is null
    where group_row.archived_at is null
  ) as shared;

  v_base := jsonb_build_object(
    'asOf', statement_timestamp(),
    'viewerUserId', v_actor,
    'subject', jsonb_build_object('id', v_subject.id, 'name', v_subject.display_name),
    'group', jsonb_build_object('id', v_group.id, 'name', v_group.name),
    'availableGroups', v_available_groups
  );

  if v_group.analytics_applied_version is distinct from v_group.rating_applied_version then
    return v_base || jsonb_build_object('status', 'updating');
  end if;

  return v_base || jsonb_build_object(
    'status', 'ready',
    'current', jsonb_build_object(
      'rating', coalesce(v_current.rating::double precision, 1500),
      'rd', coalesce(v_current.rd::double precision, 350),
      'rank', coalesce(v_current.rank, v_ranked_count),
      'rankedPlayerCount', v_ranked_count
    ),
    'activePlayerIds', (
      select coalesce(jsonb_agg(membership.user_id order by membership.user_id), '[]'::jsonb)
      from public.group_memberships as membership
      join public.profiles as profile on profile.id = membership.user_id
      where membership.group_id = p_group_id
        and membership.status = 'active'
        and membership.left_at is null
        and (profile.active_until >= statement_timestamp() or membership.user_id = p_user_id)
    ),
    'matches', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', fact.match_id,
          'occurredAt', fact.occurred_at,
          'format', fact.format,
          'matchWon', fact.match_won,
          'gameCount', fact.game_count,
          'gameWins', fact.game_wins,
          'expectedGameWins', fact.expected_game_wins,
          'ratingBefore', fact.rating_before,
          'rdBefore', (
            select event.before_rd::double precision
            from public.rating_events as event
            where event.group_id = p_group_id
              and event.match_id = fact.match_id
              and event.user_id = p_user_id
              and event.revision_id = (
                select match.active_revision_id
                from public.matches as match
                where match.id = fact.match_id and match.group_id = p_group_id
              )
            order by event.sequence
            limit 1
          ),
          'ratingAfter', fact.rating_after,
          'rdAfter', (
            select event.after_rd::double precision
            from public.rating_events as event
            where event.group_id = p_group_id
              and event.match_id = fact.match_id
              and event.user_id = p_user_id
              and event.revision_id = (
                select match.active_revision_id
                from public.matches as match
                where match.id = fact.match_id and match.group_id = p_group_id
              )
            order by event.sequence desc
            limit 1
          ),
          'ratingDelta', fact.rating_delta,
          'partners', (
            select coalesce(jsonb_agg(jsonb_build_object('id', profile.id, 'name', profile.display_name) order by profile.display_name, profile.id), '[]'::jsonb)
            from public.matches as match
            join public.match_participants as subject_participant
              on subject_participant.revision_id = match.active_revision_id
              and subject_participant.user_id = p_user_id
            join public.match_participants as related
              on related.revision_id = match.active_revision_id
              and related.team = subject_participant.team
              and related.user_id <> p_user_id
            join public.profiles as profile on profile.id = related.user_id
            where match.id = fact.match_id
          ),
          'opponents', (
            select coalesce(jsonb_agg(jsonb_build_object('id', profile.id, 'name', profile.display_name) order by profile.display_name, profile.id), '[]'::jsonb)
            from public.matches as match
            join public.match_participants as subject_participant
              on subject_participant.revision_id = match.active_revision_id
              and subject_participant.user_id = p_user_id
            join public.match_participants as related
              on related.revision_id = match.active_revision_id
              and related.team <> subject_participant.team
            join public.profiles as profile on profile.id = related.user_id
            where match.id = fact.match_id
          )
        ) order by fact.occurred_at, fact.match_id
      ), '[]'::jsonb)
      from private.player_analytics_match_facts(p_group_id) as fact
      where fact.user_id = p_user_id
    ),
    'cohortDaily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'userId', daily.user_id,
        'statDate', daily.stat_date,
        'matchCount', daily.match_count,
        'ratingDelta', daily.rating_delta,
        'doublesMatchCount', daily.doubles_match_count
      ) order by daily.stat_date, daily.user_id), '[]'::jsonb)
      from (
        select
          fact.user_id,
          fact.occurred_at::date as stat_date,
          count(*)::integer as match_count,
          sum(fact.rating_delta)::double precision as rating_delta,
          count(*) filter (where fact.format = 'doubles')::integer as doubles_match_count
        from private.player_analytics_match_facts(p_group_id) as fact
        group by fact.user_id, fact.occurred_at::date
      ) as daily
    ),
    'cohortPartners', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'userId', partner.user_id,
        'relatedUserId', partner.related_user_id,
        'statDate', partner.stat_date
      ) order by partner.stat_date, partner.user_id, partner.related_user_id), '[]'::jsonb)
      from (
        select distinct
          participant.user_id,
          related.user_id as related_user_id,
          match.submitted_at::date as stat_date
        from public.matches as match
        join public.match_revisions as revision on revision.id = match.active_revision_id and revision.format = 'doubles'
        join public.match_participants as participant on participant.revision_id = revision.id
        join public.match_participants as related
          on related.revision_id = revision.id
          and related.team = participant.team
          and related.user_id <> participant.user_id
        where match.group_id = p_group_id
      ) as partner
    )
  );
end;
$$;

revoke all on function public.get_player_analytics_facts(uuid, uuid) from public, anon;
grant execute on function public.get_player_analytics_facts(uuid, uuid) to authenticated;

comment on function public.get_player_analytics_facts(uuid, uuid) is
  'Returns version-guarded player analytics facts, including rating deviation confidence, when viewer and subject share the selected active group.';
