-- Route active-draft mutations through the validated server actions and allow
-- any stored participant to submit the one shared draft.

revoke insert, update, delete on table public.active_match_drafts from authenticated;

drop policy if exists "active members can create own active drafts" on public.active_match_drafts;
drop policy if exists "creators can update own active drafts" on public.active_match_drafts;
drop policy if exists "creators can delete own active drafts" on public.active_match_drafts;

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
