-- Transactional commands and a durable outbox for rating rebuilds.
-- Every public command returns jsonb so retries can replay the original result.

alter table public.groups
  add column if not exists rating_input_version bigint not null default 0,
  add column if not exists rating_applied_version bigint not null default 0;

alter table public.rating_rebuild_jobs
  add column if not exists target_version bigint not null default 0,
  add column if not exists dispatch_token uuid,
  add column if not exists dispatch_lease_expires_at timestamptz,
  add column if not exists workflow_run_id text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists started_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.command_receipts (
  command_id uuid primary key,
  actor_user_id uuid not null references public.profiles(id) on delete cascade,
  command_type text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.command_receipts enable row level security;
revoke all on public.command_receipts from public, anon, authenticated;
grant all on public.command_receipts to service_role;

-- Retain the newest legacy active job, then enforce coalescing going forward.
with ranked as (
  select id, row_number() over (partition by group_id order by created_at desc, id desc) as position
  from public.rating_rebuild_jobs
  where status in ('queued', 'running')
)
update public.rating_rebuild_jobs job
set status = 'failed', error = 'Superseded by transactional rating outbox migration', updated_at = now()
from ranked
where job.id = ranked.id and ranked.position > 1;

create unique index if not exists rating_rebuild_jobs_one_active_per_group_idx
  on public.rating_rebuild_jobs (group_id)
  where status in ('queued', 'running');

create or replace function public.begin_command(p_command_id uuid, p_command_type text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_receipt public.command_receipts%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = 'MR401', message = 'Authentication is required';
  end if;

  insert into public.command_receipts (command_id, actor_user_id, command_type)
  values (p_command_id, v_actor, p_command_type)
  on conflict (command_id) do update set command_id = excluded.command_id
  returning * into v_receipt;

  if v_receipt.actor_user_id <> v_actor or v_receipt.command_type <> p_command_type then
    raise exception using errcode = 'MRCMD', message = 'Command ID belongs to another operation';
  end if;

  return v_receipt.result;
end;
$$;

create or replace function public.complete_command(p_command_id uuid, p_result jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.command_receipts
  set result = p_result, completed_at = now()
  where command_id = p_command_id;
$$;

create or replace function public.require_active_member(p_group_id uuid, p_admin boolean default false)
returns public.group_memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.group_memberships%rowtype;
begin
  select * into v_member
  from public.group_memberships
  where group_id = p_group_id and user_id = auth.uid() and status = 'active' and left_at is null;

  if not found then
    raise exception using errcode = 'MR403', message = 'Not an active group member';
  end if;
  if p_admin and v_member.role not in ('owner', 'admin') then
    raise exception using errcode = 'MRADM', message = 'Admin role required';
  end if;
  return v_member;
end;
$$;

create or replace function public.enqueue_rating_rebuild(p_group_id uuid, p_from_match_id uuid, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version bigint;
  v_job_id uuid;
begin
  update public.groups
  set rating_input_version = rating_input_version + 1
  where id = p_group_id
  returning rating_input_version into v_version;

  if not found then
    raise exception using errcode = 'MR404', message = 'Group not found';
  end if;

  insert into public.rating_rebuild_jobs (group_id, from_match_id, created_by_user_id, status, target_version, updated_at)
  values (p_group_id, p_from_match_id, p_actor, 'queued', v_version, now())
  on conflict (group_id) where status in ('queued', 'running') do update
    set target_version = excluded.target_version,
        from_match_id = excluded.from_match_id,
        error = null,
        updated_at = now()
  returning id into v_job_id;

  return v_job_id;
end;
$$;

create or replace function public.command_create_group(p_command_id uuid, p_name text, p_description text default '')
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_existing jsonb; v_group_id uuid; v_result jsonb; v_actor uuid := auth.uid();
begin
  v_existing := public.begin_command(p_command_id, 'create_group');
  if v_existing is not null then return v_existing; end if;
  if char_length(btrim(p_name)) not between 2 and 80 or char_length(coalesce(p_description, '')) > 280 then
    raise exception using errcode = 'MRVAL', message = 'Invalid group details';
  end if;
  insert into public.groups (owner_user_id, name, description) values (v_actor, btrim(p_name), coalesce(p_description, '')) returning id into v_group_id;
  insert into public.group_memberships (group_id, user_id, role, status) values (v_group_id, v_actor, 'owner', 'active');
  insert into public.group_rating_states (group_id, user_id, rating, rd, volatility, games_played, rank) values (v_group_id, v_actor, 1500, 350, .06, 0, 1);
  v_result := jsonb_build_object('groupId', v_group_id);
  perform public.complete_command(p_command_id, v_result);
  return v_result;
end; $$;

create or replace function public.command_create_guest_players(p_command_id uuid, p_group_id uuid, p_names jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_existing jsonb; v_result jsonb; v_name text; v_guest_id uuid; v_players jsonb := '[]'::jsonb;
begin
  v_existing := public.begin_command(p_command_id, 'create_guest_players');
  if v_existing is not null then return v_existing; end if;
  perform public.require_active_member(p_group_id);
  if jsonb_typeof(p_names) <> 'array' or jsonb_array_length(p_names) not between 1 and 4 then raise exception using errcode = 'MRVAL', message = 'Invalid guest players'; end if;
  for v_name in select btrim(value #>> '{}') from jsonb_array_elements(p_names) loop
    if char_length(v_name) not between 1 and 80 then raise exception using errcode = 'MRVAL', message = 'Invalid guest name'; end if;
    insert into public.profiles (display_name, first_name, last_name, is_guest)
    values (v_name, split_part(v_name, ' ', 1), btrim(regexp_replace(v_name, '^\\S+\\s*', '')), true) returning id into v_guest_id;
    insert into public.group_memberships (group_id, user_id, role, status) values (p_group_id, v_guest_id, 'member', 'active');
    insert into public.group_rating_states (group_id, user_id, rating, rd, volatility, games_played) values (p_group_id, v_guest_id, 1500, 350, .06, 0);
    v_players := v_players || jsonb_build_array(jsonb_build_object('id', v_guest_id, 'name', v_name));
  end loop;
  v_result := jsonb_build_object('players', v_players);
  perform public.complete_command(p_command_id, v_result); return v_result;
end; $$;

create or replace function public.command_join_group_by_invite(p_command_id uuid, p_invite_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_existing jsonb; v_invite public.group_invites%rowtype; v_actor uuid := auth.uid(); v_count integer; v_result jsonb;
begin
  v_existing := public.begin_command(p_command_id, 'join_group_by_invite'); if v_existing is not null then return v_existing; end if;
  select * into v_invite from public.group_invites where id = p_invite_id for update;
  if not found or v_invite.revoked_at is not null or (v_invite.expires_at is not null and v_invite.expires_at <= now()) or (v_invite.max_uses is not null and v_invite.use_count >= v_invite.max_uses) then raise exception using errcode = 'MRVAL', message = 'Invite is not valid'; end if;
  insert into public.group_memberships (group_id, user_id, role, status, left_at) values (v_invite.group_id, v_actor, 'member', 'active', null)
    on conflict (group_id, user_id) do update set status = 'active', left_at = null;
  insert into public.group_invite_redemptions (invite_id, user_id) values (v_invite.id, v_actor) on conflict (invite_id, user_id) do nothing;
  if found then update public.group_invites set use_count = use_count + 1 where id = v_invite.id; end if;
  insert into public.group_rating_states (group_id, user_id, rating, rd, volatility, games_played) values (v_invite.group_id, v_actor, 1500, 350, .06, 0) on conflict (group_id, user_id) do nothing;
  select count(*) into v_count from public.profiles p join public.group_memberships gm on gm.user_id = p.id where gm.group_id = v_invite.group_id and gm.status = 'active' and gm.left_at is null and p.is_guest;
  v_result := jsonb_build_object('groupId', v_invite.group_id, 'claimableProfileCount', v_count); perform public.complete_command(p_command_id, v_result); return v_result;
end; $$;

create or replace function public.command_claim_guest_profiles(p_command_id uuid, p_group_id uuid, p_guest_ids uuid[])
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_existing jsonb; v_actor uuid := auth.uid(); v_job_id uuid; v_result jsonb;
begin
  v_existing := public.begin_command(p_command_id, 'claim_guest_profiles'); if v_existing is not null then return v_existing; end if;
  perform public.require_active_member(p_group_id);
  perform 1 from public.groups where id = p_group_id for update;
  if coalesce(array_length(p_guest_ids, 1), 0) = 0 or exists (select 1 from unnest(p_guest_ids) id group by id having count(*) > 1) then raise exception using errcode = 'MRVAL', message = 'Invalid guest profiles'; end if;
  if exists (select 1 from unnest(p_guest_ids) id left join public.profiles p on p.id = id left join public.group_memberships gm on gm.user_id = id and gm.group_id = p_group_id where p.is_guest is distinct from true or gm.status <> 'active' or gm.left_at is not null) then raise exception using errcode = 'MRVAL', message = 'Guest profile is not claimable'; end if;
  if exists (select 1 from public.match_participants mp join public.match_revisions mr on mr.id = mp.revision_id join public.matches m on m.id = mr.match_id where m.group_id = p_group_id and mp.user_id = v_actor and exists (select 1 from public.match_participants other where other.revision_id = mp.revision_id and other.user_id = any(p_guest_ids))) then raise exception using errcode = 'MRVAL', message = 'Guest claim would duplicate a match participant'; end if;
  update public.match_participants mp set user_id = v_actor from public.match_revisions mr, public.matches m where mp.revision_id = mr.id and mr.match_id = m.id and m.group_id = p_group_id and mp.user_id = any(p_guest_ids);
  update public.group_memberships set status = 'left', left_at = now() where group_id = p_group_id and user_id = any(p_guest_ids);
  delete from public.group_rating_states where group_id = p_group_id and user_id = any(p_guest_ids);
  v_job_id := public.enqueue_rating_rebuild(p_group_id, null, v_actor);
  v_result := jsonb_build_object('groupId', p_group_id, 'ratingJobId', v_job_id, 'ratingStatus', 'queued'); perform public.complete_command(p_command_id, v_result); return v_result;
end; $$;

create or replace function public.command_submit_match(p_command_id uuid, p_group_id uuid, p_draft_id uuid, p_format public.match_format, p_team_a uuid[], p_team_b uuid[], p_games jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_existing jsonb; v_actor uuid := auth.uid(); v_match_id uuid; v_revision_id uuid; v_job_id uuid; v_game jsonb; v_n integer := 0; v_a_wins integer := 0; v_b_wins integer := 0; v_result jsonb;
begin
  v_existing := public.begin_command(p_command_id, 'submit_match'); if v_existing is not null then return v_existing; end if;
  perform public.require_active_member(p_group_id); perform 1 from public.groups where id = p_group_id for update;
  if cardinality(p_team_a) <> (case when p_format = 'singles' then 1 else 2 end) or cardinality(p_team_b) <> (case when p_format = 'singles' then 1 else 2 end) or (select count(distinct player_id) from unnest(p_team_a || p_team_b) as players(player_id)) <> cardinality(p_team_a) + cardinality(p_team_b) then raise exception using errcode = 'MRVAL', message = 'Invalid match teams'; end if;
  if exists (select 1 from unnest(p_team_a || p_team_b) as players(player_id) where not exists (select 1 from public.group_memberships gm where gm.group_id = p_group_id and gm.user_id = players.player_id and gm.status = 'active' and gm.left_at is null)) then raise exception using errcode = 'MRVAL', message = 'Match player is not active'; end if;
  if jsonb_typeof(p_games) <> 'array' or jsonb_array_length(p_games) not between 1 and 7 then raise exception using errcode = 'MRVAL', message = 'Invalid games'; end if;
  for v_game in select value from jsonb_array_elements(p_games) loop
    v_n := v_n + 1; if (v_game->>'teamAScore')::integer = (v_game->>'teamBScore')::integer then raise exception using errcode = 'MRVAL', message = 'Games cannot tie'; end if;
    if (v_game->>'teamAScore')::integer > (v_game->>'teamBScore')::integer then v_a_wins := v_a_wins + 1; else v_b_wins := v_b_wins + 1; end if;
  end loop;
  if v_a_wins = v_b_wins then raise exception using errcode = 'MRVAL', message = 'Match requires a winner'; end if;
  if p_draft_id is null and not (v_actor = any(p_team_a || p_team_b)) then raise exception using errcode = 'MRVAL', message = 'Submitter must play in the match'; end if;
  if p_draft_id is not null and not exists (select 1 from public.active_match_drafts d where d.id = p_draft_id and d.group_id = p_group_id and d.created_by_user_id = v_actor and d.submitted_match_id is null and d.expires_at > now() for update) then raise exception using errcode = 'MRVAL', message = 'Active match is unavailable'; end if;
  insert into public.matches (group_id, created_by_user_id, status) values (p_group_id, v_actor, 'pending_confirmation') returning id into v_match_id;
  insert into public.match_revisions (match_id, version, submitted_by_user_id, format, status) values (v_match_id, 1, v_actor, p_format, 'active') returning id into v_revision_id;
  insert into public.match_participants (revision_id, user_id, team, slot) select v_revision_id, id, 'A'::public.team_code, ordinality::integer from unnest(p_team_a) with ordinality as t(id, ordinality) union all select v_revision_id, id, 'B'::public.team_code, ordinality::integer from unnest(p_team_b) with ordinality as t(id, ordinality);
  insert into public.match_games (revision_id, game_number, team_a_score, team_b_score, winner_team) select v_revision_id, ordinality, (value->>'teamAScore')::integer, (value->>'teamBScore')::integer, case when (value->>'teamAScore')::integer > (value->>'teamBScore')::integer then 'A'::public.team_code else 'B'::public.team_code end from jsonb_array_elements(p_games) with ordinality;
  update public.matches set active_revision_id = v_revision_id where id = v_match_id;
  if p_draft_id is not null then update public.active_match_drafts set submitted_match_id = v_match_id where id = p_draft_id; end if;
  v_job_id := public.enqueue_rating_rebuild(p_group_id, v_match_id, v_actor);
  v_result := jsonb_build_object('matchId', v_match_id, 'revisionId', v_revision_id, 'ratingJobId', v_job_id, 'ratingStatus', 'queued'); perform public.complete_command(p_command_id, v_result); return v_result;
end; $$;

create or replace function public.command_revise_match(p_command_id uuid, p_match_id uuid, p_expected_revision_id uuid, p_format public.match_format, p_team_a uuid[], p_team_b uuid[], p_games jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_existing jsonb; v_match public.matches%rowtype; v_revision_id uuid; v_job_id uuid; v_result jsonb; v_game jsonb; v_a_wins integer := 0; v_b_wins integer := 0;
begin
  v_existing := public.begin_command(p_command_id, 'revise_match'); if v_existing is not null then return v_existing; end if;
  select * into v_match from public.matches where id = p_match_id for update;
  if not found or v_match.active_revision_id <> p_expected_revision_id then raise exception using errcode = 'MR409', message = 'Stale match revision'; end if;
  perform public.require_active_member(v_match.group_id); perform 1 from public.groups where id = v_match.group_id for update;
  -- Use the validated submit command shape by creating a revision directly after team/game checks.
  if cardinality(p_team_a) <> (case when p_format = 'singles' then 1 else 2 end) or cardinality(p_team_b) <> (case when p_format = 'singles' then 1 else 2 end) or (select count(distinct player_id) from unnest(p_team_a || p_team_b) as players(player_id)) <> cardinality(p_team_a) + cardinality(p_team_b) or jsonb_typeof(p_games) <> 'array' or jsonb_array_length(p_games) not between 1 and 7 then raise exception using errcode = 'MRVAL', message = 'Invalid revision'; end if;
  if exists (select 1 from unnest(p_team_a || p_team_b) as players(player_id) where not exists (select 1 from public.group_memberships gm where gm.group_id = v_match.group_id and gm.user_id = players.player_id and gm.status = 'active' and gm.left_at is null)) then raise exception using errcode = 'MRVAL', message = 'Match player is not active'; end if;
  for v_game in select value from jsonb_array_elements(p_games) loop
    if (v_game->>'teamAScore')::integer = (v_game->>'teamBScore')::integer then raise exception using errcode = 'MRVAL', message = 'Games cannot tie'; end if;
    if (v_game->>'teamAScore')::integer > (v_game->>'teamBScore')::integer then v_a_wins := v_a_wins + 1; else v_b_wins := v_b_wins + 1; end if;
  end loop;
  if v_a_wins = v_b_wins then raise exception using errcode = 'MRVAL', message = 'Match requires a winner'; end if;
  insert into public.match_revisions (match_id, version, submitted_by_user_id, format, status) select v_match.id, coalesce(max(version), 0) + 1, auth.uid(), p_format, 'active' from public.match_revisions where match_id = v_match.id returning id into v_revision_id;
  insert into public.match_participants (revision_id, user_id, team, slot) select v_revision_id, id, 'A'::public.team_code, ordinality::integer from unnest(p_team_a) with ordinality as t(id, ordinality) union all select v_revision_id, id, 'B'::public.team_code, ordinality::integer from unnest(p_team_b) with ordinality as t(id, ordinality);
  insert into public.match_games (revision_id, game_number, team_a_score, team_b_score, winner_team) select v_revision_id, ordinality, (value->>'teamAScore')::integer, (value->>'teamBScore')::integer, case when (value->>'teamAScore')::integer > (value->>'teamBScore')::integer then 'A'::public.team_code else 'B'::public.team_code end from jsonb_array_elements(p_games) with ordinality;
  update public.matches set active_revision_id = v_revision_id, status = 'pending_confirmation' where id = v_match.id;
  v_job_id := public.enqueue_rating_rebuild(v_match.group_id, v_match.id, auth.uid());
  v_result := jsonb_build_object('matchId', v_match.id, 'revisionId', v_revision_id, 'ratingJobId', v_job_id, 'ratingStatus', 'queued'); perform public.complete_command(p_command_id, v_result); return v_result;
end; $$;

create or replace function public.command_review_match(p_command_id uuid, p_revision_id uuid, p_action public.confirmation_action)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_existing jsonb; v_revision public.match_revisions%rowtype; v_group_id uuid; v_submitter_team public.team_code; v_reviewer_team public.team_code; v_result jsonb;
begin
  v_existing := public.begin_command(p_command_id, 'review_match'); if v_existing is not null then return v_existing; end if;
  select mr.* into v_revision from public.match_revisions mr join public.matches m on m.id = mr.match_id where mr.id = p_revision_id for update;
  if not found then raise exception using errcode = 'MRVAL', message = 'Revision not found'; end if;
  select group_id into v_group_id from public.matches where id = v_revision.match_id; perform public.require_active_member(v_group_id);
  select team into v_submitter_team from public.match_participants where revision_id = p_revision_id and user_id = v_revision.submitted_by_user_id;
  select team into v_reviewer_team from public.match_participants where revision_id = p_revision_id and user_id = auth.uid();
  if v_submitter_team is null or v_reviewer_team is null or v_submitter_team = v_reviewer_team then raise exception using errcode = 'MRREV', message = 'Opposing participant required'; end if;
  insert into public.match_confirmations (revision_id, user_id, action) values (p_revision_id, auth.uid(), p_action);
  update public.matches set status = case when p_action = 'confirmed' then 'confirmed'::public.match_status else 'disputed'::public.match_status end where id = v_revision.match_id;
  v_result := jsonb_build_object('revisionId', p_revision_id); perform public.complete_command(p_command_id, v_result); return v_result;
end; $$;

-- Service-only worker RPCs.
create or replace function public.claim_rating_rebuild_dispatch(p_job_id uuid, p_dispatch_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.rating_rebuild_jobs set dispatch_token = p_dispatch_token, dispatch_lease_expires_at = now() + interval '45 seconds', updated_at = now()
  where id = p_job_id and status = 'queued' and (dispatch_token is null or dispatch_lease_expires_at < now());
  return found;
end; $$;

create or replace function public.begin_rating_rebuild(p_job_id uuid, p_dispatch_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_job public.rating_rebuild_jobs%rowtype; v_history jsonb;
begin
  select * into v_job from public.rating_rebuild_jobs where id = p_job_id for update;
  if not found or v_job.status not in ('queued', 'running') or v_job.dispatch_token <> p_dispatch_token then return null; end if;
  update public.rating_rebuild_jobs set status = 'running', started_at = coalesce(started_at, now()), attempt_count = attempt_count + 1, updated_at = now() where id = p_job_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'revisionId', mr.id, 'submittedAt', m.submitted_at, 'format', mr.format, 'teamAUserIds', participants.team_a, 'teamBUserIds', participants.team_b, 'games', games.items) order by m.submitted_at, m.id), '[]'::jsonb) into v_history
  from public.matches m join public.match_revisions mr on mr.id = m.active_revision_id
  join lateral (select jsonb_agg(user_id order by slot) filter (where team = 'A') team_a, jsonb_agg(user_id order by slot) filter (where team = 'B') team_b from public.match_participants where revision_id = mr.id) participants on true
  join lateral (select jsonb_agg(jsonb_build_object('teamAScore', team_a_score, 'teamBScore', team_b_score) order by game_number) items from public.match_games where revision_id = mr.id) games on true
  where m.group_id = v_job.group_id;
  return jsonb_build_object('groupId', v_job.group_id, 'jobId', v_job.id, 'targetVersion', v_job.target_version, 'history', v_history);
end; $$;

create or replace function public.apply_rating_rebuild(p_job_id uuid, p_expected_version bigint, p_ratings jsonb, p_events jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_job public.rating_rebuild_jobs%rowtype; v_current bigint;
begin
  select * into v_job from public.rating_rebuild_jobs where id = p_job_id for update;
  if not found then raise exception using errcode = 'MR404', message = 'Rating job not found'; end if;
  select rating_input_version into v_current from public.groups where id = v_job.group_id for update;
  if v_current <> p_expected_version or v_job.target_version <> p_expected_version then return jsonb_build_object('status', 'stale', 'targetVersion', v_current); end if;
  delete from public.rating_events where group_id = v_job.group_id;
  delete from public.group_rating_states where group_id = v_job.group_id;
  insert into public.group_rating_states (group_id, user_id, rating, rd, volatility, games_played, rank) select v_job.group_id, (value->>'userId')::uuid, (value->>'rating')::numeric, (value->>'rd')::numeric, (value->>'volatility')::numeric, (value->>'gamesPlayed')::integer, (value->>'rank')::integer from jsonb_array_elements(p_ratings);
  insert into public.rating_events (group_id, match_id, revision_id, user_id, sequence, before_rating, before_rd, before_volatility, after_rating, after_rd, after_volatility) select v_job.group_id, (value->>'matchId')::uuid, (value->>'revisionId')::uuid, (value->>'userId')::uuid, (value->>'sequence')::integer, (value->'before'->>'rating')::numeric, (value->'before'->>'rd')::numeric, (value->'before'->>'volatility')::numeric, (value->'after'->>'rating')::numeric, (value->'after'->>'rd')::numeric, (value->'after'->>'volatility')::numeric from jsonb_array_elements(p_events);
  update public.groups set rating_applied_version = p_expected_version where id = v_job.group_id;
  update public.rating_rebuild_jobs set status = 'completed', completed_at = now(), error = null, updated_at = now() where id = p_job_id;
  return jsonb_build_object('status', 'completed');
end; $$;

create or replace function public.fail_rating_rebuild(p_job_id uuid, p_error text)
returns void language sql security definer set search_path = '' as $$
  update public.rating_rebuild_jobs set status = 'failed', error = left(p_error, 1000), updated_at = now() where id = p_job_id and status in ('queued', 'running');
$$;

create or replace function public.retry_rating_rebuild(p_command_id uuid, p_job_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_existing jsonb; v_job public.rating_rebuild_jobs%rowtype; v_result jsonb;
begin
  v_existing := public.begin_command(p_command_id, 'retry_rating_rebuild'); if v_existing is not null then return v_existing; end if;
  select * into v_job from public.rating_rebuild_jobs where id = p_job_id for update; if not found then raise exception using errcode = 'MRVAL', message = 'Rating job not found'; end if;
  perform public.require_active_member(v_job.group_id, true);
  update public.rating_rebuild_jobs set status = 'queued', target_version = (select rating_input_version from public.groups where id = v_job.group_id), error = null, dispatch_token = null, dispatch_lease_expires_at = null, workflow_run_id = null, updated_at = now() where id = p_job_id;
  v_result := jsonb_build_object('ratingJobId', p_job_id, 'ratingStatus', 'queued'); perform public.complete_command(p_command_id, v_result); return v_result;
end; $$;

create or replace function public.get_rating_rebuild_status(p_group_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_job public.rating_rebuild_jobs%rowtype;
begin
  perform public.require_active_member(p_group_id);
  select * into v_job from public.rating_rebuild_jobs where group_id = p_group_id order by created_at desc limit 1;
  if not found then return jsonb_build_object('status', null); end if;
  return jsonb_build_object('id', v_job.id, 'status', v_job.status, 'error', v_job.error, 'targetVersion', v_job.target_version);
end; $$;

revoke all on function public.begin_command(uuid, text) from public, anon, authenticated;
revoke all on function public.complete_command(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.require_active_member(uuid, boolean) from public, anon, authenticated;
revoke all on function public.enqueue_rating_rebuild(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.claim_rating_rebuild_dispatch(uuid, uuid) from public, anon, authenticated;
revoke all on function public.begin_rating_rebuild(uuid, uuid) from public, anon, authenticated;
revoke all on function public.apply_rating_rebuild(uuid, bigint, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.fail_rating_rebuild(uuid, text) from public, anon, authenticated;
revoke all on function public.get_rating_rebuild_status(uuid) from public, anon;
grant execute on function public.command_create_group(uuid, text, text), public.command_create_guest_players(uuid, uuid, jsonb), public.command_join_group_by_invite(uuid, uuid), public.command_claim_guest_profiles(uuid, uuid, uuid[]), public.command_submit_match(uuid, uuid, uuid, public.match_format, uuid[], uuid[], jsonb), public.command_revise_match(uuid, uuid, uuid, public.match_format, uuid[], uuid[], jsonb), public.command_review_match(uuid, uuid, public.confirmation_action), public.retry_rating_rebuild(uuid, uuid) to authenticated;
grant execute on function public.get_rating_rebuild_status(uuid) to authenticated;
grant execute on function public.claim_rating_rebuild_dispatch(uuid, uuid), public.begin_rating_rebuild(uuid, uuid), public.apply_rating_rebuild(uuid, bigint, jsonb, jsonb), public.fail_rating_rebuild(uuid, text) to service_role;
