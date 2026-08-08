-- Forward-only hardening for transactional match commands and rating rebuild recovery.

alter table public.command_receipts
  add column if not exists request_fingerprint text;

-- Match aggregates and rating jobs are written only by security-definer command
-- and worker RPCs. Authenticated clients retain their existing read access.
revoke insert, update on table public.matches from authenticated;
revoke insert, update, delete on table public.match_revisions from authenticated;
revoke insert, update, delete on table public.match_participants from authenticated;
revoke insert, update, delete on table public.match_games from authenticated;
revoke insert, update, delete on table public.match_confirmations from authenticated;
revoke insert, update, delete on table public.rating_rebuild_jobs from authenticated;

create or replace function public.begin_command(
  p_command_id uuid,
  p_command_type text,
  p_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_fingerprint text;
  v_receipt public.command_receipts%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = 'MR401', message = 'Authentication is required';
  end if;

  -- jsonb::text is canonical for equivalent JSON objects. Keeping the canonical
  -- request itself makes conflict detection exact and avoids hash collisions.
  v_fingerprint := coalesce(p_request, 'null'::jsonb)::text;

  insert into public.command_receipts (
    command_id,
    actor_user_id,
    command_type,
    request_fingerprint
  )
  values (p_command_id, v_actor, p_command_type, v_fingerprint)
  on conflict (command_id) do nothing;

  select * into v_receipt
  from public.command_receipts
  where command_id = p_command_id
  for update;

  if v_receipt.actor_user_id <> v_actor or v_receipt.command_type <> p_command_type then
    raise exception using errcode = 'MRCMD', message = 'Command ID belongs to another operation';
  end if;

  if v_receipt.request_fingerprint is null then
    raise exception using errcode = 'MRCMD', message = 'Legacy command ID cannot be safely replayed';
  end if;

  if v_receipt.request_fingerprint <> v_fingerprint then
    raise exception using errcode = 'MRCMD', message = 'Command ID was reused with different input';
  end if;

  return v_receipt.result;
end;
$$;

create or replace function public.assert_valid_match_payload(
  p_group_id uuid,
  p_format public.match_format,
  p_team_a uuid[],
  p_team_b uuid[],
  p_games jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected_team_size integer := case when p_format = 'singles' then 1 else 2 end;
  v_player_count integer;
  v_unique_player_count integer;
  v_a_wins integer;
  v_b_wins integer;
begin
  if p_format is null then
    raise exception using errcode = 'MRVAL', message = 'Invalid match format';
  end if;

  v_player_count := coalesce(cardinality(p_team_a), 0) + coalesce(cardinality(p_team_b), 0);
  select count(distinct player_id)
  into v_unique_player_count
  from unnest(coalesce(p_team_a, '{}'::uuid[]) || coalesce(p_team_b, '{}'::uuid[])) as players(player_id);

  if coalesce(cardinality(p_team_a), 0) <> v_expected_team_size
    or coalesce(cardinality(p_team_b), 0) <> v_expected_team_size
    or v_unique_player_count <> v_player_count then
    raise exception using errcode = 'MRVAL', message = 'Invalid match teams';
  end if;

  if exists (
    select 1
    from unnest(p_team_a || p_team_b) as players(player_id)
    where not exists (
      select 1
      from public.group_memberships gm
      where gm.group_id = p_group_id
        and gm.user_id = player_id
        and gm.status = 'active'
        and gm.left_at is null
    )
  ) then
    raise exception using errcode = 'MRVAL', message = 'Match player is not active';
  end if;

  if jsonb_typeof(p_games) is distinct from 'array' then
    raise exception using errcode = 'MRVAL', message = 'Invalid games';
  end if;

  if jsonb_array_length(p_games) not between 1 and 7 then
    raise exception using errcode = 'MRVAL', message = 'Invalid games';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_games) as games(game)
    where jsonb_typeof(game) is distinct from 'object'
      or jsonb_typeof(game->'teamAScore') is distinct from 'number'
      or jsonb_typeof(game->'teamBScore') is distinct from 'number'
  ) then
    raise exception using errcode = 'MRVAL', message = 'Scores must be integers between 0 and 99';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_games) as games(game)
    where (game->>'teamAScore')::numeric not between 0 and 99
      or (game->>'teamBScore')::numeric not between 0 and 99
      or (game->>'teamAScore')::numeric <> trunc((game->>'teamAScore')::numeric)
      or (game->>'teamBScore')::numeric <> trunc((game->>'teamBScore')::numeric)
  ) then
    raise exception using errcode = 'MRVAL', message = 'Scores must be integers between 0 and 99';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_games) as games(game)
    where (game->>'teamAScore')::integer = (game->>'teamBScore')::integer
  ) then
    raise exception using errcode = 'MRVAL', message = 'Games cannot tie';
  end if;

  select
    count(*) filter (where (game->>'teamAScore')::integer > (game->>'teamBScore')::integer),
    count(*) filter (where (game->>'teamBScore')::integer > (game->>'teamAScore')::integer)
  into v_a_wins, v_b_wins
  from jsonb_array_elements(p_games) as games(game);

  if v_a_wins = v_b_wins then
    raise exception using errcode = 'MRVAL', message = 'Match requires a winner';
  end if;
end;
$$;

create or replace function public.command_submit_match(
  p_command_id uuid,
  p_group_id uuid,
  p_draft_id uuid,
  p_format public.match_format,
  p_team_a uuid[],
  p_team_b uuid[],
  p_games jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing jsonb;
  v_actor uuid := auth.uid();
  v_match_id uuid;
  v_revision_id uuid;
  v_job_id uuid;
  v_result jsonb;
begin
  v_existing := public.begin_command(
    p_command_id,
    'submit_match',
    jsonb_build_object(
      'groupId', p_group_id,
      'draftId', p_draft_id,
      'format', p_format,
      'teamA', p_team_a,
      'teamB', p_team_b,
      'games', p_games
    )
  );
  if v_existing is not null then return v_existing; end if;

  perform public.require_active_member(p_group_id);
  perform 1 from public.groups where id = p_group_id for update;
  if not found then
    raise exception using errcode = 'MR404', message = 'Group not found';
  end if;

  perform public.assert_valid_match_payload(p_group_id, p_format, p_team_a, p_team_b, p_games);

  if not (v_actor = any(p_team_a || p_team_b)) then
    raise exception using errcode = 'MRVAL', message = 'Submitter must play in the match';
  end if;

  if p_draft_id is not null and not exists (
    select 1
    from public.active_match_drafts d
    where d.id = p_draft_id
      and d.group_id = p_group_id
      and d.created_by_user_id = v_actor
      and d.submitted_match_id is null
      and d.expires_at > now()
    for update
  ) then
    raise exception using errcode = 'MRVAL', message = 'Active match is unavailable';
  end if;

  insert into public.matches (group_id, created_by_user_id, status)
  values (p_group_id, v_actor, 'pending_confirmation')
  returning id into v_match_id;

  insert into public.match_revisions (
    match_id,
    version,
    submitted_by_user_id,
    format,
    status
  )
  values (v_match_id, 1, v_actor, p_format, 'active')
  returning id into v_revision_id;

  insert into public.match_participants (revision_id, user_id, team, slot)
  select v_revision_id, player_id, 'A'::public.team_code, ordinality::integer
  from unnest(p_team_a) with ordinality as team_a(player_id, ordinality)
  union all
  select v_revision_id, player_id, 'B'::public.team_code, ordinality::integer
  from unnest(p_team_b) with ordinality as team_b(player_id, ordinality);

  insert into public.match_games (
    revision_id,
    game_number,
    team_a_score,
    team_b_score,
    winner_team
  )
  select
    v_revision_id,
    ordinality,
    (game->>'teamAScore')::integer,
    (game->>'teamBScore')::integer,
    case
      when (game->>'teamAScore')::integer > (game->>'teamBScore')::integer
        then 'A'::public.team_code
      else 'B'::public.team_code
    end
  from jsonb_array_elements(p_games) with ordinality as games(game, ordinality);

  update public.matches set active_revision_id = v_revision_id where id = v_match_id;
  if p_draft_id is not null then
    update public.active_match_drafts set submitted_match_id = v_match_id where id = p_draft_id;
  end if;

  v_job_id := public.enqueue_rating_rebuild(p_group_id, v_match_id, v_actor);
  v_result := jsonb_build_object(
    'matchId', v_match_id,
    'revisionId', v_revision_id,
    'ratingJobId', v_job_id,
    'ratingStatus', 'queued'
  );
  perform public.complete_command(p_command_id, v_result);
  return v_result;
end;
$$;

create or replace function public.command_revise_match(
  p_command_id uuid,
  p_match_id uuid,
  p_expected_revision_id uuid,
  p_format public.match_format,
  p_team_a uuid[],
  p_team_b uuid[],
  p_games jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing jsonb;
  v_match public.matches%rowtype;
  v_revision_id uuid;
  v_job_id uuid;
  v_result jsonb;
begin
  v_existing := public.begin_command(
    p_command_id,
    'revise_match',
    jsonb_build_object(
      'matchId', p_match_id,
      'expectedRevisionId', p_expected_revision_id,
      'format', p_format,
      'teamA', p_team_a,
      'teamB', p_team_b,
      'games', p_games
    )
  );
  if v_existing is not null then return v_existing; end if;

  select * into v_match from public.matches where id = p_match_id for update;
  if not found then
    raise exception using errcode = 'MR409', message = 'Stale match revision';
  end if;
  perform public.require_active_member(v_match.group_id);
  if v_match.active_revision_id <> p_expected_revision_id then
    raise exception using errcode = 'MR409', message = 'Stale match revision';
  end if;
  if v_match.status <> 'disputed' then
    raise exception using errcode = 'MR409', message = 'Match is not disputed';
  end if;

  perform 1
  from public.match_participants
  where revision_id = p_expected_revision_id
    and user_id = auth.uid();
  if not found then
    raise exception using errcode = 'MR403', message = 'Only current match participants can revise';
  end if;
  perform 1 from public.groups where id = v_match.group_id for update;
  perform public.assert_valid_match_payload(v_match.group_id, p_format, p_team_a, p_team_b, p_games);
  if not (auth.uid() = any(p_team_a || p_team_b)) then
    raise exception using errcode = 'MRVAL', message = 'Submitter must play in the match';
  end if;

  insert into public.match_revisions (
    match_id,
    version,
    submitted_by_user_id,
    format,
    status
  )
  select
    v_match.id,
    coalesce(max(version), 0) + 1,
    auth.uid(),
    p_format,
    'active'
  from public.match_revisions
  where match_id = v_match.id
  returning id into v_revision_id;

  insert into public.match_participants (revision_id, user_id, team, slot)
  select v_revision_id, player_id, 'A'::public.team_code, ordinality::integer
  from unnest(p_team_a) with ordinality as team_a(player_id, ordinality)
  union all
  select v_revision_id, player_id, 'B'::public.team_code, ordinality::integer
  from unnest(p_team_b) with ordinality as team_b(player_id, ordinality);

  insert into public.match_games (
    revision_id,
    game_number,
    team_a_score,
    team_b_score,
    winner_team
  )
  select
    v_revision_id,
    ordinality,
    (game->>'teamAScore')::integer,
    (game->>'teamBScore')::integer,
    case
      when (game->>'teamAScore')::integer > (game->>'teamBScore')::integer
        then 'A'::public.team_code
      else 'B'::public.team_code
    end
  from jsonb_array_elements(p_games) with ordinality as games(game, ordinality);

  update public.matches
  set active_revision_id = v_revision_id, status = 'pending_confirmation'
  where id = v_match.id;

  v_job_id := public.enqueue_rating_rebuild(v_match.group_id, v_match.id, auth.uid());
  v_result := jsonb_build_object(
    'matchId', v_match.id,
    'revisionId', v_revision_id,
    'ratingJobId', v_job_id,
    'ratingStatus', 'queued'
  );
  perform public.complete_command(p_command_id, v_result);
  return v_result;
end;
$$;

create or replace function public.command_review_match(
  p_command_id uuid,
  p_revision_id uuid,
  p_action public.confirmation_action
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing jsonb;
  v_match public.matches%rowtype;
  v_revision public.match_revisions%rowtype;
  v_submitter_team public.team_code;
  v_reviewer_team public.team_code;
  v_result jsonb;
begin
  v_existing := public.begin_command(
    p_command_id,
    'review_match',
    jsonb_build_object(
      'revisionId', p_revision_id,
      'action', p_action
    )
  );
  if v_existing is not null then return v_existing; end if;

  select * into v_match
  from public.matches
  where active_revision_id = p_revision_id
  for update;

  if not found then
    if exists (select 1 from public.match_revisions where id = p_revision_id) then
      raise exception using errcode = 'MR409', message = 'Match revision is no longer pending';
    end if;
    raise exception using errcode = 'MRVAL', message = 'Revision not found';
  end if;

  if v_match.status <> 'pending_confirmation' then
    raise exception using errcode = 'MR409', message = 'Match revision is no longer pending';
  end if;

  select * into v_revision
  from public.match_revisions
  where id = p_revision_id and match_id = v_match.id
  for update;

  perform public.require_active_member(v_match.group_id);

  select team into v_submitter_team
  from public.match_participants
  where revision_id = p_revision_id and user_id = v_revision.submitted_by_user_id;

  select team into v_reviewer_team
  from public.match_participants
  where revision_id = p_revision_id and user_id = auth.uid();

  if v_submitter_team is null or v_reviewer_team is null or v_submitter_team = v_reviewer_team then
    raise exception using errcode = 'MRREV', message = 'Opposing participant required';
  end if;

  if exists (
    select 1
    from public.match_confirmations
    where revision_id = p_revision_id and user_id = auth.uid()
  ) then
    raise exception using errcode = 'MR409', message = 'Match revision was already reviewed';
  end if;

  insert into public.match_confirmations (revision_id, user_id, action)
  values (p_revision_id, auth.uid(), p_action);

  update public.matches
  set status = case
    when p_action = 'confirmed' then 'confirmed'::public.match_status
    else 'disputed'::public.match_status
  end
  where id = v_match.id;

  v_result := jsonb_build_object('revisionId', p_revision_id);
  perform public.complete_command(p_command_id, v_result);
  return v_result;
end;
$$;

create or replace function public.command_dispute_and_revise_match(
  p_command_id uuid,
  p_match_id uuid,
  p_expected_revision_id uuid,
  p_format public.match_format,
  p_team_a uuid[],
  p_team_b uuid[],
  p_games jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing jsonb;
  v_match public.matches%rowtype;
  v_previous_revision public.match_revisions%rowtype;
  v_submitter_team public.team_code;
  v_reviewer_team public.team_code;
  v_revision_id uuid;
  v_job_id uuid;
  v_result jsonb;
begin
  v_existing := public.begin_command(
    p_command_id,
    'dispute_and_revise_match',
    jsonb_build_object(
      'matchId', p_match_id,
      'expectedRevisionId', p_expected_revision_id,
      'format', p_format,
      'teamA', p_team_a,
      'teamB', p_team_b,
      'games', p_games
    )
  );
  if v_existing is not null then return v_existing; end if;

  select * into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception using errcode = 'MR409', message = 'Stale match revision';
  end if;
  perform public.require_active_member(v_match.group_id);
  if v_match.active_revision_id <> p_expected_revision_id then
    raise exception using errcode = 'MR409', message = 'Stale match revision';
  end if;
  if v_match.status <> 'pending_confirmation' then
    raise exception using errcode = 'MR409', message = 'Match revision is no longer pending';
  end if;

  select * into v_previous_revision
  from public.match_revisions
  where id = p_expected_revision_id and match_id = p_match_id
  for update;

  perform 1 from public.groups where id = v_match.group_id for update;
  perform public.assert_valid_match_payload(v_match.group_id, p_format, p_team_a, p_team_b, p_games);

  select team into v_submitter_team
  from public.match_participants
  where revision_id = p_expected_revision_id and user_id = v_previous_revision.submitted_by_user_id;

  select team into v_reviewer_team
  from public.match_participants
  where revision_id = p_expected_revision_id and user_id = auth.uid();

  if v_submitter_team is null or v_reviewer_team is null or v_submitter_team = v_reviewer_team then
    raise exception using errcode = 'MRREV', message = 'Opposing participant required';
  end if;
  if exists (
    select 1 from public.match_confirmations
    where revision_id = p_expected_revision_id and user_id = auth.uid()
  ) then
    raise exception using errcode = 'MR409', message = 'Match revision was already reviewed';
  end if;
  if not (auth.uid() = any(p_team_a || p_team_b)) then
    raise exception using errcode = 'MRVAL', message = 'Submitter must play in the match';
  end if;

  insert into public.match_confirmations (revision_id, user_id, action)
  values (p_expected_revision_id, auth.uid(), 'disputed');

  insert into public.match_revisions (match_id, version, submitted_by_user_id, format, status)
  select v_match.id, coalesce(max(version), 0) + 1, auth.uid(), p_format, 'active'
  from public.match_revisions
  where match_id = v_match.id
  returning id into v_revision_id;

  insert into public.match_participants (revision_id, user_id, team, slot)
  select v_revision_id, player_id, 'A'::public.team_code, ordinality::integer
  from unnest(p_team_a) with ordinality as team_a(player_id, ordinality)
  union all
  select v_revision_id, player_id, 'B'::public.team_code, ordinality::integer
  from unnest(p_team_b) with ordinality as team_b(player_id, ordinality);

  insert into public.match_games (revision_id, game_number, team_a_score, team_b_score, winner_team)
  select
    v_revision_id,
    ordinality,
    (game->>'teamAScore')::integer,
    (game->>'teamBScore')::integer,
    case
      when (game->>'teamAScore')::integer > (game->>'teamBScore')::integer then 'A'::public.team_code
      else 'B'::public.team_code
    end
  from jsonb_array_elements(p_games) with ordinality as games(game, ordinality);

  update public.matches
  set active_revision_id = v_revision_id, status = 'pending_confirmation'
  where id = v_match.id;

  v_job_id := public.enqueue_rating_rebuild(v_match.group_id, v_match.id, auth.uid());
  v_result := jsonb_build_object(
    'matchId', v_match.id,
    'revisionId', v_revision_id,
    'ratingJobId', v_job_id,
    'ratingStatus', 'queued'
  );
  perform public.complete_command(p_command_id, v_result);
  return v_result;
end;
$$;

create or replace function public.apply_rating_rebuild(
  p_job_id uuid,
  p_expected_version bigint,
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
  select group_id into v_group_id from public.rating_rebuild_jobs where id = p_job_id;
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

  if jsonb_typeof(p_ratings) is distinct from 'array'
    or jsonb_typeof(p_events) is distinct from 'array' then
    raise exception using errcode = 'MRVAL', message = 'Invalid rating projection';
  end if;

  delete from public.rating_events where group_id = v_group_id;
  delete from public.group_rating_states where group_id = v_group_id;

  insert into public.group_rating_states (
    group_id,
    user_id,
    rating,
    rd,
    volatility,
    games_played,
    rank
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
    group_id,
    match_id,
    revision_id,
    user_id,
    sequence,
    before_rating,
    before_rd,
    before_volatility,
    after_rating,
    after_rd,
    after_volatility
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
    (event->'after'->>'rating')::numeric,
    (event->'after'->>'rd')::numeric,
    (event->'after'->>'volatility')::numeric
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

create or replace function public.retry_rating_rebuild(p_command_id uuid, p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing jsonb;
  v_group_id uuid;
  v_job public.rating_rebuild_jobs%rowtype;
  v_result jsonb;
begin
  v_existing := public.begin_command(
    p_command_id,
    'retry_rating_rebuild',
    jsonb_build_object('jobId', p_job_id)
  );
  if v_existing is not null then return v_existing; end if;

  select group_id into v_group_id from public.rating_rebuild_jobs where id = p_job_id;
  if not found then
    raise exception using errcode = 'MRVAL', message = 'Rating job not found';
  end if;

  perform public.require_active_member(v_group_id, true);
  perform 1 from public.groups where id = v_group_id for update;
  select * into v_job
  from public.rating_rebuild_jobs
  where id = p_job_id and group_id = v_group_id
  for update;

  if not found then
    raise exception using errcode = 'MRVAL', message = 'Rating job not found';
  end if;

  if v_job.status <> 'failed' then
    raise exception using errcode = 'MRVAL', message = 'Only failed rating jobs can be retried';
  end if;

  if exists (
    select 1
    from public.rating_rebuild_jobs
    where group_id = v_group_id
      and id <> p_job_id
      and status in ('queued', 'running')
  ) then
    raise exception using errcode = 'MRVAL', message = 'A rating rebuild is already queued';
  end if;

  update public.rating_rebuild_jobs
  set
    status = 'queued',
    target_version = (select rating_input_version from public.groups where id = v_group_id),
    error = null,
    dispatch_token = null,
    dispatch_lease_expires_at = null,
    workflow_run_id = null,
    started_at = null,
    completed_at = null,
    updated_at = now()
  where id = p_job_id;

  v_result := jsonb_build_object(
    'ratingJobId', p_job_id,
    'ratingStatus', 'queued'
  );
  perform public.complete_command(p_command_id, v_result);
  return v_result;
end;
$$;

create or replace function public.get_rating_rebuild_status(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.group_memberships%rowtype;
  v_job public.rating_rebuild_jobs%rowtype;
begin
  select * into v_member from public.require_active_member(p_group_id);
  select * into v_job
  from public.rating_rebuild_jobs
  where group_id = p_group_id
  order by created_at desc, id desc
  limit 1;

  if not found then
    return jsonb_build_object('id', null, 'status', null, 'canRetry', false);
  end if;

  return jsonb_build_object(
    'id', v_job.id,
    'status', v_job.status,
    'error', v_job.error,
    'targetVersion', v_job.target_version,
    'canRetry', v_job.status = 'failed' and v_member.role in ('owner', 'admin')
  );
end;
$$;

revoke all on function public.begin_command(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.assert_valid_match_payload(uuid, public.match_format, uuid[], uuid[], jsonb) from public, anon, authenticated;
revoke all on function public.command_submit_match(uuid, uuid, uuid, public.match_format, uuid[], uuid[], jsonb) from public, anon, authenticated;
revoke all on function public.command_revise_match(uuid, uuid, uuid, public.match_format, uuid[], uuid[], jsonb) from public, anon, authenticated;
revoke all on function public.command_review_match(uuid, uuid, public.confirmation_action) from public, anon, authenticated;
revoke all on function public.command_dispute_and_revise_match(uuid, uuid, uuid, public.match_format, uuid[], uuid[], jsonb) from public, anon, authenticated;
revoke all on function public.retry_rating_rebuild(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_rating_rebuild_status(uuid) from public, anon, authenticated;
revoke all on function public.apply_rating_rebuild(uuid, bigint, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.claim_rating_rebuild_dispatch(uuid, uuid) from public, anon, authenticated;
revoke all on function public.begin_rating_rebuild(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fail_rating_rebuild(uuid, text) from public, anon, authenticated;
revoke all on function public.command_create_group(uuid, text, text) from public, anon, authenticated;
revoke all on function public.command_create_guest_players(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.command_join_group_by_invite(uuid, uuid) from public, anon, authenticated;
revoke all on function public.command_claim_guest_profiles(uuid, uuid, uuid[]) from public, anon, authenticated;

grant execute on function public.command_submit_match(uuid, uuid, uuid, public.match_format, uuid[], uuid[], jsonb) to authenticated;
grant execute on function public.command_revise_match(uuid, uuid, uuid, public.match_format, uuid[], uuid[], jsonb) to authenticated;
grant execute on function public.command_review_match(uuid, uuid, public.confirmation_action) to authenticated;
grant execute on function public.command_dispute_and_revise_match(uuid, uuid, uuid, public.match_format, uuid[], uuid[], jsonb) to authenticated;
grant execute on function public.retry_rating_rebuild(uuid, uuid) to authenticated;
grant execute on function public.get_rating_rebuild_status(uuid) to authenticated;
grant execute on function public.apply_rating_rebuild(uuid, bigint, jsonb, jsonb) to service_role;
grant execute on function public.claim_rating_rebuild_dispatch(uuid, uuid) to service_role;
grant execute on function public.begin_rating_rebuild(uuid, uuid) to service_role;
grant execute on function public.fail_rating_rebuild(uuid, text) to service_role;
grant execute on function public.command_create_group(uuid, text, text) to authenticated;
grant execute on function public.command_create_guest_players(uuid, uuid, jsonb) to authenticated;
grant execute on function public.command_join_group_by_invite(uuid, uuid) to authenticated;
grant execute on function public.command_claim_guest_profiles(uuid, uuid, uuid[]) to authenticated;
