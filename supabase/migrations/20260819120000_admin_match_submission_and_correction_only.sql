-- Allow trusted group moderators to score matches they did not play and
-- replace optional confirmation with one rolling correction window.

alter table public.matches
  alter column status set default 'confirmed';

drop index if exists public.matches_pending_review_expiry_idx;

-- Keep old application instances safe during a rolling deployment. Creating
-- this trigger takes a table lock that drains prior writers; calls that still
-- execute an old command body after the migration are normalized at write time.
create or replace function private.normalize_match_status_for_correction_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'pending_confirmation' then
    new.status := 'confirmed';
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_match_status_for_correction_only on public.matches;
create trigger normalize_match_status_for_correction_only
before insert or update of status on public.matches
for each row execute function private.normalize_match_status_for_correction_only();

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
  v_member public.group_memberships%rowtype;
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

  v_member := public.require_active_member(p_group_id);
  perform 1 from public.groups where id = p_group_id for update;
  if not found then
    raise exception using errcode = 'MR404', message = 'Group not found';
  end if;

  perform public.assert_valid_match_payload(p_group_id, p_format, p_team_a, p_team_b, p_games);

  if not (v_actor = any(p_team_a || p_team_b)) and v_member.role not in ('owner', 'admin') then
    raise exception using errcode = 'MRMAT', message = 'Only match participants or group admins can do that';
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
  values (p_group_id, v_actor, 'confirmed')
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
  v_member public.group_memberships%rowtype;
  v_is_participant boolean;
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

  v_member := public.require_active_member(v_match.group_id);
  if v_match.status <> 'disputed' then
    raise exception using errcode = 'MR409', message = 'Match is not disputed';
  end if;
  if now() >= v_match.review_started_at + interval '30 days' then
    raise exception using errcode = 'MREXP', message = 'Match correction window has expired';
  end if;

  select exists (
    select 1
    from public.match_participants
    where revision_id = p_expected_revision_id and user_id = auth.uid()
  ) into v_is_participant;
  if not v_is_participant and v_member.role not in ('owner', 'admin') then
    raise exception using errcode = 'MRMAT', message = 'Only match participants or group admins can do that';
  end if;

  perform 1 from public.groups where id = v_match.group_id for update;
  perform public.assert_valid_match_payload(v_match.group_id, p_format, p_team_a, p_team_b, p_games);
  if not (auth.uid() = any(p_team_a || p_team_b)) and v_member.role not in ('owner', 'admin') then
    raise exception using errcode = 'MRMAT', message = 'Only match participants or group admins can do that';
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
      status = 'confirmed',
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
  v_member public.group_memberships%rowtype;
  v_is_participant boolean;
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

  v_member := public.require_active_member(v_match.group_id);
  if v_match.status not in ('pending_confirmation', 'confirmed') then
    raise exception using errcode = 'MR409', message = 'Match revision cannot be corrected';
  end if;
  if now() >= v_match.review_started_at + interval '30 days' then
    raise exception using errcode = 'MREXP', message = 'Match correction window has expired';
  end if;

  select exists (
    select 1
    from public.match_participants
    where revision_id = p_expected_revision_id and user_id = auth.uid()
  ) into v_is_participant;
  if not v_is_participant and v_member.role not in ('owner', 'admin') then
    raise exception using errcode = 'MRMAT', message = 'Only match participants or group admins can do that';
  end if;

  perform 1 from public.groups where id = v_match.group_id for update;
  perform public.assert_valid_match_payload(v_match.group_id, p_format, p_team_a, p_team_b, p_games);
  if not (auth.uid() = any(p_team_a || p_team_b)) and v_member.role not in ('owner', 'admin') then
    raise exception using errcode = 'MRMAT', message = 'Only match participants or group admins can do that';
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
      status = 'confirmed',
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

revoke all on function public.command_review_match(uuid, uuid, public.confirmation_action) from authenticated;

revoke all on function public.command_submit_match(uuid, uuid, uuid, public.match_format, uuid[], uuid[], jsonb) from public, anon;
revoke all on function public.command_revise_match(uuid, uuid, uuid, public.match_format, uuid[], uuid[], jsonb) from public, anon;
revoke all on function public.command_dispute_and_revise_match(uuid, uuid, uuid, public.match_format, uuid[], uuid[], jsonb) from public, anon;

grant execute on function public.command_submit_match(uuid, uuid, uuid, public.match_format, uuid[], uuid[], jsonb) to authenticated;
grant execute on function public.command_revise_match(uuid, uuid, uuid, public.match_format, uuid[], uuid[], jsonb) to authenticated;
grant execute on function public.command_dispute_and_revise_match(uuid, uuid, uuid, public.match_format, uuid[], uuid[], jsonb) to authenticated;

-- Reconcile rows committed by old command versions before the compatibility
-- trigger acquired its table lock.
update public.matches
set status = 'confirmed'
where status = 'pending_confirmation';

create or replace function private.navigation_match_bundle(p_match_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'groups', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.name, row_data.id)
      from (
        select distinct g.id, g.name
        from public.groups g
        join public.matches m on m.group_id = g.id
        where m.id = any(coalesce(p_match_ids, array[]::uuid[]))
      ) row_data
    ), '[]'::jsonb),
    'matches', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.submitted_at desc, row_data.id desc)
      from (
        select m.id, m.group_id, m.active_revision_id, m.status, m.submitted_at, m.review_started_at
        from public.matches m
        where m.id = any(coalesce(p_match_ids, array[]::uuid[]))
          and m.active_revision_id is not null
      ) row_data
    ), '[]'::jsonb),
    'revisions', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.id)
      from (
        select mr.id, mr.match_id, mr.submitted_by_user_id, mr.format
        from public.match_revisions mr
        join public.matches m on m.active_revision_id = mr.id
        where m.id = any(coalesce(p_match_ids, array[]::uuid[]))
      ) row_data
    ), '[]'::jsonb),
    'participants', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.revision_id, row_data.team, row_data.slot)
      from (
        select mp.revision_id, mp.user_id, mp.team, mp.slot
        from public.match_participants mp
        join public.matches m on m.active_revision_id = mp.revision_id
        where m.id = any(coalesce(p_match_ids, array[]::uuid[]))
      ) row_data
    ), '[]'::jsonb),
    'games', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.revision_id, row_data.game_number)
      from (
        select mg.revision_id, mg.game_number, mg.team_a_score, mg.team_b_score, mg.winner_team
        from public.match_games mg
        join public.matches m on m.active_revision_id = mg.revision_id
        where m.id = any(coalesce(p_match_ids, array[]::uuid[]))
      ) row_data
    ), '[]'::jsonb),
    'ratingEvents', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.revision_id, row_data.user_id, row_data.sequence)
      from (
        select
          re.revision_id,
          re.user_id,
          re.sequence,
          re.before_rating,
          re.before_rd,
          re.after_rating,
          re.after_rd
        from public.rating_events re
        join public.matches m on m.active_revision_id = re.revision_id
        where m.id = any(coalesce(p_match_ids, array[]::uuid[]))
      ) row_data
    ), '[]'::jsonb),
    'profiles', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.id)
      from (
        select distinct p.id, p.display_name
        from public.profiles p
        join public.match_participants mp on mp.user_id = p.id
        join public.matches m on m.active_revision_id = mp.revision_id
        where m.id = any(coalesce(p_match_ids, array[]::uuid[]))
      ) row_data
    ), '[]'::jsonb)
  );
$$;
