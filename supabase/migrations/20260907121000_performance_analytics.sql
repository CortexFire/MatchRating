create function private.player_analytics_match_facts_v2(
  p_group_id uuid,
  p_user_id uuid,
  p_match_ids uuid[] default null
)
returns table (
  user_id uuid,
  match_id uuid,
  revision_id uuid,
  occurred_at timestamptz,
  format public.match_format,
  team public.team_code,
  match_won boolean,
  game_count integer,
  game_wins integer,
  expected_game_wins double precision,
  rating_before double precision,
  rd_before double precision,
  rating_after double precision,
  rd_after double precision,
  performance_sd_after bigint,
  rating_delta double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  with canonical_games as (
    select
      event.user_id,
      event.match_id,
      event.revision_id,
      event.game_id,
      event.occurred_at,
      event.format,
      event.team,
      event.sequence,
      event.actual_score,
      event.before_rating::double precision as before_rating,
      event.before_rd::double precision as before_rd,
      event.after_rating::double precision as after_rating,
      event.after_rd::double precision as after_rd
    from public.rating_events as event
    join public.matches as match
      on match.id = event.match_id
      and match.group_id = event.group_id
      and match.active_revision_id = event.revision_id
    where event.group_id = p_group_id
      and (p_match_ids is null or event.match_id = any(p_match_ids))
  ), team_ratings as (
    select
      game.game_id,
      game.team,
      avg(game.before_rating)::double precision as before_rating
    from canonical_games as game
    group by game.game_id, game.team
  ), scored_games as (
    select
      game.*,
      1.0 / (
        1.0 + power(
          10.0,
          (opponent.before_rating - own.before_rating) / 400.0
        )
      ) as expected_score
    from canonical_games as game
    join team_ratings as own
      on own.game_id = game.game_id
      and own.team = game.team
    join team_ratings as opponent
      on opponent.game_id = game.game_id
      and opponent.team <> game.team
  ), match_facts as (
    select
      game.user_id,
      game.match_id,
      game.revision_id,
      min(game.occurred_at) as occurred_at,
      min(game.format::text)::public.match_format as format,
      min(game.team::text)::public.team_code as team,
      count(*) filter (where game.actual_score = 1)
        > count(*) filter (where game.actual_score = 0) as match_won,
      count(*)::integer as game_count,
      count(*) filter (where game.actual_score = 1)::integer as game_wins,
      sum(game.expected_score order by game.sequence)::double precision as expected_game_wins,
      (array_agg(game.before_rating order by game.sequence))[1]::double precision as rating_before,
      (array_agg(game.before_rd order by game.sequence))[1]::double precision as rd_before,
      (array_agg(game.after_rating order by game.sequence desc))[1]::double precision as rating_after,
      (array_agg(game.after_rd order by game.sequence desc))[1]::double precision as rd_after
    from scored_games as game
    where p_user_id is null or game.user_id = p_user_id
    group by game.user_id, game.match_id, game.revision_id
  )
  select
    fact.user_id,
    fact.match_id,
    fact.revision_id,
    fact.occurred_at,
    fact.format,
    fact.team,
    fact.match_won,
    fact.game_count,
    fact.game_wins,
    fact.expected_game_wins,
    fact.rating_before,
    fact.rd_before,
    fact.rating_after,
    fact.rd_after,
    case
      when consistency.after_log_mean between ln(0.5) and ln(9007199254740991)
        then round(exp(consistency.after_log_mean))::bigint
      else null
    end as performance_sd_after,
    (fact.rating_after - fact.rating_before)::double precision as rating_delta
  from match_facts as fact
  left join public.consistency_events as consistency
    on consistency.group_id = p_group_id
    and consistency.match_id = fact.match_id
    and consistency.revision_id = fact.revision_id
    and consistency.user_id = fact.user_id;
$$;

revoke all on function private.player_analytics_match_facts_v2(uuid, uuid, uuid[])
  from public, anon, authenticated, service_role;

create function public.get_player_analytics_v2(p_group_id uuid, p_user_id uuid)
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
  v_as_of timestamptz := statement_timestamp();
  v_payload jsonb;
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
  where state.group_id = p_group_id
    and state.user_id = p_user_id;

  select count(*)::integer into v_ranked_count
  from public.group_rating_states as state
  join public.group_memberships as membership
    on membership.group_id = state.group_id
    and membership.user_id = state.user_id
    and membership.status = 'active'
    and membership.left_at is null
  where state.group_id = p_group_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', shared.id, 'name', shared.name)
      order by shared.name, shared.id
    ),
    '[]'::jsonb
  )
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
    'asOf', v_as_of,
    'viewerUserId', v_actor,
    'subject', jsonb_build_object('id', v_subject.id, 'name', v_subject.display_name),
    'group', jsonb_build_object('id', v_group.id, 'name', v_group.name),
    'availableGroups', v_available_groups
  );

  if v_group.analytics_applied_version is distinct from v_group.rating_applied_version then
    return v_base || jsonb_build_object('status', 'updating');
  end if;

  with period_defs(period, cutoff_at) as (
    values
      ('all'::text, null::timestamptz),
      ('30d'::text, v_as_of - interval '30 days'),
      ('90d'::text, v_as_of - interval '90 days'),
      ('1y'::text, v_as_of - interval '365 days')
  ), facts as materialized (
    select *
    from private.player_analytics_match_facts_v2(p_group_id, null, null)
  ), subject_facts as materialized (
    select *
    from facts
    where user_id = p_user_id
  ), active_players as materialized (
    select membership.user_id
    from public.group_memberships as membership
    join public.profiles as profile on profile.id = membership.user_id
    where membership.group_id = p_group_id
      and membership.status = 'active'
      and membership.left_at is null
      and (profile.active_until >= v_as_of or membership.user_id = p_user_id)
  ), cohort_daily as materialized (
    select
      fact.user_id,
      fact.occurred_at::date as stat_date,
      count(*)::integer as match_count,
      sum(fact.rating_delta order by fact.occurred_at, fact.match_id)::double precision as rating_delta,
      count(*) filter (where fact.format = 'doubles')::integer as doubles_match_count
    from facts as fact
    group by fact.user_id, fact.occurred_at::date
  ), partner_events as materialized (
    select
      fact.user_id,
      fact.occurred_at::date as stat_date,
      related.user_id as related_user_id
    from facts as fact
    join public.match_participants as participant
      on participant.revision_id = fact.revision_id
      and participant.user_id = fact.user_id
    join public.match_participants as related
      on related.revision_id = fact.revision_id
      and related.team = participant.team
      and related.user_id <> participant.user_id
    where fact.format = 'doubles'
  ), cohort_stats as (
    select
      period.period,
      player.user_id,
      coalesce(sum(daily.match_count) filter (
        where period.cutoff_at is null
          or daily.stat_date::timestamp at time zone 'UTC' >= period.cutoff_at
      ), 0)::integer as match_count,
      coalesce(sum(daily.rating_delta order by daily.stat_date) filter (
        where period.cutoff_at is null
          or daily.stat_date::timestamp at time zone 'UTC' >= period.cutoff_at
      ), 0)::double precision as rating_delta,
      coalesce(sum(daily.doubles_match_count) filter (
        where period.cutoff_at is null
          or daily.stat_date::timestamp at time zone 'UTC' >= period.cutoff_at
      ), 0)::integer as doubles_match_count
    from period_defs as period
    cross join active_players as player
    left join cohort_daily as daily on daily.user_id = player.user_id
    group by period.period, player.user_id
  ), partner_stats as (
    select
      period.period,
      player.user_id,
      count(distinct event.related_user_id) filter (
        where period.cutoff_at is null
          or event.stat_date::timestamp at time zone 'UTC' >= period.cutoff_at
      )::integer as distinct_partner_count
    from period_defs as period
    cross join active_players as player
    left join partner_events as event on event.user_id = player.user_id
    group by period.period, player.user_id
  ), cohort_json as (
    select
      cohort.period,
      jsonb_agg(
        jsonb_build_object(
          'userId', cohort.user_id,
          'matchCount', cohort.match_count,
          'ratingDelta', cohort.rating_delta,
          'doublesMatchCount', cohort.doubles_match_count,
          'distinctPartnerCount', partner.distinct_partner_count
        )
        order by cohort.user_id
      ) as value
    from cohort_stats as cohort
    join partner_stats as partner
      on partner.period = cohort.period
      and partner.user_id = cohort.user_id
    group by cohort.period
  ), subject_summary as (
    select
      period.period,
      count(fact.match_id) filter (
        where period.cutoff_at is null or fact.occurred_at >= period.cutoff_at
      )::integer as match_count,
      count(fact.match_id) filter (
        where (period.cutoff_at is null or fact.occurred_at >= period.cutoff_at)
          and fact.match_won
      )::integer as wins,
      coalesce(sum(fact.game_count) filter (
        where period.cutoff_at is null or fact.occurred_at >= period.cutoff_at
      ), 0)::integer as game_count,
      coalesce(sum(fact.game_wins) filter (
        where period.cutoff_at is null or fact.occurred_at >= period.cutoff_at
      ), 0)::integer as game_wins,
      coalesce(sum(fact.expected_game_wins order by fact.occurred_at, fact.match_id) filter (
        where period.cutoff_at is null or fact.occurred_at >= period.cutoff_at
      ), 0)::double precision as expected_game_wins,
      coalesce(sum(fact.rating_delta order by fact.occurred_at, fact.match_id) filter (
        where period.cutoff_at is null or fact.occurred_at >= period.cutoff_at
      ), 0)::double precision as rating_delta,
      count(fact.match_id) filter (
        where (period.cutoff_at is null or fact.occurred_at >= period.cutoff_at)
          and fact.match_won
          and fact.game_count > 0
          and fact.expected_game_wins / fact.game_count <= 0.35
      )::integer as upset_wins,
      count(fact.match_id) filter (
        where period.cutoff_at is null or fact.occurred_at >= period.cutoff_at
      )::integer as residual_count,
      coalesce(sum(
        (fact.game_wins - fact.expected_game_wins) / nullif(fact.game_count, 0)
        order by fact.occurred_at, fact.match_id
      ) filter (
        where period.cutoff_at is null or fact.occurred_at >= period.cutoff_at
      ), 0)::double precision as residual_sum,
      coalesce(sum(
        power((fact.game_wins - fact.expected_game_wins) / nullif(fact.game_count, 0), 2)
        order by fact.occurred_at, fact.match_id
      ) filter (
        where period.cutoff_at is null or fact.occurred_at >= period.cutoff_at
      ), 0)::double precision as residual_sum_squares
    from period_defs as period
    left join subject_facts as fact on true
    group by period.period
  ), relationship_events as materialized (
    select
      fact.match_id,
      fact.occurred_at,
      fact.match_won,
      fact.game_count,
      fact.game_wins,
      fact.expected_game_wins,
      related.user_id as related_user_id,
      profile.display_name as related_name,
      case
        when related.team = subject_participant.team then 'partner'
        else 'opponent'
      end as kind
    from subject_facts as fact
    join public.match_participants as subject_participant
      on subject_participant.revision_id = fact.revision_id
      and subject_participant.user_id = p_user_id
    join public.match_participants as related
      on related.revision_id = fact.revision_id
      and related.user_id <> p_user_id
    join public.profiles as profile on profile.id = related.user_id
  ), relationship_by_period as (
    select
      period.period,
      relation.related_user_id,
      relation.related_name,
      relation.kind,
      count(*)::integer as matches,
      count(*) filter (where relation.match_won)::integer as wins,
      sum(relation.game_count)::integer as game_count,
      sum(relation.game_wins)::integer as game_wins,
      sum(relation.expected_game_wins order by relation.occurred_at, relation.match_id)::double precision
        as expected_game_wins
    from period_defs as period
    join relationship_events as relation
      on period.cutoff_at is null or relation.occurred_at >= period.cutoff_at
    group by period.period, relation.related_user_id, relation.related_name, relation.kind
  ), encounter_counts as (
    select
      period.period,
      count(distinct relation.related_user_id) filter (
        where relation.related_user_id <> p_user_id
          and active.user_id is not null
      )::integer as encountered_active_count
    from period_defs as period
    left join relationship_by_period as relation on relation.period = period.period
    left join active_players as active
      on active.user_id = relation.related_user_id
      and active.user_id <> p_user_id
    group by period.period
  ), chart_points as materialized (
    select
      period.period,
      fact.match_id,
      fact.occurred_at,
      floor(fact.rating_after + 0.5)::double precision as rating,
      fact.rd_after,
      fact.performance_sd_after,
      (floor(fact.rating_delta * 100 + 0.5) / 100.0)::double precision as rating_delta
    from period_defs as period
    join subject_facts as fact
      on period.cutoff_at is null or fact.occurred_at >= period.cutoff_at
  ), ordered_chart as (
    select
      point.*,
      row_number() over (
        partition by point.period
        order by point.occurred_at, point.match_id
      ) as point_number,
      count(*) over (partition by point.period) as point_count
    from chart_points as point
  ), bucketed_chart as (
    select
      point.*,
      case
        when point.point_count > 200
          and point.point_number between 2 and point.point_count - 1
        then floor((point.point_number - 2) * 49.0 / (point.point_count - 2))::integer
        else null
      end as bucket
    from ordered_chart as point
  ), ranked_chart as (
    select
      point.*,
      row_number() over (
        partition by point.period, point.bucket
        order by point.rating, point.occurred_at, point.match_id
      ) as minimum_rating_rank,
      row_number() over (
        partition by point.period, point.bucket
        order by point.rating desc, point.occurred_at, point.match_id
      ) as maximum_rating_rank,
      row_number() over (
        partition by point.period, point.bucket
        order by point.rating - point.performance_sd_after, point.occurred_at, point.match_id
      ) as minimum_envelope_rank,
      row_number() over (
        partition by point.period, point.bucket
        order by point.rating + point.performance_sd_after desc, point.occurred_at, point.match_id
      ) as maximum_envelope_rank
    from bucketed_chart as point
  ), selected_chart as materialized (
    select *
    from ranked_chart
    where point_count <= 200
      or point_number = 1
      or point_number = point_count
      or (
        bucket is not null
        and (
          minimum_rating_rank = 1
          or maximum_rating_rank = 1
          or minimum_envelope_rank = 1
          or maximum_envelope_rank = 1
        )
      )
  ), streak_rows as (
    select
      fact.match_won,
      count(*) filter (where not fact.match_won) over (
        order by fact.occurred_at desc, fact.match_id desc
        rows between unbounded preceding and 1 preceding
      ) as previous_losses
    from subject_facts as fact
  ), streak as (
    select count(*) filter (
      where match_won and coalesce(previous_losses, 0) = 0
    )::integer as value
    from streak_rows
  )
  select jsonb_build_object(
    '_invalidConsistency', exists (
      select 1
      from subject_facts
      where performance_sd_after is null or performance_sd_after <= 0
    ),
    'status', 'ready',
    'ratingVersion', v_group.rating_applied_version::text,
    'current', jsonb_build_object(
      'rating', coalesce(v_current.rating::double precision, 1500),
      'rd', coalesce(v_current.rd::double precision, 350),
      'rank', coalesce(v_current.rank, v_ranked_count),
      'rankedPlayerCount', v_ranked_count
    ),
    'currentWinStreak', (select value from streak),
    'periods', (
      select jsonb_object_agg(
        period.period,
        jsonb_build_object(
          'matchCount', summary.match_count,
          'wins', summary.wins,
          'gameCount', summary.game_count,
          'gameWins', summary.game_wins,
          'expectedGameWins', summary.expected_game_wins,
          'ratingDelta', summary.rating_delta,
          'upsetWins', summary.upset_wins,
          'residualCount', summary.residual_count,
          'residualSum', summary.residual_sum,
          'residualSumSquares', summary.residual_sum_squares,
          'activePeerCount', (
            select count(*)::integer
            from active_players
            where user_id <> p_user_id
          ),
          'encounteredActiveCount', encounter.encountered_active_count,
          'cohort', coalesce(cohort.value, '[]'::jsonb),
          'relationships', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'player', jsonb_build_object(
                  'id', relation.related_user_id,
                  'name', relation.related_name
                ),
                'kind', relation.kind,
                'matches', relation.matches,
                'wins', relation.wins,
                'gameCount', relation.game_count,
                'gameWins', relation.game_wins,
                'expectedGameWins', relation.expected_game_wins
              )
              order by relation.related_name, relation.related_user_id, relation.kind
            )
            from relationship_by_period as relation
            where relation.period = period.period
          ), '[]'::jsonb),
          'ratingHistory', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'matchId', point.match_id,
                'occurredAt', point.occurred_at,
                'rating', point.rating,
                'rd', point.rd_after,
                'performanceSd', point.performance_sd_after,
                'ratingDelta', point.rating_delta
              )
              order by point.occurred_at, point.match_id
            )
            from selected_chart as point
            where point.period = period.period
          ), '[]'::jsonb),
          'ratingHistoryBounds', case
            when summary.match_count = 0 then jsonb_build_array(0, 1)
            else (
              select jsonb_build_array(
                min(point.rating - point.performance_sd_after) - 20,
                max(point.rating + point.performance_sd_after) + 20
              )
              from chart_points as point
              where point.period = period.period
            )
          end
        )
      )
      from period_defs as period
      join subject_summary as summary on summary.period = period.period
      join encounter_counts as encounter on encounter.period = period.period
      left join cohort_json as cohort on cohort.period = period.period
    )
  )
  into v_payload;

  if (v_payload->>'_invalidConsistency')::boolean then
    raise exception using
      errcode = 'MRVAL',
      message = 'Invalid historical consistency coverage';
  end if;

  return v_base || (v_payload - '_invalidConsistency');
end;
$$;

revoke all on function public.get_player_analytics_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_player_analytics_v2(uuid, uuid)
  to authenticated;

comment on function public.get_player_analytics_v2(uuid, uuid) is
  'Returns version-guarded aggregate analytics with bounded canonical chart samples.';

create function public.get_player_analytics_history_v2(
  p_group_id uuid,
  p_user_id uuid,
  p_period text,
  p_as_of timestamptz,
  p_rating_version bigint,
  p_cursor_occurred_at timestamptz,
  p_cursor_match_id uuid,
  p_page_size integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_group public.groups%rowtype;
  v_as_of timestamptz;
  v_rating_version bigint;
  v_cutoff_at timestamptz;
  v_payload jsonb;
begin
  if v_actor is null then
    raise exception using errcode = 'MR401', message = 'Authentication required';
  end if;
  if p_period is null or p_period not in ('all', '30d', '90d', '1y') then
    raise exception using errcode = 'MRVAL', message = 'Invalid analytics period';
  end if;
  if p_page_size is null or p_page_size < 1 or p_page_size > 50 then
    raise exception using errcode = 'MRVAL', message = 'Invalid analytics history page size';
  end if;
  if (p_as_of is null) <> (p_rating_version is null) then
    raise exception using errcode = 'MRVAL', message = 'Incomplete analytics snapshot guard';
  end if;
  if (p_cursor_occurred_at is null) <> (p_cursor_match_id is null) then
    raise exception using errcode = 'MRVAL', message = 'Incomplete analytics history cursor';
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

  if not found then
    raise exception using
      errcode = 'MR403',
      message = 'Analytics history is inaccessible';
  end if;

  if v_group.analytics_applied_version is distinct from v_group.rating_applied_version
    or (
      p_rating_version is not null
      and p_rating_version is distinct from v_group.rating_applied_version
    ) then
    raise exception using errcode = 'MR409', message = 'Rating version changed';
  end if;

  v_as_of := coalesce(p_as_of, statement_timestamp());
  v_rating_version := v_group.rating_applied_version;
  v_cutoff_at := case p_period
    when '30d' then v_as_of - interval '30 days'
    when '90d' then v_as_of - interval '90 days'
    when '1y' then v_as_of - interval '365 days'
    else null
  end;

  with candidate_matches as materialized (
    select
      event.match_id,
      event.revision_id,
      min(event.occurred_at) as occurred_at
    from public.rating_events as event
    join public.matches as match
      on match.id = event.match_id
      and match.group_id = event.group_id
      and match.active_revision_id = event.revision_id
    where event.group_id = p_group_id
      and event.user_id = p_user_id
      and event.occurred_at <= v_as_of
      and (v_cutoff_at is null or event.occurred_at >= v_cutoff_at)
      and (
        p_cursor_occurred_at is null
        or (event.occurred_at, event.match_id)
          < (p_cursor_occurred_at, p_cursor_match_id)
      )
    group by event.match_id, event.revision_id
    order by occurred_at desc, event.match_id desc
    limit p_page_size + 1
  ), numbered_matches as (
    select
      candidate.*,
      row_number() over (
        order by candidate.occurred_at desc, candidate.match_id desc
      ) as page_position
    from candidate_matches as candidate
  ), page_matches as materialized (
    select *
    from numbered_matches
    where page_position <= p_page_size
  ), exact_points as materialized (
    select
      candidate.match_id,
      candidate.occurred_at,
      floor(state.rating_after + 0.5)::double precision as point_rating,
      state.rd_after,
      consistency.performance_sd_after,
      (
        floor((state.rating_after - state.rating_before) * 100 + 0.5) / 100.0
      )::double precision as point_delta
    from page_matches as candidate
    cross join lateral (
      select
        (array_agg(event.before_rating::double precision order by event.sequence))[1]
          as rating_before,
        (array_agg(event.after_rating::double precision order by event.sequence desc))[1]
          as rating_after,
        (array_agg(event.after_rd::double precision order by event.sequence desc))[1]
          as rd_after
      from public.rating_events as event
      where event.group_id = p_group_id
        and event.match_id = candidate.match_id
        and event.revision_id = candidate.revision_id
        and event.user_id = p_user_id
    ) as state
    left join lateral (
      select case
        when event.after_log_mean between ln(0.5) and ln(9007199254740991)
          then round(exp(event.after_log_mean))::bigint
        else null
      end as performance_sd_after
      from public.consistency_events as event
      where event.group_id = p_group_id
        and event.match_id = candidate.match_id
        and event.revision_id = candidate.revision_id
        and event.user_id = p_user_id
    ) as consistency on true
  )
  select jsonb_build_object(
    '_invalidConsistency', exists (
      select 1
      from exact_points
      where performance_sd_after is null or performance_sd_after <= 0
    ),
    'asOf', v_as_of,
    'ratingVersion', v_rating_version::text,
    'points', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'matchId', fact.match_id,
          'occurredAt', fact.occurred_at,
          'rating', fact.point_rating,
          'rd', fact.rd_after,
          'performanceSd', fact.performance_sd_after,
          'ratingDelta', fact.point_delta
        )
        order by fact.occurred_at desc, fact.match_id desc
      )
      from exact_points as fact
    ), '[]'::jsonb),
    'hasMore', exists (
      select 1
      from numbered_matches
      where page_position > p_page_size
    )
  )
  into v_payload;

  if (v_payload->>'_invalidConsistency')::boolean then
    raise exception using
      errcode = 'MRVAL',
      message = 'Invalid historical consistency coverage';
  end if;

  return v_payload - '_invalidConsistency';
end;
$$;

revoke all on function public.get_player_analytics_history_v2(
  uuid, uuid, text, timestamptz, bigint, timestamptz, uuid, integer
) from public, anon, authenticated;
grant execute on function public.get_player_analytics_history_v2(
  uuid, uuid, text, timestamptz, bigint, timestamptz, uuid, integer
) to authenticated;

comment on function public.get_player_analytics_history_v2(
  uuid, uuid, text, timestamptz, bigint, timestamptz, uuid, integer
) is
  'Returns one exact canonical rating-history page bound to player, group, period, snapshot time, and rating version.';
