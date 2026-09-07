create or replace function public.sync_active_match_draft_v2(
  p_draft_id uuid,
  p_group_id uuid,
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
  v_actor uuid := auth.uid();
  v_draft public.active_match_drafts%rowtype;
  v_game jsonb;
  v_player_id uuid;
  v_team_size integer;
  v_is_blank boolean;
begin
  if v_actor is null then
    raise exception using errcode = 'MR401', message = 'You must be signed in to do that.';
  end if;

  perform 1
  from public.group_memberships membership
  where membership.group_id = p_group_id
    and membership.user_id = v_actor
    and membership.status = 'active'
    and membership.left_at is null;
  if not found then
    raise exception using errcode = 'MR403', message = 'You are not an active member of this group.';
  end if;

  if p_format is null or p_team_a is null or p_team_b is null then
    raise exception using errcode = 'MRVAL', message = 'Invalid active match draft.';
  end if;

  v_team_size := case p_format when 'singles' then 1 else 2 end;
  if cardinality(p_team_a) > v_team_size or cardinality(p_team_b) > v_team_size then
    raise exception using
      errcode = 'MRVAL',
      message = format(
        '%s drafts allow at most %s player%s per team.',
        p_format,
        v_team_size,
        case when v_team_size = 1 then '' else 's' end
      );
  end if;

  if array_position(p_team_a, null) is not null or array_position(p_team_b, null) is not null then
    raise exception using errcode = 'MRVAL', message = 'Invalid active match draft.';
  end if;

  if exists (
    select 1
    from unnest(p_team_a || p_team_b) player(player_id)
    group by player_id
    having count(*) > 1
  ) then
    raise exception using errcode = 'MRVAL', message = 'A draft cannot contain duplicate players.';
  end if;

  select player.player_id into v_player_id
  from unnest(p_team_a || p_team_b) player(player_id)
  where not exists (
    select 1
    from public.group_memberships membership
    where membership.group_id = p_group_id
      and membership.user_id = player.player_id
      and membership.status = 'active'
      and membership.left_at is null
  )
  limit 1;
  if found then
    raise exception using
      errcode = 'MRVAL',
      message = format('Player %s is not an active member of this group.', v_player_id);
  end if;

  if p_games is null
    or jsonb_typeof(p_games) <> 'array'
    or jsonb_array_length(p_games) not between 1 and 7 then
    raise exception using errcode = 'MRVAL', message = 'Invalid active match draft.';
  end if;

  for v_game in select value from jsonb_array_elements(p_games)
  loop
    if jsonb_typeof(v_game) <> 'object'
      or not v_game ? 'teamAScore'
      or not v_game ? 'teamBScore'
      or not v_game ? 'winnerTeam'
      or jsonb_typeof(v_game->'teamAScore') not in ('number', 'null')
      or jsonb_typeof(v_game->'teamBScore') not in ('number', 'null')
      or v_game->>'winnerTeam' not in ('A', 'B') then
      raise exception using errcode = 'MRVAL', message = 'Invalid active match draft.';
    end if;

    if jsonb_typeof(v_game->'teamAScore') = 'number'
      and ((v_game->>'teamAScore')::numeric not between 0 and 99
        or (v_game->>'teamAScore')::numeric <> trunc((v_game->>'teamAScore')::numeric)) then
      raise exception using errcode = 'MRVAL', message = 'Invalid active match draft.';
    end if;
    if jsonb_typeof(v_game->'teamBScore') = 'number'
      and ((v_game->>'teamBScore')::numeric not between 0 and 99
        or (v_game->>'teamBScore')::numeric <> trunc((v_game->>'teamBScore')::numeric)) then
      raise exception using errcode = 'MRVAL', message = 'Invalid active match draft.';
    end if;
  end loop;

  v_is_blank := cardinality(p_team_a) = 0
    and cardinality(p_team_b) = 0
    and not exists (
      select 1
      from jsonb_array_elements(p_games) game(value)
      where value->'teamAScore' <> 'null'::jsonb
        or value->'teamBScore' <> 'null'::jsonb
    );

  if p_draft_id is null then
    if v_is_blank then
      return jsonb_build_object('draftId', null, 'outcome', 'unchanged');
    end if;

    insert into public.active_match_drafts (
      group_id,
      created_by_user_id,
      format,
      team_a_user_ids,
      team_b_user_ids,
      games,
      expires_at,
      updated_at
    )
    values (
      p_group_id,
      v_actor,
      p_format,
      p_team_a,
      p_team_b,
      p_games,
      now() + interval '1 day',
      now()
    )
    returning * into v_draft;

    return jsonb_build_object('draftId', v_draft.id, 'outcome', 'saved');
  end if;

  select * into v_draft
  from public.active_match_drafts draft
  where draft.id = p_draft_id
  for update;

  if not found then
    raise exception using errcode = 'MRVAL', message = 'This active match is unavailable.';
  end if;
  if v_draft.group_id <> p_group_id then
    raise exception using errcode = 'MRVAL', message = 'This active match belongs to another group.';
  end if;
  if v_draft.submitted_match_id is not null then
    raise exception using errcode = 'MRVAL', message = 'This active match was already submitted.';
  end if;
  if v_draft.expires_at <= now() then
    delete from public.active_match_drafts where id = v_draft.id;
    return jsonb_build_object(
      'draftId', null,
      'outcome', 'expired',
      'message', 'This active match expired. Start a new match.'
    );
  end if;
  if v_draft.created_by_user_id <> v_actor
    and not v_actor = any(v_draft.team_a_user_ids)
    and not v_actor = any(v_draft.team_b_user_ids) then
    raise exception using
      errcode = 'MRVAL',
      message = 'Only the match creator or a participant can edit this active match.';
  end if;

  if v_is_blank then
    delete from public.active_match_drafts where id = v_draft.id;
    return jsonb_build_object('draftId', null, 'outcome', 'deleted');
  end if;

  update public.active_match_drafts
  set format = p_format,
      team_a_user_ids = p_team_a,
      team_b_user_ids = p_team_b,
      games = p_games,
      expires_at = now() + interval '1 day',
      updated_at = now()
  where id = v_draft.id;

  return jsonb_build_object('draftId', v_draft.id, 'outcome', 'saved');
end;
$$;

revoke all on function public.sync_active_match_draft_v2(
  uuid, uuid, public.match_format, uuid[], uuid[], jsonb
) from public, anon, authenticated;
grant execute on function public.sync_active_match_draft_v2(
  uuid, uuid, public.match_format, uuid[], uuid[], jsonb
) to authenticated, service_role;
