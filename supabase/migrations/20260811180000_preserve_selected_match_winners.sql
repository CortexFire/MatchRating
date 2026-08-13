-- Preserve the explicitly selected game winner through match commands and rating history.

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
      or jsonb_typeof(game->'winnerTeam') is distinct from 'string'
      or game->>'winnerTeam' not in ('A', 'B')
  ) then
    raise exception using errcode = 'MRVAL', message = 'Winner team must be A or B';
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
    count(*) filter (where game->>'winnerTeam' = 'A'),
    count(*) filter (where game->>'winnerTeam' = 'B')
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
      and (
        d.created_by_user_id = v_actor
        or v_actor = any(d.team_a_user_ids)
        or v_actor = any(d.team_b_user_ids)
      )
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
    (game->>'winnerTeam')::public.team_code
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
    (game->>'winnerTeam')::public.team_code
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
    (game->>'winnerTeam')::public.team_code
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

create or replace function public.begin_rating_rebuild(p_job_id uuid, p_dispatch_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.rating_rebuild_jobs%rowtype;
  v_history jsonb;
begin
  select * into v_job
  from public.rating_rebuild_jobs
  where id = p_job_id
  for update;

  if not found
    or v_job.status not in ('queued', 'running')
    or v_job.dispatch_token <> p_dispatch_token then
    return null;
  end if;

  update public.rating_rebuild_jobs
  set
    status = 'running',
    started_at = coalesce(started_at, now()),
    attempt_count = attempt_count + 1,
    updated_at = now()
  where id = p_job_id;

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
      )
      order by m.submitted_at, m.id
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
        'teamAScore', team_a_score,
        'teamBScore', team_b_score,
        'winnerTeam', winner_team
      )
      order by game_number
    ) as items
    from public.match_games
    where revision_id = mr.id
  ) games on true
  where m.group_id = v_job.group_id;

  return jsonb_build_object(
    'groupId', v_job.group_id,
    'jobId', v_job.id,
    'targetVersion', v_job.target_version,
    'history', v_history
  );
end;
$$;

revoke all on function public.assert_valid_match_payload(uuid, public.match_format, uuid[], uuid[], jsonb) from public, anon, authenticated;
revoke all on function public.command_submit_match(uuid, uuid, uuid, public.match_format, uuid[], uuid[], jsonb) from public, anon, authenticated;
revoke all on function public.command_revise_match(uuid, uuid, uuid, public.match_format, uuid[], uuid[], jsonb) from public, anon, authenticated;
revoke all on function public.command_dispute_and_revise_match(uuid, uuid, uuid, public.match_format, uuid[], uuid[], jsonb) from public, anon, authenticated;
revoke all on function public.begin_rating_rebuild(uuid, uuid) from public, anon, authenticated;

grant execute on function public.command_submit_match(uuid, uuid, uuid, public.match_format, uuid[], uuid[], jsonb) to authenticated;
grant execute on function public.command_revise_match(uuid, uuid, uuid, public.match_format, uuid[], uuid[], jsonb) to authenticated;
grant execute on function public.command_dispute_and_revise_match(uuid, uuid, uuid, public.match_format, uuid[], uuid[], jsonb) to authenticated;
grant execute on function public.begin_rating_rebuild(uuid, uuid) to service_role;
