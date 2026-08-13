alter table public.matches
  add column review_started_at timestamptz;

update public.matches as m
set review_started_at = case
  when m.status = 'pending_confirmation' then now()
  else coalesce(
    (select mr.created_at from public.match_revisions mr where mr.id = m.active_revision_id),
    m.submitted_at
  )
end;

alter table public.matches
  alter column review_started_at set default now(),
  alter column review_started_at set not null;

create index matches_pending_review_expiry_idx
  on public.matches (review_started_at, id)
  where status = 'pending_confirmation';

create or replace function public.auto_accept_expired_match_reviews()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_accepted bigint;
begin
  update public.matches
  set status = 'confirmed'
  where status = 'pending_confirmation'
    and review_started_at <= now() - interval '24 hours';

  get diagnostics v_accepted = row_count;
  return v_accepted;
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
  if p_action <> 'confirmed' then
    raise exception using errcode = 'MRVAL', message = 'Disputes must include a corrected result';
  end if;

  v_existing := public.begin_command(
    p_command_id,
    'review_match',
    jsonb_build_object('revisionId', p_revision_id, 'action', p_action)
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
    select 1 from public.match_confirmations
    where revision_id = p_revision_id and user_id = auth.uid()
  ) then
    raise exception using errcode = 'MR409', message = 'Match revision was already reviewed';
  end if;

  insert into public.match_confirmations (revision_id, user_id, action)
  values (p_revision_id, auth.uid(), 'confirmed');

  update public.matches set status = 'confirmed' where id = v_match.id;

  v_result := jsonb_build_object('revisionId', p_revision_id);
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
  if not found or v_match.active_revision_id <> p_expected_revision_id then
    raise exception using errcode = 'MR409', message = 'Stale match revision';
  end if;

  perform public.require_active_member(v_match.group_id);
  if v_match.status <> 'disputed' then
    raise exception using errcode = 'MR409', message = 'Match is not disputed';
  end if;
  if now() >= v_match.review_started_at + interval '30 days' then
    raise exception using errcode = 'MR409', message = 'Match dispute window has expired';
  end if;

  perform 1
  from public.match_participants
  where revision_id = p_expected_revision_id and user_id = auth.uid();
  if not found then
    raise exception using errcode = 'MR403', message = 'Only current match participants can revise';
  end if;

  perform 1 from public.groups where id = v_match.group_id for update;
  perform public.assert_valid_match_payload(v_match.group_id, p_format, p_team_a, p_team_b, p_games);
  if not (auth.uid() = any(p_team_a || p_team_b)) then
    raise exception using errcode = 'MRVAL', message = 'Submitter must play in the match';
  end if;

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
  set active_revision_id = v_revision_id,
      status = 'pending_confirmation',
      review_started_at = now()
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

  if not found or v_match.active_revision_id <> p_expected_revision_id then
    raise exception using errcode = 'MR409', message = 'Stale match revision';
  end if;

  perform public.require_active_member(v_match.group_id);
  if v_match.status not in ('pending_confirmation', 'confirmed') then
    raise exception using errcode = 'MR409', message = 'Match revision cannot be disputed';
  end if;
  if now() >= v_match.review_started_at + interval '30 days' then
    raise exception using errcode = 'MR409', message = 'Match dispute window has expired';
  end if;

  perform 1
  from public.match_participants
  where revision_id = p_expected_revision_id and user_id = auth.uid();
  if not found then
    raise exception using errcode = 'MR403', message = 'Only current match participants can dispute';
  end if;

  perform 1 from public.groups where id = v_match.group_id for update;
  perform public.assert_valid_match_payload(v_match.group_id, p_format, p_team_a, p_team_b, p_games);
  if not (auth.uid() = any(p_team_a || p_team_b)) then
    raise exception using errcode = 'MRVAL', message = 'Submitter must play in the match';
  end if;

  insert into public.match_confirmations (revision_id, user_id, action)
  values (p_expected_revision_id, auth.uid(), 'disputed')
  on conflict (revision_id, user_id)
  do update set action = 'disputed', created_at = now();

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
  set active_revision_id = v_revision_id,
      status = 'pending_confirmation',
      review_started_at = now()
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

revoke all on function public.auto_accept_expired_match_reviews() from public, anon, authenticated;
grant execute on function public.auto_accept_expired_match_reviews() to service_role;

revoke all on function public.command_review_match(uuid, uuid, public.confirmation_action) from public, anon, authenticated;
revoke all on function public.command_revise_match(uuid, uuid, uuid, public.match_format, uuid[], uuid[], jsonb) from public, anon, authenticated;
revoke all on function public.command_dispute_and_revise_match(uuid, uuid, uuid, public.match_format, uuid[], uuid[], jsonb) from public, anon, authenticated;

grant execute on function public.command_review_match(uuid, uuid, public.confirmation_action) to authenticated;
grant execute on function public.command_revise_match(uuid, uuid, uuid, public.match_format, uuid[], uuid[], jsonb) to authenticated;
grant execute on function public.command_dispute_and_revise_match(uuid, uuid, uuid, public.match_format, uuid[], uuid[], jsonb) to authenticated;
