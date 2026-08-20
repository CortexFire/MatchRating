alter table public.group_rating_states
  add column consistency_log_mean numeric(18, 12) not null default 5.298317366548,
  add column consistency_log_variance numeric(18, 12) not null default 0.122500000000,
  add column consistency_matches_played integer not null default 0,
  add column consistency_config_fingerprint text not null
    default 'consistency-v1:200:0.35:0.02',
  add constraint group_rating_states_consistency_log_mean_check
    check (consistency_log_mean::text not in ('NaN', 'Infinity', '-Infinity')),
  add constraint group_rating_states_consistency_log_variance_check
    check (
      consistency_log_variance::text not in ('NaN', 'Infinity', '-Infinity')
      and consistency_log_variance > 0
    ),
  add constraint group_rating_states_consistency_matches_played_check
    check (consistency_matches_played >= 0),
  add constraint group_rating_states_consistency_config_fingerprint_check
    check (
      consistency_config_fingerprint = btrim(
        consistency_config_fingerprint,
        U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
      )
      and char_length(consistency_config_fingerprint) between 1 and 200
    );

create table public.consistency_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  revision_id uuid not null references public.match_revisions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  occurred_at timestamptz not null,
  format public.match_format not null,
  team public.team_code not null,
  sequence integer not null,
  expected_score numeric(10, 9) not null,
  actual_score smallint not null,
  before_log_mean numeric(18, 12) not null,
  before_log_variance numeric(18, 12) not null,
  before_matches_played integer not null,
  after_log_mean numeric(18, 12) not null,
  after_log_variance numeric(18, 12) not null,
  after_matches_played integer not null,
  config_fingerprint text not null default 'consistency-v1:200:0.35:0.02',
  created_at timestamptz not null default now(),
  constraint consistency_events_group_match_user_key unique (group_id, match_id, user_id),
  constraint consistency_events_group_sequence_key unique (group_id, sequence),
  constraint consistency_events_expected_score_check
    check (
      expected_score::text not in ('NaN', 'Infinity', '-Infinity')
      and expected_score between 0 and 1
    ),
  constraint consistency_events_actual_score_check check (actual_score in (0, 1)),
  constraint consistency_events_before_state_check
    check (
      before_log_mean::text not in ('NaN', 'Infinity', '-Infinity')
      and before_log_variance::text not in ('NaN', 'Infinity', '-Infinity')
      and before_log_variance > 0
      and before_matches_played >= 0
    ),
  constraint consistency_events_after_state_check
    check (
      after_log_mean::text not in ('NaN', 'Infinity', '-Infinity')
      and after_log_variance::text not in ('NaN', 'Infinity', '-Infinity')
      and after_log_variance > 0
    ),
  constraint consistency_events_matches_played_step_check
    check (after_matches_played = before_matches_played + 1),
  constraint consistency_events_config_fingerprint_check
    check (
      config_fingerprint = btrim(
        config_fingerprint,
        U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
      )
      and char_length(config_fingerprint) between 1 and 200
    )
);

create index consistency_events_group_match_sequence_idx
  on public.consistency_events (group_id, match_id, sequence);

create index consistency_events_group_user_sequence_desc_idx
  on public.consistency_events (group_id, user_id, sequence desc);

alter table public.consistency_events enable row level security;

grant select on table public.consistency_events to authenticated;
grant select, insert, update, delete on table public.consistency_events to service_role;

create function private.has_active_group_membership(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_memberships membership
    where membership.group_id = p_group_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and membership.left_at is null
  );
$$;

revoke all on function private.has_active_group_membership(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.has_active_group_membership(uuid) to authenticated;

create policy "members can read consistency events"
  on public.consistency_events for select to authenticated
  using (private.has_active_group_membership(group_id));

create function public.begin_incremental_rating_rebuild_v2(
  p_job_id uuid,
  p_dispatch_token uuid,
  p_consistency_config_fingerprint text default 'consistency-v1:200:0.35:0.02'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_job public.rating_rebuild_jobs%rowtype;
  v_boundary_submitted_at timestamptz;
  v_boundary_match_id uuid;
  v_consistency_prefix_valid boolean := false;
  v_consistency_prefix_count integer := 0;
  v_initial_ratings jsonb := '[]'::jsonb;
  v_history jsonb := '[]'::jsonb;
begin
  if p_consistency_config_fingerprint is null
    or p_consistency_config_fingerprint <> btrim(
      p_consistency_config_fingerprint,
      U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
    )
    or char_length(p_consistency_config_fingerprint) not between 1 and 200 then
    raise exception using errcode = 'MRVAL', message = 'Invalid consistency config fingerprint';
  end if;

  v_result := public.begin_incremental_rating_rebuild(p_job_id, p_dispatch_token);
  if v_result is null then
    return null;
  end if;

  select * into strict v_job
  from public.rating_rebuild_jobs
  where id = p_job_id;

  if coalesce((v_result->>'prefixEventCount')::integer, 0) > 0
    and v_job.from_match_id is not null then
    select submitted_at, id
    into v_boundary_submitted_at, v_boundary_match_id
    from public.matches
    where id = v_job.from_match_id and group_id = v_job.group_id;
  end if;

  if v_boundary_match_id is not null then
    with prefix_matches as (
      select match.id, match.active_revision_id, match.submitted_at, revision.format
      from public.matches match
      join public.match_revisions revision on revision.id = match.active_revision_id
      where match.group_id = v_job.group_id
        and (match.submitted_at, match.id) < (v_boundary_submitted_at, v_boundary_match_id)
    ), expected_facts as (
      select
        row_number() over (
          order by match.submitted_at, match.id, participant.team, participant.slot
        )::integer as sequence,
        match.id as match_id,
        match.active_revision_id as revision_id,
        match.submitted_at as occurred_at,
        match.format,
        participant.team,
        participant.user_id,
        case when outcome.winner_team = participant.team then 1 else 0 end::smallint as actual_score
      from prefix_matches match
      join public.match_participants participant
        on participant.revision_id = match.active_revision_id
      join lateral (
        select case
          when count(*) filter (where game.winner_team = 'A')
            > count(*) filter (where game.winner_team = 'B') then 'A'::public.team_code
          else 'B'::public.team_code
        end as winner_team
        from public.match_games game
        where game.revision_id = match.active_revision_id
      ) outcome on true
    ), compared as (
      select
        count(*)::integer as expected_count,
        count(*) filter (where event.id is null)::integer as missing_count
      from expected_facts expected
      left join public.consistency_events event
        on event.group_id = v_job.group_id
        and event.sequence = expected.sequence
        and event.match_id = expected.match_id
        and event.revision_id = expected.revision_id
        and event.occurred_at = expected.occurred_at
        and event.format = expected.format
        and event.team = expected.team
        and event.user_id = expected.user_id
        and event.actual_score = expected.actual_score
    ), actual as (
      select
        count(*)::integer as event_count,
        count(distinct event.sequence)::integer as sequence_count,
        coalesce(min(event.sequence), 1) as minimum_sequence,
        coalesce(max(event.sequence), 0) as maximum_sequence
      from public.consistency_events event
      where event.group_id = v_job.group_id
        and event.match_id in (select id from prefix_matches)
    ), invalid_state as (
      select exists (
        select 1
        from public.consistency_events event
        where event.group_id = v_job.group_id
          and event.match_id in (select id from prefix_matches)
          and (
            event.expected_score::text in ('NaN', 'Infinity', '-Infinity')
            or event.expected_score < 0 or event.expected_score > 1
            or event.actual_score not in (0, 1)
            or event.before_log_mean::text in ('NaN', 'Infinity', '-Infinity')
            or event.before_log_variance::text in ('NaN', 'Infinity', '-Infinity')
            or event.before_log_variance <= 0
            or event.before_matches_played < 0
            or event.after_log_mean::text in ('NaN', 'Infinity', '-Infinity')
            or event.after_log_variance::text in ('NaN', 'Infinity', '-Infinity')
            or event.after_log_variance <= 0
            or event.after_matches_played <> event.before_matches_played + 1
            or event.config_fingerprint <> p_consistency_config_fingerprint
          )
      ) as value
    ), invalid_expectations as (
      select exists (
        select 1
        from public.consistency_events event
        where event.group_id = v_job.group_id
          and event.match_id in (select id from prefix_matches)
        group by event.match_id
        having
          count(distinct event.expected_score) filter (where event.team = 'A') <> 1
          or count(distinct event.expected_score) filter (where event.team = 'B') <> 1
          or abs(
            max(event.expected_score) filter (where event.team = 'A')
            + max(event.expected_score) filter (where event.team = 'B') - 1
          ) > 0.000000001
      ) as value
    ), ordered_events as (
      select
        event.*,
        lag(event.after_log_mean) over player_history as previous_log_mean,
        lag(event.after_log_variance) over player_history as previous_log_variance,
        lag(event.after_matches_played) over player_history as previous_matches_played
      from public.consistency_events event
      where event.group_id = v_job.group_id
        and event.match_id in (select id from prefix_matches)
      window player_history as (partition by event.user_id order by event.sequence)
    ), invalid_transition as (
      select exists (
        select 1
        from ordered_events event
        where (
          event.previous_matches_played is null
          and (
            event.before_matches_played <> 0
            or (
              p_consistency_config_fingerprint = 'consistency-v1:200:0.35:0.02'
              and (
                round(event.before_log_mean, 12) <> 5.298317366548
                or round(event.before_log_variance, 12) <> 0.122500000000
              )
            )
            or (
              p_consistency_config_fingerprint <> 'consistency-v1:200:0.35:0.02'
              and (
                round(event.before_log_mean, 12) is distinct from (
                  select min(round(root.before_log_mean, 12))
                  from ordered_events root
                  where root.previous_matches_played is null
                )
                or round(event.before_log_variance, 12) is distinct from (
                  select min(round(root.before_log_variance, 12))
                  from ordered_events root
                  where root.previous_matches_played is null
                )
              )
            )
          )
        ) or (
          event.previous_matches_played is not null
          and (
            round(event.before_log_mean, 12) <> round(event.previous_log_mean, 12)
            or round(event.before_log_variance, 12) <> round(event.previous_log_variance, 12)
            or event.before_matches_played <> event.previous_matches_played
          )
        )
      ) as value
    )
    select
      compared.expected_count > 0
        and compared.missing_count = 0
        and actual.event_count = compared.expected_count
        and actual.sequence_count = compared.expected_count
        and actual.minimum_sequence = 1
        and actual.maximum_sequence = compared.expected_count
        and not invalid_state.value
        and not invalid_expectations.value
        and not invalid_transition.value,
      compared.expected_count
    into v_consistency_prefix_valid, v_consistency_prefix_count
    from compared, actual, invalid_state, invalid_expectations, invalid_transition;
  end if;

  if coalesce(v_consistency_prefix_valid, false) and exists (
    select 1
    from jsonb_array_elements(v_result->'initialRatings') rating(value)
    left join public.group_rating_states state
      on state.group_id = v_job.group_id
      and state.user_id = (rating.value->>'userId')::uuid
    where state.user_id is null
      or state.consistency_config_fingerprint <> p_consistency_config_fingerprint
  ) then
    v_consistency_prefix_valid := false;
    v_consistency_prefix_count := 0;
  end if;

  if not coalesce(v_consistency_prefix_valid, false) then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', match.id,
          'revisionId', revision.id,
          'submittedAt', match.submitted_at,
          'format', revision.format,
          'teamAUserIds', participants.team_a,
          'teamBUserIds', participants.team_b,
          'games', games.items
        ) order by match.submitted_at, match.id
      ),
      '[]'::jsonb
    )
    into v_history
    from public.matches match
    join public.match_revisions revision on revision.id = match.active_revision_id
    join lateral (
      select
        jsonb_agg(user_id order by slot) filter (where team = 'A') as team_a,
        jsonb_agg(user_id order by slot) filter (where team = 'B') as team_b
      from public.match_participants
      where revision_id = revision.id
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
      where revision_id = revision.id
    ) games on true
    where match.group_id = v_job.group_id;

    return jsonb_build_object(
      'groupId', v_job.group_id,
      'jobId', v_job.id,
      'targetVersion', v_job.target_version,
      'consistencyConfigFingerprint', p_consistency_config_fingerprint,
      'prefixEventCount', 0,
      'prefixConsistencyEventCount', 0,
      'initialRatings', '[]'::jsonb,
      'history', v_history
    );
  end if;

  with latest_events as (
    select distinct on (event.user_id)
      event.user_id,
      event.after_log_mean,
      event.after_log_variance,
      event.after_matches_played
    from public.consistency_events event
    where event.group_id = v_job.group_id
      and event.sequence <= v_consistency_prefix_count
    order by event.user_id, event.sequence desc
  )
  select coalesce(
    jsonb_agg(
      rating.value || jsonb_build_object(
        'logKappaMean', latest.after_log_mean,
        'logKappaVariance', latest.after_log_variance,
        'consistencyMatchesPlayed', latest.after_matches_played
      ) order by rating.value->>'userId'
    ),
    '[]'::jsonb
  )
  into v_initial_ratings
  from jsonb_array_elements(v_result->'initialRatings') rating(value)
  join latest_events latest on latest.user_id = (rating.value->>'userId')::uuid;

  if jsonb_array_length(v_initial_ratings)
    <> jsonb_array_length(v_result->'initialRatings') then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', match.id,
          'revisionId', revision.id,
          'submittedAt', match.submitted_at,
          'format', revision.format,
          'teamAUserIds', participants.team_a,
          'teamBUserIds', participants.team_b,
          'games', games.items
        ) order by match.submitted_at, match.id
      ),
      '[]'::jsonb
    )
    into v_history
    from public.matches match
    join public.match_revisions revision on revision.id = match.active_revision_id
    join lateral (
      select
        jsonb_agg(user_id order by slot) filter (where team = 'A') as team_a,
        jsonb_agg(user_id order by slot) filter (where team = 'B') as team_b
      from public.match_participants
      where revision_id = revision.id
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
      where revision_id = revision.id
    ) games on true
    where match.group_id = v_job.group_id;

    return jsonb_build_object(
      'groupId', v_job.group_id,
      'jobId', v_job.id,
      'targetVersion', v_job.target_version,
      'consistencyConfigFingerprint', p_consistency_config_fingerprint,
      'prefixEventCount', 0,
      'prefixConsistencyEventCount', 0,
      'initialRatings', '[]'::jsonb,
      'history', v_history
    );
  end if;

  return v_result || jsonb_build_object(
    'consistencyConfigFingerprint', p_consistency_config_fingerprint,
    'prefixConsistencyEventCount', v_consistency_prefix_count,
    'initialRatings', v_initial_ratings
  );
end;
$$;

create function public.apply_incremental_rating_rebuild_v2(
  p_job_id uuid,
  p_expected_version bigint,
  p_prefix_event_count integer,
  p_prefix_consistency_event_count integer,
  p_ratings jsonb,
  p_events jsonb,
  p_consistency_events jsonb,
  p_consistency_config_fingerprint text default 'consistency-v1:200:0.35:0.02'
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
  v_rating_result jsonb;
begin
  if p_consistency_config_fingerprint is null
    or p_consistency_config_fingerprint <> btrim(
      p_consistency_config_fingerprint,
      U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
    )
    or char_length(p_consistency_config_fingerprint) not between 1 and 200 then
    raise exception using errcode = 'MRVAL', message = 'Invalid consistency config fingerprint';
  end if;

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

  if p_prefix_event_count is null or p_prefix_event_count < 0
    or p_prefix_consistency_event_count is null or p_prefix_consistency_event_count < 0
    or jsonb_typeof(p_ratings) is distinct from 'array'
    or jsonb_typeof(p_events) is distinct from 'array'
    or jsonb_typeof(p_consistency_events) is distinct from 'array' then
    raise exception using errcode = 'MRVAL', message = 'Invalid canonical consistency projection';
  end if;

  create temporary table if not exists pg_temp.v2_consistency_expected_facts (
    sequence integer,
    match_id uuid,
    revision_id uuid,
    occurred_at timestamptz,
    format public.match_format,
    team public.team_code,
    user_id uuid,
    actual_score smallint
  ) on commit drop;
  truncate pg_temp.v2_consistency_expected_facts;

  insert into pg_temp.v2_consistency_expected_facts
  select
    row_number() over (
      order by match.submitted_at, match.id, participant.team, participant.slot
    )::integer,
    match.id,
    revision.id,
    match.submitted_at,
    revision.format,
    participant.team,
    participant.user_id,
    case when outcome.winner_team = participant.team then 1 else 0 end::smallint
  from public.matches match
  join public.match_revisions revision on revision.id = match.active_revision_id
  join public.match_participants participant on participant.revision_id = revision.id
  join lateral (
    select case
      when count(*) filter (where game.winner_team = 'A')
        > count(*) filter (where game.winner_team = 'B') then 'A'::public.team_code
      else 'B'::public.team_code
    end as winner_team
    from public.match_games game
    where game.revision_id = revision.id
  ) outcome on true
  where match.group_id = v_group_id;

  if p_prefix_consistency_event_count
      > (select count(*) from pg_temp.v2_consistency_expected_facts)
    or exists (
      select 1
      from pg_temp.v2_consistency_expected_facts expected
      group by expected.match_id
      having min(expected.sequence) <= p_prefix_consistency_event_count
        and max(expected.sequence) > p_prefix_consistency_event_count
    )
    or p_prefix_event_count <> (
      select count(*)::integer
      from public.matches match
      join public.match_revisions revision on revision.id = match.active_revision_id
      join public.match_games game on game.revision_id = revision.id
      join public.match_participants participant on participant.revision_id = revision.id
      where match.group_id = v_group_id
        and match.id in (
          select distinct expected.match_id
          from pg_temp.v2_consistency_expected_facts expected
          where expected.sequence <= p_prefix_consistency_event_count
        )
    )
    or (select count(*) from public.consistency_events
        where group_id = v_group_id and sequence <= p_prefix_consistency_event_count)
      <> p_prefix_consistency_event_count
    or (select count(*) from public.consistency_events
        where group_id = v_group_id
          and match_id in (
            select distinct match_id from pg_temp.v2_consistency_expected_facts
            where sequence <= p_prefix_consistency_event_count
          )) <> p_prefix_consistency_event_count
    or (
      p_prefix_consistency_event_count > 0
      and exists (
        select 1
        from (
          select distinct user_id
          from pg_temp.v2_consistency_expected_facts
          where sequence <= p_prefix_consistency_event_count
        ) expected_user
        left join public.group_rating_states state
          on state.group_id = v_group_id
          and state.user_id = expected_user.user_id
        where state.user_id is null
          or state.consistency_config_fingerprint <> p_consistency_config_fingerprint
      )
    )
    or exists (
      select 1
      from pg_temp.v2_consistency_expected_facts expected
      left join public.consistency_events event
        on event.group_id = v_group_id
        and event.sequence = expected.sequence
        and event.match_id = expected.match_id
        and event.revision_id = expected.revision_id
        and event.occurred_at = expected.occurred_at
        and event.format = expected.format
        and event.team = expected.team
        and event.user_id = expected.user_id
        and event.actual_score = expected.actual_score
      where expected.sequence <= p_prefix_consistency_event_count
        and event.id is null
    )
    or exists (
      select 1
      from public.consistency_events event
      where event.group_id = v_group_id
        and event.sequence <= p_prefix_consistency_event_count
        and (
          event.expected_score::text in ('NaN', 'Infinity', '-Infinity')
          or event.expected_score < 0 or event.expected_score > 1
          or event.actual_score not in (0, 1)
          or event.before_log_mean::text in ('NaN', 'Infinity', '-Infinity')
          or event.before_log_variance::text in ('NaN', 'Infinity', '-Infinity')
          or event.before_log_variance <= 0
          or event.before_matches_played < 0
          or event.after_log_mean::text in ('NaN', 'Infinity', '-Infinity')
          or event.after_log_variance::text in ('NaN', 'Infinity', '-Infinity')
          or event.after_log_variance <= 0
          or event.after_matches_played <> event.before_matches_played + 1
          or event.config_fingerprint <> p_consistency_config_fingerprint
        )
    )
    or exists (
      select 1
      from public.consistency_events event
      where event.group_id = v_group_id
        and event.sequence <= p_prefix_consistency_event_count
      group by event.match_id
      having
        count(distinct event.expected_score) filter (where event.team = 'A') <> 1
        or count(distinct event.expected_score) filter (where event.team = 'B') <> 1
        or abs(
          max(event.expected_score) filter (where event.team = 'A')
          + max(event.expected_score) filter (where event.team = 'B') - 1
        ) > 0.000000001
    )
    or exists (
      with ordered_events as (
        select
          event.*,
          lag(event.after_log_mean) over player_history as previous_log_mean,
          lag(event.after_log_variance) over player_history as previous_log_variance,
          lag(event.after_matches_played) over player_history as previous_matches_played
        from public.consistency_events event
        where event.group_id = v_group_id
          and event.sequence <= p_prefix_consistency_event_count
        window player_history as (partition by event.user_id order by event.sequence)
      )
      select 1
      from ordered_events event
      where (
        event.previous_matches_played is null
        and (
          event.before_matches_played <> 0
          or (
            p_consistency_config_fingerprint = 'consistency-v1:200:0.35:0.02'
            and (
              round(event.before_log_mean, 12) <> 5.298317366548
              or round(event.before_log_variance, 12) <> 0.122500000000
            )
          )
          or (
            p_consistency_config_fingerprint <> 'consistency-v1:200:0.35:0.02'
            and (
              round(event.before_log_mean, 12) is distinct from (
                select min(round(root.before_log_mean, 12))
                from ordered_events root
                where root.previous_matches_played is null
              )
              or round(event.before_log_variance, 12) is distinct from (
                select min(round(root.before_log_variance, 12))
                from ordered_events root
                where root.previous_matches_played is null
              )
            )
          )
        )
      ) or (
        event.previous_matches_played is not null
        and (
          round(event.before_log_mean, 12) <> round(event.previous_log_mean, 12)
          or round(event.before_log_variance, 12) <> round(event.previous_log_variance, 12)
          or event.before_matches_played <> event.previous_matches_played
        )
      )
    ) then
    raise exception using errcode = 'MRVAL', message = 'Invalid preserved consistency prefix';
  end if;

  create temporary table if not exists pg_temp.v2_consistency_events (
    match_id uuid,
    revision_id uuid,
    occurred_at timestamptz,
    format public.match_format,
    team public.team_code,
    user_id uuid,
    sequence integer,
    expected_score numeric(10, 9),
    actual_score smallint,
    before_log_mean numeric(18, 12),
    before_log_variance numeric(18, 12),
    before_matches_played integer,
    after_log_mean numeric(18, 12),
    after_log_variance numeric(18, 12),
    after_matches_played integer,
    config_fingerprint text
  ) on commit drop;
  truncate pg_temp.v2_consistency_events;

  begin
    insert into pg_temp.v2_consistency_events
    select
      event."matchId",
      event."revisionId",
      event."occurredAt",
      event.format,
      event.team,
      event."userId",
      event.sequence,
      event."expectedScore",
      event."actualScore",
      (event.before->>'logKappaMean')::numeric,
      (event.before->>'logKappaVariance')::numeric,
      (event.before->>'matchesPlayed')::integer,
      (event.after->>'logKappaMean')::numeric,
      (event.after->>'logKappaVariance')::numeric,
      (event.after->>'matchesPlayed')::integer,
      p_consistency_config_fingerprint
    from jsonb_to_recordset(p_consistency_events) as event(
      "matchId" uuid,
      "revisionId" uuid,
      "occurredAt" timestamptz,
      format public.match_format,
      team public.team_code,
      "userId" uuid,
      sequence integer,
      "expectedScore" numeric,
      "actualScore" smallint,
      before jsonb,
      after jsonb
    );
  exception when others then
    raise exception using errcode = 'MRVAL', message = 'Invalid canonical consistency events';
  end;

  if (select count(*) from pg_temp.v2_consistency_events)
      <> (select count(*) - p_prefix_consistency_event_count
          from pg_temp.v2_consistency_expected_facts)
    or exists (
      select 1 from pg_temp.v2_consistency_events
      group by match_id, user_id having count(*) > 1
    )
    or exists (
      select 1
      from pg_temp.v2_consistency_expected_facts expected
      left join pg_temp.v2_consistency_events event
        on event.sequence = expected.sequence
        and event.match_id = expected.match_id
        and event.revision_id = expected.revision_id
        and event.occurred_at = expected.occurred_at
        and event.format = expected.format
        and event.team = expected.team
        and event.user_id = expected.user_id
        and event.actual_score = expected.actual_score
      where expected.sequence > p_prefix_consistency_event_count
        and event.match_id is null
    )
    or exists (
      select 1
      from pg_temp.v2_consistency_events event
      where event.match_id is null or event.revision_id is null
        or event.occurred_at is null or event.format is null or event.team is null
        or event.user_id is null or event.sequence is null
        or event.expected_score is null
        or event.expected_score::text in ('NaN', 'Infinity', '-Infinity')
        or event.expected_score < 0 or event.expected_score > 1
        or event.actual_score is null or event.actual_score not in (0, 1)
        or event.before_log_mean is null
        or event.before_log_mean::text in ('NaN', 'Infinity', '-Infinity')
        or event.before_log_variance is null
        or event.before_log_variance::text in ('NaN', 'Infinity', '-Infinity')
        or event.before_log_variance <= 0
        or event.before_matches_played is null or event.before_matches_played < 0
        or event.after_log_mean is null
        or event.after_log_mean::text in ('NaN', 'Infinity', '-Infinity')
        or event.after_log_variance is null
        or event.after_log_variance::text in ('NaN', 'Infinity', '-Infinity')
        or event.after_log_variance <= 0
        or event.after_matches_played is null
        or event.after_matches_played is distinct from event.before_matches_played + 1
        or event.config_fingerprint is distinct from p_consistency_config_fingerprint
    )
    or exists (
      with combined_events as (
        select match_id, team, expected_score
        from public.consistency_events
        where group_id = v_group_id
          and sequence <= p_prefix_consistency_event_count
        union all
        select match_id, team, expected_score
        from pg_temp.v2_consistency_events
      )
      select 1
      from combined_events
      group by match_id
      having
        count(distinct expected_score) filter (where team = 'A') <> 1
        or count(distinct expected_score) filter (where team = 'B') <> 1
        or abs(
          max(expected_score) filter (where team = 'A')
          + max(expected_score) filter (where team = 'B') - 1
        ) > 0.000000001
    )
    or exists (
      with combined_events as (
        select
          user_id, sequence,
          before_log_mean, before_log_variance, before_matches_played,
          after_log_mean, after_log_variance, after_matches_played,
          false as is_incoming
        from public.consistency_events
        where group_id = v_group_id
          and sequence <= p_prefix_consistency_event_count
        union all
        select
          user_id, sequence,
          before_log_mean, before_log_variance, before_matches_played,
          after_log_mean, after_log_variance, after_matches_played,
          true as is_incoming
        from pg_temp.v2_consistency_events
      ), ordered_events as (
        select
          event.*,
          lag(event.after_log_mean) over player_history as previous_log_mean,
          lag(event.after_log_variance) over player_history as previous_log_variance,
          lag(event.after_matches_played) over player_history as previous_matches_played
        from combined_events event
        window player_history as (partition by event.user_id order by event.sequence)
      )
      select 1
      from ordered_events event
      where event.is_incoming and (
        (
          event.previous_matches_played is null
          and (
            event.before_matches_played is distinct from 0
            or (
              p_consistency_config_fingerprint = 'consistency-v1:200:0.35:0.02'
              and (
                round(event.before_log_mean, 12) is distinct from 5.298317366548
                or round(event.before_log_variance, 12) is distinct from 0.122500000000
              )
            )
            or (
              p_consistency_config_fingerprint <> 'consistency-v1:200:0.35:0.02'
              and (
                round(event.before_log_mean, 12) is distinct from (
                  select min(round(root.before_log_mean, 12))
                  from ordered_events root
                  where root.previous_matches_played is null
                )
                or round(event.before_log_variance, 12) is distinct from (
                  select min(round(root.before_log_variance, 12))
                  from ordered_events root
                  where root.previous_matches_played is null
                )
              )
            )
          )
        ) or (
          event.previous_matches_played is not null
          and (
            round(event.before_log_mean, 12) is distinct from round(event.previous_log_mean, 12)
            or round(event.before_log_variance, 12) is distinct from round(event.previous_log_variance, 12)
            or event.before_matches_played is distinct from event.previous_matches_played
          )
        )
      )
    ) then
    raise exception using errcode = 'MRVAL', message = 'Invalid canonical consistency events';
  end if;

  create temporary table if not exists pg_temp.v2_consistency_ratings (
    user_id uuid,
    log_mean numeric(18, 12),
    log_variance numeric(18, 12),
    matches_played integer
  ) on commit drop;
  truncate pg_temp.v2_consistency_ratings;

  begin
    insert into pg_temp.v2_consistency_ratings
    select
      rating."userId",
      rating."logKappaMean",
      rating."logKappaVariance",
      rating."consistencyMatchesPlayed"
    from jsonb_to_recordset(p_ratings) as rating(
      "userId" uuid,
      "logKappaMean" numeric,
      "logKappaVariance" numeric,
      "consistencyMatchesPlayed" integer
    );
  exception when others then
    raise exception using errcode = 'MRVAL', message = 'Invalid canonical consistency states';
  end;

  if exists (
      select 1
      from pg_temp.v2_consistency_ratings rating
      where rating.user_id is null
        or rating.log_mean is null
        or rating.log_mean::text in ('NaN', 'Infinity', '-Infinity')
        or rating.log_variance is null
        or rating.log_variance::text in ('NaN', 'Infinity', '-Infinity')
        or rating.log_variance <= 0
        or rating.matches_played is null or rating.matches_played < 0
    )
    or exists (
      select 1 from pg_temp.v2_consistency_ratings
      group by user_id having count(*) > 1
    )
    or (select count(*) from pg_temp.v2_consistency_ratings)
      <> (select count(distinct user_id) from pg_temp.v2_consistency_expected_facts)
    or exists (
      select 1
      from (select distinct user_id from pg_temp.v2_consistency_expected_facts) expected_user
      left join pg_temp.v2_consistency_ratings rating
        on rating.user_id = expected_user.user_id
      where rating.user_id is null
    )
    or exists (
      with combined_events as (
        select
          user_id, sequence, after_log_mean, after_log_variance, after_matches_played
        from public.consistency_events
        where group_id = v_group_id
          and sequence <= p_prefix_consistency_event_count
        union all
        select
          user_id, sequence, after_log_mean, after_log_variance, after_matches_played
        from pg_temp.v2_consistency_events
      ), latest_events as (
        select distinct on (user_id)
          user_id, after_log_mean, after_log_variance, after_matches_played
        from combined_events
        order by user_id, sequence desc
      )
      select 1
      from latest_events latest
      left join pg_temp.v2_consistency_ratings rating on rating.user_id = latest.user_id
      where rating.user_id is null
        or round(rating.log_mean, 12) is distinct from round(latest.after_log_mean, 12)
        or round(rating.log_variance, 12) is distinct from round(latest.after_log_variance, 12)
        or rating.matches_played is distinct from latest.after_matches_played
    ) then
    raise exception using errcode = 'MRVAL', message = 'Invalid canonical consistency states';
  end if;

  v_rating_result := public.apply_incremental_rating_rebuild(
    p_job_id,
    p_expected_version,
    p_prefix_event_count,
    p_ratings,
    p_events
  );

  if v_rating_result->>'status' = 'stale' then
    return v_rating_result;
  end if;

  delete from public.consistency_events
  where group_id = v_group_id
    and sequence > p_prefix_consistency_event_count;

  insert into public.consistency_events (
    group_id, match_id, revision_id, user_id, occurred_at, format, team,
    sequence, expected_score, actual_score,
    before_log_mean, before_log_variance, before_matches_played,
    after_log_mean, after_log_variance, after_matches_played,
    config_fingerprint
  )
  select
    v_group_id, match_id, revision_id, user_id, occurred_at, format, team,
    sequence, expected_score, actual_score,
    before_log_mean, before_log_variance, before_matches_played,
    after_log_mean, after_log_variance, after_matches_played,
    config_fingerprint
  from pg_temp.v2_consistency_events
  order by sequence;

  update public.group_rating_states state
  set
    consistency_log_mean = rating.log_mean,
    consistency_log_variance = rating.log_variance,
    consistency_matches_played = rating.matches_played,
    consistency_config_fingerprint = p_consistency_config_fingerprint
  from pg_temp.v2_consistency_ratings rating
  where state.group_id = v_group_id
    and state.user_id = rating.user_id;

  return v_rating_result;
end;
$$;

revoke all on function public.begin_incremental_rating_rebuild_v2(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.apply_incremental_rating_rebuild_v2(uuid, bigint, integer, integer, jsonb, jsonb, jsonb, text)
  from public, anon, authenticated, service_role;

grant execute on function public.begin_incremental_rating_rebuild_v2(uuid, uuid, text) to service_role;
grant execute on function public.apply_incremental_rating_rebuild_v2(uuid, bigint, integer, integer, jsonb, jsonb, jsonb, text) to service_role;
