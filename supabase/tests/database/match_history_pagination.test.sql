begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(16);

select ok(
  (
    select count(*) = 4
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname in (
        'rating_events_revision_idx',
        'matches_active_submitted_idx',
        'profiles_display_name_trgm_idx',
        'groups_name_trgm_idx'
      )
  ),
  'history and hydration indexes exist'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.list_match_history_page(uuid,public.match_status,text,timestamptz,uuid,integer)',
    'EXECUTE'
  ) and not has_function_privilege(
    'anon',
    'public.list_match_history_page(uuid,public.match_status,text,timestamptz,uuid,integer)',
    'EXECUTE'
  ),
  'history RPC is authenticated-only'
);

insert into public.profiles (id, display_name, first_name, last_name)
values
  ('11111111-1111-4111-8111-111111111111', 'Alice Tan', 'Alice', 'Tan'),
  ('22222222-2222-4222-8222-222222222222', 'Bea Rivera', 'Bea', 'Rivera'),
  ('33333333-3333-4333-8333-333333333333', 'Cory Shah', 'Cory', 'Shah'),
  ('44444444-4444-4444-8444-444444444444', 'Outside User', 'Outside', 'User');

insert into public.groups (id, owner_user_id, name)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Wednesday Club'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333333', 'Weekend Club');

insert into public.group_memberships (group_id, user_id, role, status)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'owner', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'member', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'member', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333333', 'owner', 'active');

insert into public.matches (id, group_id, created_by_user_id, status, submitted_at)
values
  ('a1000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'confirmed', '2026-08-13T12:00:00Z'),
  ('a1000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'disputed', '2026-08-13T12:00:00Z'),
  ('a1000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'pending_confirmation', '2026-08-12T12:00:00Z'),
  ('b1000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333333', 'confirmed', '2026-08-14T12:00:00Z');

insert into public.match_revisions (id, match_id, version, submitted_by_user_id, format)
values
  ('c1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 1, '11111111-1111-4111-8111-111111111111', 'singles'),
  ('c1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 1, '33333333-3333-4333-8333-333333333333', 'doubles'),
  ('c1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000003', 1, '11111111-1111-4111-8111-111111111111', 'singles'),
  ('d1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 1, '33333333-3333-4333-8333-333333333333', 'singles');

update public.matches set active_revision_id = case id
  when 'a1000000-0000-4000-8000-000000000001'::uuid then 'c1000000-0000-4000-8000-000000000001'::uuid
  when 'a1000000-0000-4000-8000-000000000002'::uuid then 'c1000000-0000-4000-8000-000000000002'::uuid
  when 'a1000000-0000-4000-8000-000000000003'::uuid then 'c1000000-0000-4000-8000-000000000003'::uuid
  else 'd1000000-0000-4000-8000-000000000001'::uuid
end;

insert into public.match_participants (revision_id, user_id, team, slot)
values
  ('c1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'A', 1),
  ('c1000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'B', 1),
  ('c1000000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', 'A', 1),
  ('c1000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'B', 1),
  ('c1000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'A', 1),
  ('c1000000-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333', 'B', 1),
  ('d1000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'A', 1),
  ('d1000000-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444', 'B', 1);

set local role authenticated;

select throws_ok(
  $$ select * from public.list_match_history_page(null, null, null, null, null, 21) $$,
  'MR401',
  'Authentication required',
  'unauthenticated callers are rejected'
);

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

select results_eq(
  $$ select id from public.list_match_history_page(null, null, null, null, null, 21) $$,
  $$ values
    ('a1000000-0000-4000-8000-000000000002'::uuid),
    ('a1000000-0000-4000-8000-000000000001'::uuid) $$,
  'global history contains only current-revision matches the member played, newest ID first on ties'
);

select results_eq(
  $$ select id from public.list_match_history_page('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, null, null, null, 21) $$,
  $$ values
    ('a1000000-0000-4000-8000-000000000002'::uuid),
    ('a1000000-0000-4000-8000-000000000001'::uuid),
    ('a1000000-0000-4000-8000-000000000003'::uuid) $$,
  'group history contains all group matches regardless of participation'
);

select results_eq(
  $$ select id from public.list_match_history_page(null, null, null, '2026-08-13T12:00:00Z', 'a1000000-0000-4000-8000-000000000002', 21) $$,
  $$ values ('a1000000-0000-4000-8000-000000000001'::uuid) $$,
  'cursor comparison is strict and includes the next ID at the same timestamp'
);

select results_eq(
  $$ select id from public.list_match_history_page(null, 'disputed', null, null, null, 21) $$,
  $$ values ('a1000000-0000-4000-8000-000000000002'::uuid) $$,
  'status filtering happens before pagination'
);

select results_eq(
  $$ select id from public.list_match_history_page(null, null, 'Bea Rivera', null, null, 21) $$,
  $$ values
    ('a1000000-0000-4000-8000-000000000002'::uuid),
    ('a1000000-0000-4000-8000-000000000001'::uuid) $$,
  'participant search covers the entire accessible history'
);

select results_eq(
  $$ select id from public.list_match_history_page(null, null, 'accepted', null, null, 21) $$,
  $$ values ('a1000000-0000-4000-8000-000000000001'::uuid) $$,
  'displayed status terms are searchable'
);

select results_eq(
  $$ select id from public.list_match_history_page('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 'Wednesday Club', null, null, 21) $$,
  $$ values
    ('a1000000-0000-4000-8000-000000000002'::uuid),
    ('a1000000-0000-4000-8000-000000000001'::uuid),
    ('a1000000-0000-4000-8000-000000000003'::uuid) $$,
  'group names are searchable'
);

select results_eq(
  $$ select id from public.list_match_history_page('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 'doubles', null, null, 21) $$,
  $$ values ('a1000000-0000-4000-8000-000000000002'::uuid) $$,
  'formats are searchable'
);

select throws_ok(
  $$ select * from public.list_match_history_page(null, null, null, null, 'a1000000-0000-4000-8000-000000000001', 21) $$,
  'MRVAL',
  'History cursor is incomplete',
  'partial cursors are rejected'
);

select throws_ok(
  $$ select * from public.list_match_history_page(null, null, null, null, null, 52) $$,
  'MRVAL',
  'History limit must be between 1 and 51',
  'oversized limits are rejected'
);

select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);

select throws_ok(
  $$ select * from public.list_match_history_page('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, null, null, null, 21) $$,
  'MR403',
  'Not an active group member',
  'outsiders cannot read group history'
);

select is_empty(
  $$ select id from public.list_match_history_page(null, null, null, null, null, 21) $$,
  'outsiders receive no cross-group history'
);

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

select results_eq(
  $$ select id from public.list_match_history_page(null, null, '%', null, null, 21) $$,
  $$ select null::uuid where false $$,
  'search wildcard characters are treated literally'
);

select * from finish();
rollback;
