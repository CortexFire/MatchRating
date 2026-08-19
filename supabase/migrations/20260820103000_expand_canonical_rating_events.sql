-- Expand rating_events into a canonical active-revision player-game fact.
-- New input columns remain nullable until the prefix-zero production backfill is complete.

alter table public.rating_events
  add column if not exists game_id uuid references public.match_games(id) on delete cascade,
  add column if not exists game_number integer,
  add column if not exists occurred_at timestamptz,
  add column if not exists format public.match_format,
  add column if not exists team public.team_code,
  add column if not exists expected_score numeric(10, 9),
  add column if not exists actual_score smallint,
  add column if not exists points_for integer,
  add column if not exists points_against integer,
  add column if not exists rating_delta numeric(11, 4)
    generated always as (after_rating - before_rating) stored,
  add column if not exists expectation_residual numeric(10, 9)
    generated always as (actual_score::numeric - expected_score) stored,
  add column if not exists point_delta integer
    generated always as (points_for - points_against) stored;

create index if not exists rating_events_group_user_occurred_idx
  on public.rating_events (group_id, user_id, occurred_at, sequence);

create index if not exists rating_events_group_game_team_idx
  on public.rating_events (group_id, game_id, team);

create or replace function public.begin_incremental_rating_rebuild(
  p_job_id uuid,
  p_dispatch_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.rating_rebuild_jobs%rowtype;
  v_boundary_submitted_at timestamptz;
  v_boundary_match_id uuid;
  v_prefix_valid boolean := false;
  v_prefix_event_count integer := 0;
  v_initial_ratings jsonb := '[]'::jsonb;
  v_history jsonb := '[]'::jsonb;
begin
  select * into v_job
  from public.rating_rebuild_jobs
  where id = p_job_id
  for update;

  if not found
    or v_job.status not in ('queued', 'running')
    or v_job.dispatch_token <> p_dispatch_token
    or v_job.dispatch_lease_expires_at <= now() then
    return null;
  end if;

  update public.rating_rebuild_jobs
  set
    status = 'running',
    started_at = coalesce(started_at, now()),
    attempt_count = attempt_count + 1,
    updated_at = now()
  where id = p_job_id;

  if v_job.from_match_id is not null then
    select submitted_at, id
    into v_boundary_submitted_at, v_boundary_match_id
    from public.matches
    where id = v_job.from_match_id and group_id = v_job.group_id;
  end if;

  if v_boundary_match_id is not null then
    with prefix_matches as (
      select m.id, m.active_revision_id, m.submitted_at, mr.format
      from public.matches m
      join public.match_revisions mr on mr.id = m.active_revision_id
      where m.group_id = v_job.group_id
        and (m.submitted_at, m.id) < (v_boundary_submitted_at, v_boundary_match_id)
    ), expected_facts as (
      select
        match.id as match_id,
        match.active_revision_id as revision_id,
        game.id as game_id,
        game.game_number,
        match.submitted_at as occurred_at,
        match.format,
        participant.team,
        participant.user_id,
        case when game.winner_team = participant.team then 1 else 0 end::smallint as actual_score,
        case when participant.team = 'A' then game.team_a_score else game.team_b_score end as points_for,
        case when participant.team = 'A' then game.team_b_score else game.team_a_score end as points_against
      from prefix_matches match
      join public.match_games game on game.revision_id = match.active_revision_id
      join public.match_participants participant on participant.revision_id = match.active_revision_id
    ), compared as (
      select
        count(*) filter (where event.id is null)::integer as missing_count,
        count(*)::integer as expected_count
      from expected_facts expected
      left join public.rating_events event
        on event.group_id = v_job.group_id
        and event.game_id = expected.game_id
        and event.user_id = expected.user_id
        and event.match_id = expected.match_id
        and event.revision_id = expected.revision_id
        and event.game_number = expected.game_number
        and event.occurred_at = expected.occurred_at
        and event.format = expected.format
        and event.team = expected.team
        and event.actual_score = expected.actual_score
        and event.points_for = expected.points_for
        and event.points_against = expected.points_against
        and event.expected_score between 0 and 1
        and event.before_games_played >= 0
        and event.after_games_played = event.before_games_played + 1
    ), actual as (
      select
        count(*)::integer as event_count,
        count(distinct event.sequence)::integer as sequence_count,
        coalesce(min(event.sequence), 1) as minimum_sequence,
        coalesce(max(event.sequence), 0) as maximum_sequence,
        count(*) filter (where expected.game_id is null)::integer as extra_count
      from public.rating_events event
      left join expected_facts expected
        on expected.game_id = event.game_id and expected.user_id = event.user_id
      where event.group_id = v_job.group_id
        and event.match_id in (select id from prefix_matches)
    )
    select
      compared.expected_count > 0
        and compared.missing_count = 0
        and actual.extra_count = 0
        and actual.event_count = compared.expected_count
        and actual.sequence_count = compared.expected_count
        and actual.minimum_sequence = 1
        and actual.maximum_sequence = compared.expected_count,
      compared.expected_count
    into v_prefix_valid, v_prefix_event_count
    from compared, actual;
  end if;

  if not coalesce(v_prefix_valid, false) then
    v_boundary_submitted_at := null;
    v_boundary_match_id := null;
    v_prefix_event_count := 0;
  else
    with latest_events as (
      select distinct on (event.user_id)
        event.user_id,
        event.after_rating,
        event.after_rd,
        event.after_volatility,
        event.after_games_played
      from public.rating_events event
      where event.group_id = v_job.group_id
        and event.sequence <= v_prefix_event_count
      order by event.user_id, event.sequence desc
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'userId', user_id,
          'rating', after_rating,
          'rd', after_rd,
          'volatility', after_volatility,
          'gamesPlayed', after_games_played
        ) order by user_id
      ),
      '[]'::jsonb
    )
    into v_initial_ratings
    from latest_events;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'revisionId', mr.id,
        'submittedAt', m.submitted_at,
        'format', mr.format,
        'teamAUserIds', participants.team_a,
        'teamBUserIds', participants.team_b,
        'games', games.items
      ) order by m.submitted_at, m.id
    ),
    '[]'::jsonb
  )
  into v_history
  from public.matches m
  join public.match_revisions mr on mr.id = m.active_revision_id
  join lateral (
    select
      jsonb_agg(user_id order by slot) filter (where team = 'A') as team_a,
      jsonb_agg(user_id order by slot) filter (where team = 'B') as team_b
    from public.match_participants
    where revision_id = mr.id
  ) participants on true
  join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'gameId', id,
        'gameNumber', game_number,
        'teamAScore', team_a_score,
        'teamBScore', team_b_score,
        'winnerTeam', winner_team
      ) order by game_number
    ) as items
    from public.match_games
    where revision_id = mr.id
  ) games on true
  where m.group_id = v_job.group_id
    and (
      v_boundary_match_id is null
      or (m.submitted_at, m.id) >= (v_boundary_submitted_at, v_boundary_match_id)
    );

  return jsonb_build_object(
    'groupId', v_job.group_id,
    'jobId', v_job.id,
    'targetVersion', v_job.target_version,
    'prefixEventCount', v_prefix_event_count,
    'initialRatings', v_initial_ratings,
    'history', v_history
  );
end;
$$;

create or replace function public.apply_incremental_rating_rebuild(
  p_job_id uuid,
  p_expected_version bigint,
  p_prefix_event_count integer,
  p_ratings jsonb,
  p_events jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_job public.rating_rebuild_jobs%rowtype;
  v_current bigint;
begin
  select group_id into v_group_id
  from public.rating_rebuild_jobs
  where id = p_job_id;
  if not found then
    raise exception using errcode = 'MR404', message = 'Rating job not found';
  end if;

  select rating_input_version into v_current
  from public.groups
  where id = v_group_id
  for update;

  select * into v_job
  from public.rating_rebuild_jobs
  where id = p_job_id and group_id = v_group_id
  for update;
  if not found then
    raise exception using errcode = 'MR404', message = 'Rating job not found';
  end if;

  if v_current <> p_expected_version or v_job.target_version <> p_expected_version then
    return jsonb_build_object('status', 'stale', 'targetVersion', v_current);
  end if;

  if v_job.status <> 'running' then
    raise exception using errcode = 'MRVAL', message = 'Rating job is not running';
  end if;

  if p_prefix_event_count < 0
    or jsonb_typeof(p_ratings) is distinct from 'array'
    or jsonb_typeof(p_events) is distinct from 'array' then
    raise exception using errcode = 'MRVAL', message = 'Invalid canonical rating projection';
  end if;

  create temporary table if not exists pg_temp.incremental_expected_facts (
    sequence bigint,
    match_id uuid,
    revision_id uuid,
    game_id uuid,
    game_number integer,
    occurred_at timestamptz,
    format public.match_format,
    team public.team_code,
    user_id uuid,
    actual_score smallint,
    points_for integer,
    points_against integer
  ) on commit drop;
  truncate pg_temp.incremental_expected_facts;

  insert into pg_temp.incremental_expected_facts
  select
    row_number() over (
      order by match.submitted_at, match.id, game.game_number, participant.team, participant.slot
    ),
    match.id,
    revision.id,
    game.id,
    game.game_number,
    match.submitted_at,
    revision.format,
    participant.team,
    participant.user_id,
    case when game.winner_team = participant.team then 1 else 0 end::smallint,
    case when participant.team = 'A' then game.team_a_score else game.team_b_score end,
    case when participant.team = 'A' then game.team_b_score else game.team_a_score end
  from public.matches match
  join public.match_revisions revision on revision.id = match.active_revision_id
  join public.match_games game on game.revision_id = revision.id
  join public.match_participants participant on participant.revision_id = revision.id
  where match.group_id = v_group_id;

  if p_prefix_event_count > (select count(*) from pg_temp.incremental_expected_facts)
    or (select count(*) from public.rating_events where group_id = v_group_id and sequence <= p_prefix_event_count)
      <> p_prefix_event_count
    or exists (
      select 1
      from pg_temp.incremental_expected_facts expected
      left join public.rating_events event
        on event.group_id = v_group_id
        and event.sequence = expected.sequence
        and event.match_id = expected.match_id
        and event.revision_id = expected.revision_id
        and event.game_id = expected.game_id
        and event.game_number = expected.game_number
        and event.occurred_at = expected.occurred_at
        and event.format = expected.format
        and event.team = expected.team
        and event.user_id = expected.user_id
        and event.actual_score = expected.actual_score
        and event.points_for = expected.points_for
        and event.points_against = expected.points_against
      where expected.sequence <= p_prefix_event_count and event.id is null
    )
    or exists (
      select 1
      from public.rating_events event
      where event.group_id = v_group_id
        and event.sequence <= p_prefix_event_count
        and (
          event.expected_score::text in ('NaN', 'Infinity', '-Infinity')
          or event.expected_score < 0
          or event.expected_score > 1
          or event.actual_score not in (0, 1)
          or event.points_for < 0
          or event.points_against < 0
          or event.before_games_played < 0
          or event.after_games_played <> event.before_games_played + 1
        )
    )
    or exists (
      select 1
      from public.rating_events event
      where event.group_id = v_group_id
        and event.sequence <= p_prefix_event_count
        and event.format = 'doubles'
      group by event.game_id
      having
        max(event.expected_score) filter (where event.team = 'A')
          <> min(event.expected_score) filter (where event.team = 'A')
        or max(event.expected_score) filter (where event.team = 'B')
          <> min(event.expected_score) filter (where event.team = 'B')
        or abs(
          max(event.expected_score) filter (where event.team = 'A')
          + max(event.expected_score) filter (where event.team = 'B') - 1
        ) > 0.000000001
    ) then
    raise exception using errcode = 'MRVAL', message = 'Invalid preserved rating prefix';
  end if;

  create temporary table if not exists pg_temp.incremental_events (
    match_id uuid,
    revision_id uuid,
    game_id uuid,
    game_number integer,
    occurred_at timestamptz,
    format public.match_format,
    team public.team_code,
    user_id uuid,
    sequence integer,
    expected_score numeric,
    actual_score smallint,
    points_for integer,
    points_against integer,
    before_rating numeric,
    before_rd numeric,
    before_volatility numeric,
    before_games_played integer,
    after_rating numeric,
    after_rd numeric,
    after_volatility numeric,
    after_games_played integer
  ) on commit drop;
  truncate pg_temp.incremental_events;

  insert into pg_temp.incremental_events
  select
    event."matchId",
    event."revisionId",
    event."gameId",
    event."gameNumber",
    event."occurredAt",
    event.format,
    event.team,
    event."userId",
    event.sequence,
    event."expectedScore",
    event."actualScore",
    event."pointsFor",
    event."pointsAgainst",
    (event.before->>'rating')::numeric,
    (event.before->>'rd')::numeric,
    (event.before->>'volatility')::numeric,
    (event.before->>'gamesPlayed')::integer,
    (event.after->>'rating')::numeric,
    (event.after->>'rd')::numeric,
    (event.after->>'volatility')::numeric,
    (event.after->>'gamesPlayed')::integer
  from jsonb_to_recordset(p_events) as event(
    "matchId" uuid,
    "revisionId" uuid,
    "gameId" uuid,
    "gameNumber" integer,
    "occurredAt" timestamptz,
    format public.match_format,
    team public.team_code,
    "userId" uuid,
    sequence integer,
    "expectedScore" numeric,
    "actualScore" smallint,
    "pointsFor" integer,
    "pointsAgainst" integer,
    before jsonb,
    after jsonb
  );

  if (select count(*) from pg_temp.incremental_events)
      <> (select count(*) - p_prefix_event_count from pg_temp.incremental_expected_facts)
    or exists (
      select 1
      from pg_temp.incremental_events
      group by game_id, user_id
      having count(*) > 1
    )
    or exists (
      select 1
      from pg_temp.incremental_expected_facts expected
      left join pg_temp.incremental_events event
        on event.sequence = expected.sequence
        and event.match_id = expected.match_id
        and event.revision_id = expected.revision_id
        and event.game_id = expected.game_id
        and event.game_number = expected.game_number
        and event.occurred_at = expected.occurred_at
        and event.format = expected.format
        and event.team = expected.team
        and event.user_id = expected.user_id
        and event.actual_score = expected.actual_score
        and event.points_for = expected.points_for
        and event.points_against = expected.points_against
      where expected.sequence > p_prefix_event_count and event.game_id is null
    )
    or exists (
      select 1
      from pg_temp.incremental_events
      where match_id is null or revision_id is null or game_id is null
        or game_number is null or game_number < 1 or occurred_at is null
        or format is null or team is null or user_id is null or sequence is null
        or expected_score is null or expected_score::text in ('NaN', 'Infinity', '-Infinity')
        or expected_score < 0 or expected_score > 1
        or actual_score not in (0, 1)
        or points_for is null or points_for < 0
        or points_against is null or points_against < 0
        or before_rating is null or before_rating::text in ('NaN', 'Infinity', '-Infinity')
        or before_rd is null or before_rd::text in ('NaN', 'Infinity', '-Infinity') or before_rd <= 0
        or before_volatility is null or before_volatility::text in ('NaN', 'Infinity', '-Infinity') or before_volatility <= 0
        or before_games_played is null or before_games_played < 0
        or after_rating is null or after_rating::text in ('NaN', 'Infinity', '-Infinity')
        or after_rd is null or after_rd::text in ('NaN', 'Infinity', '-Infinity') or after_rd <= 0
        or after_volatility is null or after_volatility::text in ('NaN', 'Infinity', '-Infinity') or after_volatility <= 0
        or after_games_played <> before_games_played + 1
    )
    or exists (
      select 1
      from pg_temp.incremental_events
      where format = 'doubles'
      group by game_id
      having
        max(expected_score) filter (where team = 'A')
          <> min(expected_score) filter (where team = 'A')
        or max(expected_score) filter (where team = 'B')
          <> min(expected_score) filter (where team = 'B')
        or abs(
          max(expected_score) filter (where team = 'A')
          + max(expected_score) filter (where team = 'B') - 1
        ) > 0.000000001
    )
    or exists (
      with combined_events as (
        select
          user_id,
          sequence,
          null::numeric as before_rating,
          null::numeric as before_rd,
          null::numeric as before_volatility,
          null::integer as before_games_played,
          after_rating,
          after_rd,
          after_volatility,
          after_games_played,
          false as is_incoming
        from public.rating_events
        where group_id = v_group_id and sequence <= p_prefix_event_count
        union all
        select
          user_id,
          sequence,
          before_rating,
          before_rd,
          before_volatility,
          before_games_played,
          after_rating,
          after_rd,
          after_volatility,
          after_games_played,
          true as is_incoming
        from pg_temp.incremental_events
      ), ordered_events as (
        select
          combined.*,
          lag(after_rating) over player_history as previous_rating,
          lag(after_rd) over player_history as previous_rd,
          lag(after_volatility) over player_history as previous_volatility,
          lag(after_games_played) over player_history as previous_games_played
        from combined_events combined
        window player_history as (partition by combined.user_id order by combined.sequence)
      )
      select 1
      from ordered_events
      where is_incoming and (
        (
        previous_games_played is null
        and (
          round(before_rating, 4) <> 1500.0000
          or round(before_rd, 4) <> 350.0000
          or round(before_volatility, 8) <> 0.06000000
          or before_games_played <> 0
        )
      ) or (
        previous_games_played is not null
        and (
          round(before_rating, 4) <> round(previous_rating, 4)
          or round(before_rd, 4) <> round(previous_rd, 4)
          or round(before_volatility, 8) <> round(previous_volatility, 8)
          or before_games_played <> previous_games_played
        )
      )
      )
    ) then
    raise exception using errcode = 'MRVAL', message = 'Invalid canonical rating events';
  end if;

  create temporary table if not exists pg_temp.incremental_ratings (
    user_id uuid,
    rating numeric,
    rd numeric,
    volatility numeric,
    games_played integer,
    rank integer
  ) on commit drop;
  truncate pg_temp.incremental_ratings;

  insert into pg_temp.incremental_ratings
  select
    rating."userId",
    rating.rating,
    rating.rd,
    rating.volatility,
    rating."gamesPlayed",
    rating.rank
  from jsonb_to_recordset(p_ratings) as rating(
    "userId" uuid,
    rating numeric,
    rd numeric,
    volatility numeric,
    "gamesPlayed" integer,
    rank integer
  );

  if exists (
      select 1 from pg_temp.incremental_ratings
      where user_id is null
        or rating is null or rating::text in ('NaN', 'Infinity', '-Infinity')
        or rd is null or rd::text in ('NaN', 'Infinity', '-Infinity') or rd <= 0
        or volatility is null or volatility::text in ('NaN', 'Infinity', '-Infinity') or volatility <= 0
        or games_played is null or games_played < 0
        or rank is null or rank < 1
    )
    or exists (
      select 1 from pg_temp.incremental_ratings group by user_id having count(*) > 1
    )
    or (select count(*) from pg_temp.incremental_ratings)
      <> (select count(distinct user_id) from pg_temp.incremental_expected_facts)
    or exists (
      select 1
      from (select distinct user_id from pg_temp.incremental_expected_facts) expected_user
      left join pg_temp.incremental_ratings rating on rating.user_id = expected_user.user_id
      where rating.user_id is null
    )
    or exists (
      select 1
      from (
        select
          user_id,
          rank,
          row_number() over (order by rating desc, user_id)::integer as expected_rank
        from pg_temp.incremental_ratings
      ) ranked
      where rank <> expected_rank
    )
    or exists (
      with combined_events as (
        select
          user_id,
          sequence,
          after_rating,
          after_rd,
          after_volatility,
          after_games_played
        from public.rating_events
        where group_id = v_group_id and sequence <= p_prefix_event_count
        union all
        select
          user_id,
          sequence,
          after_rating,
          after_rd,
          after_volatility,
          after_games_played
        from pg_temp.incremental_events
      ), latest_events as (
        select distinct on (user_id)
          user_id,
          after_rating,
          after_rd,
          after_volatility,
          after_games_played
        from combined_events
        order by user_id, sequence desc
      )
      select 1
      from latest_events latest
      left join pg_temp.incremental_ratings rating on rating.user_id = latest.user_id
      where rating.user_id is null
        or round(rating.rating, 4) <> round(latest.after_rating, 4)
        or round(rating.rd, 4) <> round(latest.after_rd, 4)
        or round(rating.volatility, 8) <> round(latest.after_volatility, 8)
        or rating.games_played <> latest.after_games_played
    ) then
    raise exception using errcode = 'MRVAL', message = 'Invalid canonical rating states';
  end if;

  delete from public.rating_events
  where group_id = v_group_id and sequence > p_prefix_event_count;

  delete from public.group_rating_states where group_id = v_group_id;
  insert into public.group_rating_states (
    group_id, user_id, rating, rd, volatility, games_played, rank
  )
  select v_group_id, user_id, rating, rd, volatility, games_played, rank
  from pg_temp.incremental_ratings;

  insert into public.rating_events (
    group_id, match_id, revision_id, game_id, game_number, occurred_at,
    format, team, user_id, sequence, expected_score, actual_score,
    points_for, points_against,
    before_rating, before_rd, before_volatility, before_games_played,
    after_rating, after_rd, after_volatility, after_games_played
  )
  select
    v_group_id, match_id, revision_id, game_id, game_number, occurred_at,
    format, team, user_id, sequence, expected_score, actual_score,
    points_for, points_against,
    before_rating, before_rd, before_volatility, before_games_played,
    after_rating, after_rd, after_volatility, after_games_played
  from pg_temp.incremental_events
  order by sequence;

  update public.groups
  set rating_applied_version = p_expected_version
  where id = v_group_id;

  update public.rating_rebuild_jobs
  set status = 'completed', completed_at = now(), error = null, updated_at = now()
  where id = p_job_id;

  return jsonb_build_object('status', 'completed');
end;
$$;

revoke all on function public.begin_incremental_rating_rebuild(uuid, uuid) from public, anon, authenticated;
revoke all on function public.apply_incremental_rating_rebuild(uuid, bigint, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.begin_incremental_rating_rebuild(uuid, uuid) to service_role;
grant execute on function public.apply_incremental_rating_rebuild(uuid, bigint, integer, jsonb, jsonb) to service_role;
