alter table public.profiles
  add column active_until timestamptz;

comment on column public.profiles.active_until is
  'Derived activity expiry extended by sign-ins and submitted match participation.';

create or replace function private.sync_profile_login_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active_until timestamptz;
begin
  if new.last_sign_in_at is null then
    return new;
  end if;

  v_active_until := new.last_sign_in_at + interval '24 hours';

  update public.profiles
  set active_until = v_active_until
  where id = new.id
    and (active_until is null or active_until < v_active_until);

  return new;
end;
$$;

create or replace function private.initialize_profile_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active_until timestamptz;
begin
  select last_sign_in_at + interval '24 hours'
  into v_active_until
  from auth.users
  where id = new.id
    and last_sign_in_at is not null;

  if v_active_until is not null and (new.active_until is null or new.active_until < v_active_until) then
    update public.profiles
    set active_until = v_active_until
    where id = new.id;
  end if;

  return new;
end;
$$;

create or replace function private.sync_match_participant_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active_until timestamptz;
begin
  if new.active_revision_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.active_revision_id is not distinct from old.active_revision_id then
    return new;
  end if;

  v_active_until := new.submitted_at + interval '14 days';

  update public.profiles as profile
  set active_until = v_active_until
  where profile.id in (
    select participant.user_id
    from public.match_participants as participant
    where participant.revision_id = new.active_revision_id
  )
    and (profile.active_until is null or profile.active_until < v_active_until);

  return new;
end;
$$;

revoke all on function private.sync_profile_login_activity() from public, anon, authenticated;
revoke all on function private.initialize_profile_activity() from public, anon, authenticated;
revoke all on function private.sync_match_participant_activity() from public, anon, authenticated;

drop trigger if exists sync_profile_login_activity on auth.users;
create trigger sync_profile_login_activity
  after insert or update of last_sign_in_at on auth.users
  for each row execute function private.sync_profile_login_activity();

drop trigger if exists initialize_profile_activity on public.profiles;
create trigger initialize_profile_activity
  after insert on public.profiles
  for each row execute function private.initialize_profile_activity();

drop trigger if exists sync_match_participant_activity on public.matches;
create trigger sync_match_participant_activity
  after insert or update of active_revision_id on public.matches
  for each row execute function private.sync_match_participant_activity();

revoke insert, update on table public.profiles from authenticated;
grant insert (
  id,
  display_name,
  first_name,
  last_name,
  is_guest,
  avatar_url,
  created_at,
  updated_at
) on public.profiles to authenticated;
grant update (
  display_name,
  first_name,
  last_name,
  is_guest,
  avatar_url,
  updated_at
) on public.profiles to authenticated;

with activity_candidates as (
  select
    auth_user.id as user_id,
    auth_user.last_sign_in_at + interval '24 hours' as active_until
  from auth.users as auth_user
  where auth_user.last_sign_in_at >= now() - interval '24 hours'

  union all

  select
    participant.user_id,
    match.submitted_at + interval '14 days' as active_until
  from public.matches as match
  join public.match_participants as participant
    on participant.revision_id = match.active_revision_id
  where match.submitted_at >= now() - interval '14 days'
), latest_activity as (
  select user_id, max(active_until) as active_until
  from activity_candidates
  group by user_id
)
update public.profiles as profile
set active_until = latest.active_until
from latest_activity as latest
where profile.id = latest.user_id
  and (profile.active_until is null or profile.active_until < latest.active_until);
