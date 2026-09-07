create or replace function public.list_visible_group_memberships_v2(p_group_ids uuid[])
returns table (
  group_id uuid,
  user_id uuid,
  role public.group_role,
  display_name text,
  is_guest boolean,
  active_until timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    membership.group_id,
    membership.user_id,
    membership.role,
    membership.display_name,
    membership.is_guest,
    membership.active_until
  from private.visible_group_memberships(p_group_ids) membership;
$$;

create or replace function public.list_current_user_groups_v2()
returns table (
  id uuid,
  name text,
  description text,
  member_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_group_ids uuid[] := array[]::uuid[];
begin
  if v_actor is null then
    raise exception using errcode = 'MR401', message = 'Authentication required';
  end if;

  select coalesce(array_agg(g.id order by g.name, g.id), array[]::uuid[])
  into v_group_ids
  from public.groups g
  join public.group_memberships actor_membership
    on actor_membership.group_id = g.id
   and actor_membership.user_id = v_actor
   and actor_membership.status = 'active'
   and actor_membership.left_at is null
  where g.archived_at is null;

  return query
  with visible as materialized (
    select membership.group_id, membership.user_id
    from private.visible_group_memberships(v_group_ids) membership
  )
  select
    g.id,
    g.name,
    g.description,
    count(visible.user_id)::bigint as member_count
  from public.groups g
  left join visible on visible.group_id = g.id
  where g.id = any(v_group_ids)
  group by g.id, g.name, g.description
  order by g.name, g.id;
end;
$$;

create or replace function public.get_group_member_snapshot_v2(p_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_group jsonb;
  v_memberships jsonb;
begin
  if v_actor is null then
    raise exception using errcode = 'MR401', message = 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.group_memberships membership
    where membership.group_id = p_group_id
      and membership.user_id = v_actor
      and membership.status = 'active'
      and membership.left_at is null
  ) then
    raise exception using errcode = 'MR403', message = 'Not an active group member';
  end if;

  select jsonb_build_object(
    'id', g.id,
    'name', g.name,
    'description', g.description
  )
  into v_group
  from public.groups g
  where g.id = p_group_id
    and g.archived_at is null;

  if v_group is null then
    return null;
  end if;

  with visible as materialized (
    select membership.*
    from private.visible_group_memberships(array[p_group_id]) membership
  )
  select coalesce(
    jsonb_agg(to_jsonb(row_data) order by row_data.user_id),
    '[]'::jsonb
  )
  into v_memberships
  from (
    select
      visible.group_id,
      visible.user_id,
      visible.role,
      visible.display_name,
      visible.is_guest,
      visible.active_until,
      rating.rating,
      rating.rd,
      rating.games_played,
      rating.consistency_log_mean
    from visible
    left join public.group_rating_states rating
      on rating.group_id = visible.group_id
     and rating.user_id = visible.user_id
  ) row_data;

  return jsonb_build_object(
    'group', v_group,
    'memberships', v_memberships
  );
end;
$$;

create or replace function public.list_match_history_bundle_v2(
  p_group_id uuid default null,
  p_status public.match_status default null,
  p_search text default null,
  p_before_submitted_at timestamptz default null,
  p_before_match_id uuid default null,
  p_limit integer default 21,
  p_player_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_search text := lower(nullif(trim(p_search), ''));
  v_pattern text;
begin
  if v_actor is null then
    raise exception using errcode = 'MR401', message = 'Authentication required';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 51 then
    raise exception using errcode = 'MRVAL', message = 'History limit must be between 1 and 51';
  end if;

  if (p_before_submitted_at is null) <> (p_before_match_id is null) then
    raise exception using errcode = 'MRVAL', message = 'History cursor is incomplete';
  end if;

  if p_player_id is not null and p_group_id is null then
    raise exception using errcode = 'MRVAL', message = 'Player history requires a group ID';
  end if;

  if p_group_id is not null and not exists (
    select 1
    from public.group_memberships membership
    where membership.group_id = p_group_id
      and membership.user_id = v_actor
      and membership.status = 'active'
      and membership.left_at is null
  ) then
    raise exception using errcode = 'MR403', message = 'Not an active group member';
  end if;

  if v_search is not null then
    v_pattern := '%'
      || replace(
        replace(
          replace(v_search, E'\\', E'\\\\'),
          '%', E'\\%'
        ),
        '_', E'\\_'
      )
      || '%';
  end if;

  return (
    with selected_matches as materialized (
      select
        match_row.id,
        match_row.group_id,
        match_row.active_revision_id,
        match_row.status,
        match_row.submitted_at,
        match_row.review_started_at
      from public.matches match_row
      join public.match_revisions active_revision on active_revision.id = match_row.active_revision_id
      join public.groups match_group on match_group.id = match_row.group_id
      where match_row.active_revision_id is not null
        and (
          (
            p_group_id is not null
            and match_row.group_id = p_group_id
          )
          or (
            p_group_id is null
            and exists (
              select 1
              from public.group_memberships actor_membership
              where actor_membership.group_id = match_row.group_id
                and actor_membership.user_id = v_actor
                and actor_membership.status = 'active'
                and actor_membership.left_at is null
            )
            and exists (
              select 1
              from public.match_participants actor_participant
              where actor_participant.revision_id = match_row.active_revision_id
                and actor_participant.user_id = v_actor
            )
          )
        )
        and (
          p_player_id is null
          or exists (
            select 1
            from public.match_participants subject_participant
            where subject_participant.revision_id = match_row.active_revision_id
              and subject_participant.user_id = p_player_id
          )
        )
        and (p_status is null or match_row.status = p_status)
        and (
          p_before_submitted_at is null
          or (match_row.submitted_at, match_row.id) < (p_before_submitted_at, p_before_match_id)
        )
        and (
          v_search is null
          or lower(match_row.status::text) like v_pattern escape E'\\'
          or lower(active_revision.format::text) like v_pattern escape E'\\'
          or lower(
            case match_row.status
              when 'pending_confirmation' then 'Awaiting review'
              when 'confirmed' then 'Accepted'
              when 'disputed' then 'Disputed'
            end
          ) like v_pattern escape E'\\'
          or lower(match_group.name) like v_pattern escape E'\\'
          or exists (
            select 1
            from public.match_participants search_participant
            join public.profiles search_profile on search_profile.id = search_participant.user_id
            where search_participant.revision_id = match_row.active_revision_id
              and lower(search_profile.display_name) like v_pattern escape E'\\'
          )
        )
      order by match_row.submitted_at desc, match_row.id desc
      limit p_limit
    ),
    selected_revisions as materialized (
      select
        revision.id,
        revision.match_id,
        revision.submitted_by_user_id,
        revision.format
      from public.match_revisions revision
      join selected_matches selected on selected.active_revision_id = revision.id
    )
    select jsonb_build_object(
      'actorUserId', v_actor,
      'currentUserAdminGroupIds', coalesce((
        select jsonb_agg(admin_group.group_id order by admin_group.group_id)
        from (
          select distinct membership.group_id
          from public.group_memberships membership
          join selected_matches selected on selected.group_id = membership.group_id
          where membership.user_id = v_actor
            and membership.role in ('owner', 'admin')
            and membership.status = 'active'
            and membership.left_at is null
        ) admin_group
      ), '[]'::jsonb),
      'groups', coalesce((
        select jsonb_agg(to_jsonb(row_data) order by row_data.name, row_data.id)
        from (
          select distinct match_group.id, match_group.name
          from public.groups match_group
          join selected_matches selected on selected.group_id = match_group.id
        ) row_data
      ), '[]'::jsonb),
      'matches', coalesce((
        select jsonb_agg(to_jsonb(selected) order by selected.submitted_at desc, selected.id desc)
        from selected_matches selected
      ), '[]'::jsonb),
      'revisions', coalesce((
        select jsonb_agg(to_jsonb(revision) order by revision.id)
        from selected_revisions revision
      ), '[]'::jsonb),
      'participants', coalesce((
        select jsonb_agg(to_jsonb(row_data) order by row_data.revision_id, row_data.team, row_data.slot)
        from (
          select participant.revision_id, participant.user_id, participant.team, participant.slot
          from public.match_participants participant
          join selected_revisions revision on revision.id = participant.revision_id
        ) row_data
      ), '[]'::jsonb),
      'games', coalesce((
        select jsonb_agg(to_jsonb(row_data) order by row_data.revision_id, row_data.game_number)
        from (
          select game.revision_id, game.game_number, game.team_a_score, game.team_b_score, game.winner_team
          from public.match_games game
          join selected_revisions revision on revision.id = game.revision_id
        ) row_data
      ), '[]'::jsonb),
      'ratingEvents', coalesce((
        select jsonb_agg(to_jsonb(row_data) order by row_data.revision_id, row_data.user_id, row_data.sequence)
        from (
          select
            rating_event.revision_id,
            rating_event.user_id,
            rating_event.sequence,
            rating_event.before_rating,
            rating_event.before_rd,
            rating_event.after_rating,
            rating_event.after_rd
          from public.rating_events rating_event
          join selected_revisions revision on revision.id = rating_event.revision_id
        ) row_data
      ), '[]'::jsonb),
      'profiles', coalesce((
        select jsonb_agg(to_jsonb(row_data) order by row_data.id)
        from (
          select distinct profile.id, profile.display_name
          from public.profiles profile
          join public.match_participants participant on participant.user_id = profile.id
          join selected_revisions revision on revision.id = participant.revision_id
        ) row_data
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.list_visible_group_memberships_v2(uuid[]) from public, anon, authenticated;
revoke all on function public.list_current_user_groups_v2() from public, anon, authenticated;
revoke all on function public.get_group_member_snapshot_v2(uuid) from public, anon, authenticated;
revoke all on function public.list_match_history_bundle_v2(
  uuid,
  public.match_status,
  text,
  timestamptz,
  uuid,
  integer,
  uuid
) from public, anon, authenticated;

grant execute on function public.list_visible_group_memberships_v2(uuid[]) to service_role;
grant execute on function public.list_current_user_groups_v2() to authenticated;
grant execute on function public.get_group_member_snapshot_v2(uuid) to authenticated;
grant execute on function public.list_match_history_bundle_v2(
  uuid,
  public.match_status,
  text,
  timestamptz,
  uuid,
  integer,
  uuid
) to authenticated;
