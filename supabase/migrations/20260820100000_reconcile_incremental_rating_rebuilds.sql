-- Reconcile the incremental rebuild contract already deployed out-of-band.
-- This migration is intentionally idempotent so it can run in environments that
-- already have the incremental columns, indexes, and worker RPCs.

alter table public.rating_events
  add column if not exists before_games_played integer,
  add column if not exists after_games_played integer;

with numbered as (
  select
    id,
    row_number() over (partition by group_id, user_id order by sequence, id) - 1 as before_count
  from public.rating_events
)
update public.rating_events event
set
  before_games_played = numbered.before_count,
  after_games_played = numbered.before_count + 1
from numbered
where event.id = numbered.id
  and (event.before_games_played is null or event.after_games_played is null);

alter table public.rating_events
  alter column before_games_played set not null,
  alter column after_games_played set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.rating_events'::regclass
      and conname = 'rating_events_before_games_played_check'
  ) then
    alter table public.rating_events
      add constraint rating_events_before_games_played_check
      check (before_games_played >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.rating_events'::regclass
      and conname = 'rating_events_after_games_played_check'
  ) then
    alter table public.rating_events
      add constraint rating_events_after_games_played_check
      check (after_games_played > 0);
  end if;
end;
$$;

create index if not exists rating_events_group_match_sequence_idx
  on public.rating_events (group_id, match_id, sequence);

create index if not exists rating_events_group_user_sequence_desc_idx
  on public.rating_events (group_id, user_id, sequence desc);

create or replace function public.enqueue_rating_rebuild(
  p_group_id uuid,
  p_from_match_id uuid,
  p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version bigint;
  v_job_id uuid;
begin
  if p_from_match_id is not null and not exists (
    select 1 from public.matches
    where id = p_from_match_id and group_id = p_group_id
  ) then
    raise exception using errcode = 'MRVAL', message = 'Rating boundary does not belong to group';
  end if;

  update public.groups
  set rating_input_version = rating_input_version + 1
  where id = p_group_id
  returning rating_input_version into v_version;

  if not found then
    raise exception using errcode = 'MR404', message = 'Group not found';
  end if;

  insert into public.rating_rebuild_jobs as existing (
    group_id,
    from_match_id,
    created_by_user_id,
    status,
    target_version,
    updated_at
  )
  values (p_group_id, p_from_match_id, p_actor, 'queued', v_version, now())
  on conflict (group_id) where status in ('queued', 'running') do update
  set
    target_version = excluded.target_version,
    from_match_id = case
      when existing.from_match_id is null or excluded.from_match_id is null then null
      when exists (
        select 1
        from public.matches incoming
        join public.matches current on current.id = existing.from_match_id
        where incoming.id = excluded.from_match_id
          and (incoming.submitted_at, incoming.id) < (current.submitted_at, current.id)
      ) then excluded.from_match_id
      else existing.from_match_id
    end,
    error = null,
    updated_at = now()
  returning id into v_job_id;

  return v_job_id;
end;
$$;

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
      select m.id, m.active_revision_id
      from public.matches m
      where m.group_id = v_job.group_id
        and (m.submitted_at, m.id) < (v_boundary_submitted_at, v_boundary_match_id)
    ), expected as (
      select
        coalesce(sum(game_counts.game_count * participant_counts.participant_count), 0)::integer as event_count
      from prefix_matches match
      cross join lateral (
        select count(*)::integer as game_count
        from public.match_games where revision_id = match.active_revision_id
      ) game_counts
      cross join lateral (
        select count(*)::integer as participant_count
        from public.match_participants where revision_id = match.active_revision_id
      ) participant_counts
    ), actual as (
      select
        count(*)::integer as event_count,
        count(distinct event.sequence)::integer as sequence_count,
        coalesce(min(event.sequence), 1) as minimum_sequence,
        coalesce(max(event.sequence), 0) as maximum_sequence,
        bool_and(
          event.revision_id = match.active_revision_id
          and event.before_games_played >= 0
          and event.after_games_played = event.before_games_played + 1
        ) as rows_valid
      from public.rating_events event
      join prefix_matches match on match.id = event.match_id
      where event.group_id = v_job.group_id
    ), outside_prefix as (
      select count(*)::integer as event_count
      from public.rating_events event
      left join prefix_matches match on match.id = event.match_id
      where event.group_id = v_job.group_id
        and event.sequence <= (select event_count from expected)
        and match.id is null
    )
    select
      expected.event_count > 0
        and actual.event_count = expected.event_count
        and actual.sequence_count = expected.event_count
        and actual.minimum_sequence = 1
        and actual.maximum_sequence = expected.event_count
        and coalesce(actual.rows_valid, false)
        and outside_prefix.event_count = 0,
      expected.event_count
    into v_prefix_valid, v_prefix_event_count
    from expected, actual, outside_prefix;
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

  if v_current <> p_expected_version or v_job.target_version <> p_expected_version then
    return jsonb_build_object('status', 'stale', 'targetVersion', v_current);
  end if;

  if p_prefix_event_count < 0
    or jsonb_typeof(p_ratings) is distinct from 'array'
    or jsonb_typeof(p_events) is distinct from 'array'
    or exists (
      select 1
      from jsonb_array_elements(p_events) with ordinality as events(event, position)
      where (event->>'sequence')::integer <> p_prefix_event_count + position
        or (event->'after'->>'gamesPlayed')::integer
          <> (event->'before'->>'gamesPlayed')::integer + 1
    ) then
    raise exception using errcode = 'MRVAL', message = 'Invalid incremental rating projection';
  end if;

  delete from public.rating_events
  where group_id = v_group_id and sequence > p_prefix_event_count;

  delete from public.group_rating_states where group_id = v_group_id;
  insert into public.group_rating_states (
    group_id, user_id, rating, rd, volatility, games_played, rank
  )
  select
    v_group_id,
    (rating->>'userId')::uuid,
    (rating->>'rating')::numeric,
    (rating->>'rd')::numeric,
    (rating->>'volatility')::numeric,
    (rating->>'gamesPlayed')::integer,
    (rating->>'rank')::integer
  from jsonb_array_elements(p_ratings) as ratings(rating);

  insert into public.rating_events (
    group_id, match_id, revision_id, user_id, sequence,
    before_rating, before_rd, before_volatility, before_games_played,
    after_rating, after_rd, after_volatility, after_games_played
  )
  select
    v_group_id,
    (event->>'matchId')::uuid,
    (event->>'revisionId')::uuid,
    (event->>'userId')::uuid,
    (event->>'sequence')::integer,
    (event->'before'->>'rating')::numeric,
    (event->'before'->>'rd')::numeric,
    (event->'before'->>'volatility')::numeric,
    (event->'before'->>'gamesPlayed')::integer,
    (event->'after'->>'rating')::numeric,
    (event->'after'->>'rd')::numeric,
    (event->'after'->>'volatility')::numeric,
    (event->'after'->>'gamesPlayed')::integer
  from jsonb_array_elements(p_events) as events(event);

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
