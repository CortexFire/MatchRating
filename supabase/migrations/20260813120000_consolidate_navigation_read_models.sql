create index rating_events_revision_user_sequence_idx
  on public.rating_events (revision_id, user_id, sequence);

create or replace function private.visible_group_memberships(p_group_ids uuid[])
returns table (
  group_id uuid,
  user_id uuid,
  role public.group_role,
  display_name text,
  is_guest boolean,
  active_until timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    gm.group_id,
    gm.user_id,
    gm.role,
    p.display_name,
    coalesce(p.is_guest, false),
    p.active_until
  from public.group_memberships gm
  left join public.profiles p on p.id = gm.user_id
  where gm.group_id = any(coalesce(p_group_ids, array[]::uuid[]))
    and gm.status = 'active'
    and gm.left_at is null
    and (
      not coalesce(p.is_guest, false)
      or exists (
        select 1
        from public.active_match_drafts d
        where d.group_id = gm.group_id
          and d.submitted_match_id is null
          and d.expires_at > now()
          and (gm.user_id = any(d.team_a_user_ids) or gm.user_id = any(d.team_b_user_ids))
      )
      or exists (
        select 1
        from public.match_participants mp
        join public.match_revisions mr on mr.id = mp.revision_id
        join public.matches m on m.id = mr.match_id
        where mp.user_id = gm.user_id
          and m.group_id = gm.group_id
      )
    )
  order by gm.group_id, gm.joined_at, gm.user_id;
$$;

create or replace function private.navigation_rating_status(
  p_group_id uuid,
  p_role public.group_role
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'id', job.id,
        'status', job.status,
        'canRetry', job.status = 'failed' and p_role in ('owner', 'admin')
      )
      from public.rating_rebuild_jobs job
      where job.group_id = p_group_id
      order by job.created_at desc, job.id desc
      limit 1
    ),
    jsonb_build_object('id', null, 'status', null, 'canRetry', false)
  );
$$;

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
    'confirmations', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.revision_id, row_data.created_at, row_data.user_id)
      from (
        select mc.revision_id, mc.user_id, mc.action, mc.created_at
        from public.match_confirmations mc
        join public.matches m on m.active_revision_id = mc.revision_id
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

create or replace function public.get_home_page_data(p_match_limit integer default 3)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_group_ids uuid[] := array[]::uuid[];
  v_match_ids uuid[] := array[]::uuid[];
begin
  if v_actor is null then
    raise exception using errcode = 'MR401', message = 'Authentication required';
  end if;
  if p_match_limit is null or p_match_limit < 1 or p_match_limit > 20 then
    raise exception using errcode = 'MRVAL', message = 'Navigation match limit must be between 1 and 20';
  end if;

  select coalesce(array_agg(g.id order by g.name, g.id), array[]::uuid[])
  into v_group_ids
  from public.groups g
  join public.group_memberships gm on gm.group_id = g.id
  where gm.user_id = v_actor
    and gm.status = 'active'
    and gm.left_at is null
    and g.archived_at is null;

  select coalesce(array_agg(selected.id order by selected.submitted_at desc, selected.id desc), array[]::uuid[])
  into v_match_ids
  from (
    select m.id, m.submitted_at
    from public.matches m
    where m.group_id = any(v_group_ids)
      and m.active_revision_id is not null
      and exists (
        select 1 from public.match_participants mp
        where mp.revision_id = m.active_revision_id and mp.user_id = v_actor
      )
    order by m.submitted_at desc, m.id desc
    limit p_match_limit
  ) selected;

  return jsonb_build_object(
    'actorUserId', v_actor,
    'profile', (
      select jsonb_build_object('id', p.id, 'display_name', p.display_name)
      from public.profiles p where p.id = v_actor
    ),
    'groups', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.name, row_data.id)
      from (
        select g.id, g.name, g.description
        from public.groups g where g.id = any(v_group_ids)
      ) row_data
    ), '[]'::jsonb),
    'memberships', coalesce((
      select jsonb_agg(to_jsonb(vm) order by vm.group_id, vm.user_id)
      from private.visible_group_memberships(v_group_ids) vm
    ), '[]'::jsonb),
    'ratings', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.group_id, row_data.user_id)
      from (
        select gr.group_id, gr.user_id, gr.rating, gr.rd, gr.games_played
        from public.group_rating_states gr
        join private.visible_group_memberships(v_group_ids) vm
          on vm.group_id = gr.group_id and vm.user_id = gr.user_id
      ) row_data
    ), '[]'::jsonb),
    'drafts', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.updated_at desc, row_data.id desc)
      from (
        select d.id, d.group_id, d.created_by_user_id, d.format, d.team_a_user_ids, d.team_b_user_ids, d.games, d.expires_at, d.updated_at
        from public.active_match_drafts d
        where d.group_id = any(v_group_ids)
          and d.submitted_match_id is null
          and d.expires_at > now()
          and (d.created_by_user_id = v_actor or v_actor = any(d.team_a_user_ids) or v_actor = any(d.team_b_user_ids))
      ) row_data
    ), '[]'::jsonb),
    'profiles', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.id)
      from (
        select distinct p.id, p.display_name
        from public.profiles p
        where exists (
          select 1 from private.visible_group_memberships(v_group_ids) vm where vm.user_id = p.id
        ) or exists (
          select 1 from public.active_match_drafts d
          where d.group_id = any(v_group_ids)
            and d.submitted_match_id is null
            and d.expires_at > now()
            and (d.created_by_user_id = v_actor or v_actor = any(d.team_a_user_ids) or v_actor = any(d.team_b_user_ids))
            and (p.id = any(d.team_a_user_ids) or p.id = any(d.team_b_user_ids))
        )
      ) row_data
    ), '[]'::jsonb),
    'matchBundle', private.navigation_match_bundle(v_match_ids)
  );
end;
$$;

create or replace function public.get_group_page_data(
  p_group_id uuid,
  p_match_limit integer default 5
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.group_role;
  v_group jsonb;
  v_group_ids uuid[] := array[p_group_id];
  v_match_ids uuid[] := array[]::uuid[];
begin
  if v_actor is null then
    raise exception using errcode = 'MR401', message = 'Authentication required';
  end if;
  if p_match_limit is null or p_match_limit < 1 or p_match_limit > 20 then
    raise exception using errcode = 'MRVAL', message = 'Navigation match limit must be between 1 and 20';
  end if;

  select gm.role into v_role
  from public.group_memberships gm
  where gm.group_id = p_group_id
    and gm.user_id = v_actor
    and gm.status = 'active'
    and gm.left_at is null;
  if not found then return null; end if;

  select jsonb_build_object('id', g.id, 'name', g.name, 'description', g.description)
  into v_group
  from public.groups g
  where g.id = p_group_id and g.archived_at is null;
  if not found then return null; end if;

  select coalesce(array_agg(selected.id order by selected.submitted_at desc, selected.id desc), array[]::uuid[])
  into v_match_ids
  from (
    select m.id, m.submitted_at
    from public.matches m
    where m.group_id = p_group_id and m.active_revision_id is not null
    order by m.submitted_at desc, m.id desc
    limit p_match_limit
  ) selected;

  return jsonb_build_object(
    'actorUserId', v_actor,
    'group', v_group,
    'memberships', coalesce((
      select jsonb_agg(to_jsonb(vm) order by vm.user_id)
      from private.visible_group_memberships(v_group_ids) vm
    ), '[]'::jsonb),
    'ratings', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.user_id)
      from (
        select gr.group_id, gr.user_id, gr.rating, gr.rd, gr.games_played
        from public.group_rating_states gr
        join private.visible_group_memberships(v_group_ids) vm
          on vm.group_id = gr.group_id and vm.user_id = gr.user_id
      ) row_data
    ), '[]'::jsonb),
    'drafts', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.updated_at desc, row_data.id desc)
      from (
        select d.id, d.group_id, d.created_by_user_id, d.format, d.team_a_user_ids, d.team_b_user_ids, d.games, d.expires_at, d.updated_at
        from public.active_match_drafts d
        where d.group_id = p_group_id
          and d.submitted_match_id is null
          and d.expires_at > now()
          and (d.created_by_user_id = v_actor or v_actor = any(d.team_a_user_ids) or v_actor = any(d.team_b_user_ids))
      ) row_data
    ), '[]'::jsonb),
    'profiles', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.id)
      from (
        select distinct p.id, p.display_name
        from public.profiles p
        where exists (
          select 1 from private.visible_group_memberships(v_group_ids) vm where vm.user_id = p.id
        ) or exists (
          select 1 from public.active_match_drafts d
          where d.group_id = p_group_id
            and d.submitted_match_id is null
            and d.expires_at > now()
            and (d.created_by_user_id = v_actor or v_actor = any(d.team_a_user_ids) or v_actor = any(d.team_b_user_ids))
            and (p.id = any(d.team_a_user_ids) or p.id = any(d.team_b_user_ids))
        )
      ) row_data
    ), '[]'::jsonb),
    'ratingStatus', private.navigation_rating_status(p_group_id, v_role),
    'matchBundle', private.navigation_match_bundle(v_match_ids)
  );
end;
$$;

create or replace function public.get_match_recorder_page_data(
  p_group_id uuid,
  p_draft_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.group_role;
  v_group jsonb;
  v_group_ids uuid[] := array[]::uuid[];
  v_draft jsonb;
begin
  if v_actor is null then
    raise exception using errcode = 'MR401', message = 'Authentication required';
  end if;

  select gm.role into v_role
  from public.group_memberships gm
  where gm.group_id = p_group_id
    and gm.user_id = v_actor
    and gm.status = 'active'
    and gm.left_at is null;
  if not found then return null; end if;

  select jsonb_build_object('id', g.id, 'name', g.name, 'description', g.description)
  into v_group
  from public.groups g
  where g.id = p_group_id and g.archived_at is null;
  if not found then return null; end if;

  select coalesce(array_agg(g.id order by g.name, g.id), array[]::uuid[])
  into v_group_ids
  from public.groups g
  join public.group_memberships gm on gm.group_id = g.id
  where gm.user_id = v_actor
    and gm.status = 'active'
    and gm.left_at is null
    and g.archived_at is null;

  if p_draft_id is not null then
    select to_jsonb(row_data) into v_draft
    from (
      select d.id, d.group_id, d.created_by_user_id, d.format, d.team_a_user_ids, d.team_b_user_ids, d.games, d.expires_at
      from public.active_match_drafts d
      where d.id = p_draft_id
        and d.group_id = p_group_id
        and d.submitted_match_id is null
        and d.expires_at > now()
        and (d.created_by_user_id = v_actor or v_actor = any(d.team_a_user_ids) or v_actor = any(d.team_b_user_ids))
    ) row_data;
  end if;

  return jsonb_build_object(
    'actorUserId', v_actor,
    'group', v_group,
    'groups', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.name, row_data.id)
      from (
        select g.id, g.name, g.description
        from public.groups g where g.id = any(v_group_ids)
      ) row_data
    ), '[]'::jsonb),
    'memberships', coalesce((
      select jsonb_agg(to_jsonb(vm) order by vm.group_id, vm.user_id)
      from private.visible_group_memberships(v_group_ids) vm
    ), '[]'::jsonb),
    'ratings', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.user_id)
      from (
        select gr.group_id, gr.user_id, gr.rating, gr.rd, gr.games_played
        from public.group_rating_states gr
        join private.visible_group_memberships(array[p_group_id]) vm
          on vm.group_id = gr.group_id and vm.user_id = gr.user_id
      ) row_data
    ), '[]'::jsonb),
    'draft', v_draft,
    'profiles', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.id)
      from (
        select distinct p.id, p.display_name
        from public.profiles p
        where exists (
          select 1 from private.visible_group_memberships(v_group_ids) vm where vm.user_id = p.id
        ) or (
          v_draft is not null and (
            p.id = any(array(select jsonb_array_elements_text(v_draft->'team_a_user_ids'))::uuid[])
            or p.id = any(array(select jsonb_array_elements_text(v_draft->'team_b_user_ids'))::uuid[])
          )
        )
      ) row_data
    ), '[]'::jsonb),
    'ratingStatus', private.navigation_rating_status(p_group_id, v_role)
  );
end;
$$;

revoke all on function private.visible_group_memberships(uuid[]) from public, anon, authenticated;
revoke all on function private.navigation_rating_status(uuid, public.group_role) from public, anon, authenticated;
revoke all on function private.navigation_match_bundle(uuid[]) from public, anon, authenticated;
revoke all on function public.get_home_page_data(integer) from public, anon, authenticated;
revoke all on function public.get_group_page_data(uuid, integer) from public, anon, authenticated;
revoke all on function public.get_match_recorder_page_data(uuid, uuid) from public, anon, authenticated;

grant execute on function public.get_home_page_data(integer) to authenticated;
grant execute on function public.get_group_page_data(uuid, integer) to authenticated;
grant execute on function public.get_match_recorder_page_data(uuid, uuid) to authenticated;
