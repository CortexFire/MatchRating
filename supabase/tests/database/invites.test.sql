begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

insert into public.profiles (id, display_name, first_name, last_name)
values
  ('11111111-1111-4111-8111-111111111111', 'Owner', 'Owner', ''),
  ('22222222-2222-4222-8222-222222222222', 'Invitee', 'Invitee', '');

insert into public.groups (id, owner_user_id, name)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Invite Test Group');

insert into public.group_memberships (group_id, user_id, role, status)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'owner', 'active');

insert into public.group_invites (id, group_id, token_hash, created_by_user_id, expires_at, max_uses)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'invite-test-permanent-token-hash',
  '11111111-1111-4111-8111-111111111111',
  null,
  null
);

select throws_ok(
  $$
    insert into public.group_invites (group_id, token_hash, created_by_user_id)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'invite-test-duplicate-active-token-hash',
      '11111111-1111-4111-8111-111111111111'
    )
  $$,
  '23505',
  'duplicate key value violates unique constraint "group_invites_one_active_per_group_idx"',
  'only one active invite can exist for a group'
);

create temporary table invite_test_state (
  name text primary key,
  value jsonb not null
) on commit drop;
grant select, insert on invite_test_state to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);

insert into invite_test_state (name, value)
select 'first-redemption', public.command_join_group_by_invite(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
);

select is(
  (select (value->>'groupId')::uuid from invite_test_state where name = 'first-redemption'),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  'redeeming an invite returns its group ID'
);
reset role;
select is(
  (select count(*) from public.group_memberships where group_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id = '22222222-2222-4222-8222-222222222222' and status = 'active' and left_at is null),
  1::bigint,
  'redeeming an invite creates exactly one active membership'
);
select is(
  (select count(*) from public.group_invite_redemptions where invite_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and user_id = '22222222-2222-4222-8222-222222222222'),
  1::bigint,
  'redeeming an invite creates exactly one redemption row'
);
select is(
  (select use_count from public.group_invites where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  1,
  'redeeming an invite increments its use count once'
);
select is(
  (select count(*) from public.group_rating_states where group_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id = '22222222-2222-4222-8222-222222222222' and rating = 1500 and rd = 350),
  1::bigint,
  'redeeming an invite creates one initial rating state with rating 1500 and RD 350'
);

set local role authenticated;
select is(
  public.command_join_group_by_invite(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ),
  (select value from invite_test_state where name = 'first-redemption'),
  'an identical invite redemption retry replays the original result'
);
reset role;
select is(
  (select count(*) from public.group_memberships where group_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id = '22222222-2222-4222-8222-222222222222' and status = 'active' and left_at is null),
  1::bigint,
  'an identical invite redemption retry keeps one active membership'
);
select is(
  (select count(*) from public.group_invite_redemptions where invite_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and user_id = '22222222-2222-4222-8222-222222222222'),
  1::bigint,
  'an identical invite redemption retry keeps one redemption row'
);
select is(
  (select use_count from public.group_invites where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  1,
  'an identical invite redemption retry keeps the use count at one'
);

select * from finish();
rollback;
