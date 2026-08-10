begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(18);

insert into public.profiles (id, display_name, first_name, last_name, is_guest)
values
  ('11111111-1111-4111-8111-111111111111', 'Owner', 'Owner', '', false),
  ('22222222-2222-4222-8222-222222222222', 'Member', 'Member', '', false),
  ('33333333-3333-4333-8333-333333333333', 'Opponent', 'Opponent', '', false),
  ('44444444-4444-4444-8444-444444444444', 'Outsider', 'Outsider', '', false),
  ('55555555-5555-4555-8555-555555555555', 'Guest', 'Guest', '', true),
  ('66666666-6666-4666-8666-666666666666', 'Claimant', 'Claimant', '', false);

insert into public.groups (id, owner_user_id, name)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Test Ladder');

insert into public.group_memberships (group_id, user_id, role, status)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'owner', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'member', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'member', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '55555555-5555-4555-8555-555555555555', 'member', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '66666666-6666-4666-8666-666666666666', 'member', 'active');

insert into public.matches (id, group_id, created_by_user_id)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111');

insert into public.match_revisions (id, match_id, version, submitted_by_user_id, format)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 1, '11111111-1111-4111-8111-111111111111', 'singles');

insert into public.match_participants (revision_id, user_id, team, slot)
values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '55555555-5555-4555-8555-555555555555', 'A', 1),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '33333333-3333-4333-8333-333333333333', 'B', 1);

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);

select ok(
  not has_table_privilege('authenticated', 'public.group_memberships', 'INSERT, UPDATE, DELETE'),
  'authenticated callers have no direct membership mutation privileges'
);
select throws_ok(
  $$
    insert into public.group_memberships (group_id, user_id, role, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', 'owner', 'active')
  $$,
  '42501',
  'permission denied for table group_memberships',
  'an authenticated caller cannot directly add a membership'
);
select throws_ok(
  $$
    update public.group_memberships
    set role = 'owner'
  $$,
  '42501',
  'permission denied for table group_memberships',
  'an authenticated caller cannot directly change a membership'
);

select ok(
  has_function_privilege('authenticated', 'public.command_leave_group(uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.command_leave_group(uuid,uuid)', 'EXECUTE'),
  'leave command is authenticated-only'
);
select ok(
  has_function_privilege('authenticated', 'private.has_active_group_peer(uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'private.has_active_group_peer(uuid)', 'EXECUTE'),
  'the private RLS helper has only the privileges required by authenticated policies'
);

select is(
  (select count(*) from public.profiles),
  5::bigint,
  'an active member can read self and active profiles from the same group'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}',
  true
);
select is(
  (select count(*) from public.profiles),
  1::bigint,
  'an outsider can read only their own profile'
);
select is_empty(
  $$
    select id from public.profiles
    where id = '22222222-2222-4222-8222-222222222222'
  $$,
  'an outsider cannot read an unrelated member profile'
);
select throws_ok(
  $$
    select public.command_leave_group(
      '01010101-0101-4101-8101-010101010101',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    )
  $$,
  'MR403',
  'Not an active group member',
  'an outsider cannot leave a group they never joined'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
select lives_ok(
  $$
    select public.command_leave_group(
      '02020202-0202-4202-8202-020202020202',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    )
  $$,
  'an active member can leave their group through the command'
);
reset role;
select is(
  (select status::text from public.group_memberships where group_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id = '22222222-2222-4222-8222-222222222222'),
  'left',
  'the leave command marks the member as left'
);
set local role authenticated;
select is(
  public.command_leave_group(
    '02020202-0202-4202-8202-020202020202',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  jsonb_build_object('groupId', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid),
  'an identical leave retry replays its command receipt'
);
select throws_ok(
  $$
    select public.command_leave_group(
      '02020202-0202-4202-8202-020202020202',
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    )
  $$,
  'MRCMD',
  'Command ID was reused with different input',
  'a leave command receipt rejects a changed group input'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select lives_ok(
  $$
    select public.command_leave_group(
      '03030303-0303-4303-8303-030303030303',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    )
  $$,
  'a group owner can leave without blocking owner departure'
);
reset role;
select is(
  (select status::text from public.group_memberships where group_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id = '11111111-1111-4111-8111-111111111111'),
  'left',
  'owner departure marks the owner membership as left'
);
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}',
  true
);
select lives_ok(
  $$
    select public.command_claim_guest_profiles(
      '04040404-0404-4404-8404-040404040404',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      array['55555555-5555-4555-8555-555555555555']::uuid[]
    )
  $$,
  'every remaining active member can claim guest history'
);
reset role;
select is(
  (select user_id from public.match_participants where revision_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and team = 'A'),
  '66666666-6666-4666-8666-666666666666'::uuid,
  'guest match history transfers to the claiming active member'
);
select is(
  (select status::text from public.group_memberships where group_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id = '55555555-5555-4555-8555-555555555555'),
  'left',
  'guest membership is retired after its history is claimed'
);

select * from finish();
rollback;
