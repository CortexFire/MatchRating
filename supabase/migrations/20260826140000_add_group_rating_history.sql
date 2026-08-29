create or replace function private.navigation_group_rating_history(p_group_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with bounds as (
    select now() - interval '12 months' as window_start, now() as window_end
  ),
  ranked_players as (
    select gr.user_id
    from public.group_rating_states gr
    join private.visible_group_memberships(array[p_group_id]) vm
      on vm.group_id = gr.group_id and vm.user_id = gr.user_id
    where gr.group_id = p_group_id
      and gr.games_played > 0
    order by round(gr.rating) desc,
      coalesce(vm.display_name, 'Unknown player') collate "C",
      gr.user_id
    limit 10
  ),
  match_points as (
    select
      event.user_id,
      event.match_id,
      max(event.occurred_at) as occurred_at,
      (array_agg(event.before_rating order by event.sequence))[1] as before_rating,
      (array_agg(event.after_rating order by event.sequence desc))[1] as after_rating,
      max(event.sequence) as sequence
    from public.rating_events event
    join ranked_players ranked on ranked.user_id = event.user_id
    where event.group_id = p_group_id
    group by event.user_id, event.match_id
  ),
  boundary_points as (
    select distinct on (point.user_id) point.*
    from match_points point
    cross join bounds
    where point.occurred_at < bounds.window_start
    order by point.user_id, point.occurred_at desc, point.sequence desc, point.match_id desc
  ),
  visible_points as (
    select point.*
    from match_points point
    cross join bounds
    where point.occurred_at between bounds.window_start and bounds.window_end
    union all
    select boundary.* from boundary_points boundary
  )
  select jsonb_build_object(
    'windowStart', bounds.window_start,
    'windowEnd', bounds.window_end,
    'events', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', point.user_id,
          'match_id', point.match_id,
          'occurred_at', point.occurred_at,
          'before_rating', point.before_rating,
          'after_rating', point.after_rating
        )
        order by point.occurred_at, point.sequence, point.user_id, point.match_id
      )
      from visible_points point
    ), '[]'::jsonb)
  )
  from bounds;
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
        select gr.group_id, gr.user_id, gr.rating, gr.rd, gr.games_played, gr.consistency_log_mean
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
    'ratingHistory', private.navigation_group_rating_history(p_group_id),
    'matchBundle', private.navigation_match_bundle(v_match_ids)
  );
end;
$$;

revoke all on function private.navigation_group_rating_history(uuid) from public, anon, authenticated;
revoke all on function public.get_group_page_data(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_group_page_data(uuid, integer) to authenticated;
