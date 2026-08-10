-- Forward-only authorization boundary for memberships and profile visibility.

revoke insert, update, delete on table public.group_memberships from public, anon, authenticated;

drop policy if exists "users can create own membership" on public.group_memberships;
drop policy if exists "users can leave own membership" on public.group_memberships;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.has_active_group_peer(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_memberships as viewer
    join public.group_memberships as profile_member
      on profile_member.group_id = viewer.group_id
    where viewer.user_id = auth.uid()
      and viewer.status = 'active'
      and viewer.left_at is null
      and profile_member.user_id = p_profile_id
      and profile_member.status = 'active'
      and profile_member.left_at is null
  );
$$;

revoke all on function private.has_active_group_peer(uuid) from public, anon, authenticated;
grant execute on function private.has_active_group_peer(uuid) to authenticated;

drop policy if exists "profiles are visible to signed-in users" on public.profiles;
create policy "profiles are visible to self or active group peers"
  on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or private.has_active_group_peer(id)
  );

create or replace function public.command_claim_guest_profiles(
  p_command_id uuid,
  p_group_id uuid,
  p_guest_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing jsonb;
  v_actor uuid := auth.uid();
  v_job_id uuid;
  v_result jsonb;
begin
  v_existing := public.begin_command(
    p_command_id,
    'claim_guest_profiles',
    jsonb_build_object(
      'groupId', p_group_id,
      'guestIds', p_guest_ids
    )
  );
  if v_existing is not null then
    return v_existing;
  end if;

  perform public.require_active_member(p_group_id);
  perform 1 from public.groups where id = p_group_id for update;

  if coalesce(array_length(p_guest_ids, 1), 0) = 0
    or exists (
      select 1
      from unnest(p_guest_ids) as requested(guest_id)
      group by requested.guest_id
      having count(*) > 1
    ) then
    raise exception using errcode = 'MRVAL', message = 'Invalid guest profiles';
  end if;

  if exists (
    select 1
    from unnest(p_guest_ids) as requested(guest_id)
    left join public.profiles as profile on profile.id = requested.guest_id
    left join public.group_memberships as membership
      on membership.user_id = requested.guest_id
      and membership.group_id = p_group_id
    where profile.is_guest is distinct from true
      or membership.status <> 'active'
      or membership.left_at is not null
  ) then
    raise exception using errcode = 'MRVAL', message = 'Guest profile is not claimable';
  end if;

  if exists (
    select 1
    from public.match_participants as participant
    join public.match_revisions as revision on revision.id = participant.revision_id
    join public.matches as match on match.id = revision.match_id
    where match.group_id = p_group_id
      and participant.user_id = v_actor
      and exists (
        select 1
        from public.match_participants as guest_participant
        where guest_participant.revision_id = participant.revision_id
          and guest_participant.user_id = any(p_guest_ids)
      )
  ) then
    raise exception using errcode = 'MRVAL', message = 'Guest claim would duplicate a match participant';
  end if;

  update public.match_participants as participant
  set user_id = v_actor
  from public.match_revisions as revision, public.matches as match
  where participant.revision_id = revision.id
    and revision.match_id = match.id
    and match.group_id = p_group_id
    and participant.user_id = any(p_guest_ids);

  update public.group_memberships
  set status = 'left', left_at = now()
  where group_id = p_group_id
    and user_id = any(p_guest_ids);

  delete from public.group_rating_states
  where group_id = p_group_id
    and user_id = any(p_guest_ids);

  v_job_id := public.enqueue_rating_rebuild(p_group_id, null, v_actor);
  v_result := jsonb_build_object(
    'groupId', p_group_id,
    'ratingJobId', v_job_id,
    'ratingStatus', 'queued'
  );
  perform public.complete_command(p_command_id, v_result);
  return v_result;
end;
$$;

create or replace function public.command_leave_group(
  p_command_id uuid,
  p_group_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing jsonb;
  v_result jsonb;
begin
  v_existing := public.begin_command(
    p_command_id,
    'leave_group',
    jsonb_build_object('groupId', p_group_id)
  );
  if v_existing is not null then
    return v_existing;
  end if;

  update public.group_memberships
  set status = 'left', left_at = now()
  where group_id = p_group_id
    and user_id = auth.uid()
    and status = 'active'
    and left_at is null;

  if not found then
    raise exception using errcode = 'MR403', message = 'Not an active group member';
  end if;

  v_result := jsonb_build_object('groupId', p_group_id);
  perform public.complete_command(p_command_id, v_result);
  return v_result;
end;
$$;

revoke all on function public.command_leave_group(uuid, uuid) from public, anon, authenticated;
grant execute on function public.command_leave_group(uuid, uuid) to authenticated;
