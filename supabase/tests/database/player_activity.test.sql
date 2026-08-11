begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

insert into auth.users (id, email, last_sign_in_at, created_at, updated_at)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'login@example.com',
    '2026-08-11 10:00:00+00',
    '2026-08-01 00:00:00+00',
    '2026-08-11 10:00:00+00'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'long-window@example.com',
    '2026-08-01 10:00:00+00',
    '2026-08-01 00:00:00+00',
    '2026-08-01 10:00:00+00'
  );

insert into public.profiles (id, display_name, first_name, last_name, is_guest)
values
  ('11111111-1111-4111-8111-111111111111', 'Login Player', 'Login', 'Player', false),
  ('22222222-2222-4222-8222-222222222222', 'Long Window', 'Long', 'Window', false),
  ('33333333-3333-4333-8333-333333333333', 'Guest Player', 'Guest', 'Player', true),
  ('44444444-4444-4444-8444-444444444444', 'New Participant', 'New', 'Participant', true),
  ('55555555-5555-4555-8555-555555555555', 'Confirmed Player', 'Confirmed', 'Player', true),
  ('66666666-6666-4666-8666-666666666666', 'Disputed Player', 'Disputed', 'Player', true);

select is(
  (select active_until from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  '2026-08-12 10:00:00+00'::timestamptz,
  'profile creation captures an existing login window'
);

update public.profiles
set active_until = '2026-09-01 00:00:00+00'
where id = '22222222-2222-4222-8222-222222222222';

update auth.users
set last_sign_in_at = '2026-08-11 11:00:00+00', updated_at = '2026-08-11 11:00:00+00'
where id = '22222222-2222-4222-8222-222222222222';

select is(
  (select active_until from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
  '2026-09-01 00:00:00+00'::timestamptz,
  'a shorter login window never replaces a longer activity window'
);

insert into public.groups (id, owner_user_id, name)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Group A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'Group B');

insert into public.matches (id, group_id, created_by_user_id, status, submitted_at)
values
  ('a1000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'pending_confirmation', '2026-08-10 12:00:00+00'),
  ('a2000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'confirmed', '2026-08-09 12:00:00+00'),
  ('a3000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'disputed', '2026-08-08 12:00:00+00');

insert into public.match_revisions (id, match_id, version, submitted_by_user_id, format)
values
  ('c1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 1, '11111111-1111-4111-8111-111111111111', 'singles'),
  ('c1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 2, '11111111-1111-4111-8111-111111111111', 'singles'),
  ('c2000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', 1, '11111111-1111-4111-8111-111111111111', 'singles'),
  ('c3000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000003', 1, '11111111-1111-4111-8111-111111111111', 'singles');

insert into public.match_participants (revision_id, user_id, team, slot)
values
  ('c1000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'A', 1),
  ('c1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'B', 1),
  ('c1000000-0000-4000-8000-000000000002', '44444444-4444-4444-8444-444444444444', 'A', 1),
  ('c1000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'B', 1),
  ('c2000000-0000-4000-8000-000000000002', '55555555-5555-4555-8555-555555555555', 'A', 1),
  ('c2000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'B', 1),
  ('c3000000-0000-4000-8000-000000000003', '66666666-6666-4666-8666-666666666666', 'A', 1),
  ('c3000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'B', 1);

update public.matches
set active_revision_id = case id
  when 'a1000000-0000-4000-8000-000000000001' then 'c1000000-0000-4000-8000-000000000001'::uuid
  when 'a2000000-0000-4000-8000-000000000002' then 'c2000000-0000-4000-8000-000000000002'::uuid
  when 'a3000000-0000-4000-8000-000000000003' then 'c3000000-0000-4000-8000-000000000003'::uuid
end;

select is(
  (select active_until from public.profiles where id = '33333333-3333-4333-8333-333333333333'),
  '2026-08-24 12:00:00+00'::timestamptz,
  'an unclaimed guest receives the global pending-match activity window'
);
select is(
  (select active_until from public.profiles where id = '55555555-5555-4555-8555-555555555555'),
  '2026-08-23 12:00:00+00'::timestamptz,
  'a confirmed match extends participant activity'
);
select is(
  (select active_until from public.profiles where id = '66666666-6666-4666-8666-666666666666'),
  '2026-08-22 12:00:00+00'::timestamptz,
  'a disputed match extends participant activity'
);

update public.matches
set active_revision_id = 'c1000000-0000-4000-8000-000000000002'
where id = 'a1000000-0000-4000-8000-000000000001';

select is(
  (select active_until from public.profiles where id = '44444444-4444-4444-8444-444444444444'),
  '2026-08-24 12:00:00+00'::timestamptz,
  'a revision extends activity for a newly added participant'
);
select is(
  (select active_until from public.profiles where id = '33333333-3333-4333-8333-333333333333'),
  '2026-08-24 12:00:00+00'::timestamptz,
  'a revision does not shorten activity for a removed participant'
);

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'active_until', 'INSERT'),
  'authenticated callers cannot insert a derived activity expiry'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'active_until', 'UPDATE'),
  'authenticated callers cannot update a derived activity expiry'
);
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'display_name', 'INSERT')
    and has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE'),
  'authenticated callers retain intended profile field privileges'
);
select ok(
  has_column_privilege('service_role', 'public.profiles', 'active_until', 'INSERT')
    and has_column_privilege('service_role', 'public.profiles', 'active_until', 'UPDATE'),
  'the service role can maintain derived activity'
);
select ok(
  not has_function_privilege('authenticated', 'private.sync_profile_login_activity()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.initialize_profile_activity()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.sync_match_participant_activity()', 'EXECUTE'),
  'authenticated callers cannot execute activity trigger functions directly'
);

select * from finish();
rollback;
