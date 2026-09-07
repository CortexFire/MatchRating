begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(18);

select ok(
  has_function_privilege('authenticated', 'public.list_current_user_groups_v2()', 'EXECUTE')
    and not has_function_privilege('anon', 'public.list_current_user_groups_v2()', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.get_group_member_snapshot_v2(uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.get_group_member_snapshot_v2(uuid)', 'EXECUTE'),
  'group performance RPCs are authenticated-only'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.list_match_history_bundle_v2(uuid,public.match_status,text,timestamptz,uuid,integer,uuid)',
    'EXECUTE'
  ) and not has_function_privilege(
    'anon',
    'public.list_match_history_bundle_v2(uuid,public.match_status,text,timestamptz,uuid,integer,uuid)',
    'EXECUTE'
  ),
  'history bundle RPC is authenticated-only'
);

select ok(
  has_function_privilege('service_role', 'public.list_visible_group_memberships_v2(uuid[])', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.list_visible_group_memberships_v2(uuid[])', 'EXECUTE')
    and not has_function_privilege('anon', 'public.list_visible_group_memberships_v2(uuid[])', 'EXECUTE'),
  'visibility compatibility RPC is service-role-only'
);

insert into public.profiles (id, display_name, first_name, last_name, is_guest)
values
  ('11111111-1111-4111-8111-111111111111', 'Alice Owner', 'Alice', 'Owner', false),
  ('22222222-2222-4222-8222-222222222222', 'Bea Member', 'Bea', 'Member', false),
  ('33333333-3333-4333-8333-333333333333', 'History Guest', 'History', 'Guest', true),
  ('44444444-4444-4444-8444-444444444444', 'Draft Guest', 'Draft', 'Guest', true),
  ('55555555-5555-4555-8555-555555555555', 'Orphan Guest', 'Orphan', 'Guest', true),
  ('66666666-6666-4666-8666-666666666666', 'Departed Member', 'Departed', 'Member', false),
  ('77777777-7777-4777-8777-777777777777', 'Outsider', 'Out', 'Sider', false);

insert into public.groups (id, owner_user_id, name, description, archived_at)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Wednesday Club', 'Active group', null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'Archived Club', 'Archived group', now());

insert into public.group_memberships (group_id, user_id, role, status, left_at)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'owner', 'active', null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'member', 'active', null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'member', 'active', null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', 'member', 'active', null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '55555555-5555-4555-8555-555555555555', 'member', 'active', null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '66666666-6666-4666-8666-666666666666', 'member', 'left', now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'owner', 'active', null);

insert into public.group_rating_states (group_id, user_id, rating, rd, games_played, consistency_log_mean)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 1700, 80, 22, 4.4),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 1600, 90, 10, 4.5);

insert into public.matches (id, group_id, created_by_user_id, status, submitted_at)
select
  md5('performance-page-match-' || series)::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'confirmed',
  '2026-09-01T12:00:00Z'::timestamptz + series * interval '1 minute'
from generate_series(1, 22) series;

insert into public.match_revisions (id, match_id, version, submitted_by_user_id, format)
select
  md5('performance-page-revision-' || series)::uuid,
  md5('performance-page-match-' || series)::uuid,
  1,
  '11111111-1111-4111-8111-111111111111',
  'singles'
from generate_series(1, 22) series;

update public.matches m
set active_revision_id = md5('performance-page-revision-' || series)::uuid
from generate_series(1, 22) series
where m.id = md5('performance-page-match-' || series)::uuid;

insert into public.match_participants (revision_id, user_id, team, slot)
select md5('performance-page-revision-' || series)::uuid, player.user_id, player.team, 1
from generate_series(1, 22) series
cross join (values
  ('11111111-1111-4111-8111-111111111111'::uuid, 'A'::public.team_code),
  ('22222222-2222-4222-8222-222222222222'::uuid, 'B'::public.team_code)
) player(user_id, team);

insert into public.match_games (id, revision_id, game_number, team_a_score, team_b_score, winner_team)
select
  md5('performance-page-game-' || series)::uuid,
  md5('performance-page-revision-' || series)::uuid,
  1,
  21,
  18,
  'A'
from generate_series(1, 22) series;

insert into public.rating_events (
  group_id, match_id, revision_id, game_id, game_number, occurred_at,
  format, team, user_id, sequence, expected_score, actual_score, points_for, points_against,
  before_rating, before_rd, before_volatility, before_games_played,
  after_rating, after_rd, after_volatility, after_games_played
)
select
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  md5('performance-page-match-' || series)::uuid,
  md5('performance-page-revision-' || series)::uuid,
  md5('performance-page-game-' || series)::uuid,
  1,
  '2026-09-01T12:00:00Z'::timestamptz + series * interval '1 minute',
  'singles',
  'A',
  '11111111-1111-4111-8111-111111111111',
  series,
  0.5,
  1,
  21,
  18,
  1500 + series,
  350,
  0.06,
  series - 1,
  1501 + series,
  340,
  0.06,
  series
from generate_series(1, 22) series;

insert into public.matches (id, group_id, created_by_user_id, status, submitted_at)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'confirmed',
  '2026-08-01T12:00:00Z'
);

insert into public.match_revisions (id, match_id, version, submitted_by_user_id, format)
select
  md5('performance-deep-revision-' || series)::uuid,
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  series,
  '11111111-1111-4111-8111-111111111111',
  'singles'
from generate_series(1, 1001) series;

update public.matches
set active_revision_id = md5('performance-deep-revision-1')::uuid
where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

insert into public.match_participants (revision_id, user_id, team, slot)
select
  md5('performance-deep-revision-' || series)::uuid,
  '33333333-3333-4333-8333-333333333333',
  'A',
  1
from generate_series(1, 1001) series;

insert into public.active_match_drafts (
  group_id, created_by_user_id, format, team_a_user_ids, team_b_user_ids, expires_at
)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'singles',
  array['11111111-1111-4111-8111-111111111111']::uuid[],
  array['44444444-4444-4444-8444-444444444444']::uuid[],
  now() + interval '1 day'
);

set local role authenticated;

select throws_ok(
  $$ select * from public.list_current_user_groups_v2() $$,
  'MR401',
  'Authentication required',
  'group list rejects a missing identity'
);

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select results_eq(
  $$ select id, name, description, member_count from public.list_current_user_groups_v2() $$,
  $$ values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'Wednesday Club'::text, 'Active group'::text, 4::bigint) $$,
  'group list returns active metadata with a SQL visible-member count and excludes archived groups'
);

select is(
  public.get_group_member_snapshot_v2('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->'group'->>'name',
  'Wednesday Club',
  'group snapshot includes group metadata'
);

select is(
  jsonb_array_length(public.get_group_member_snapshot_v2('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->'memberships'),
  4,
  'group snapshot includes visible memberships once'
);

select is(
  (
    select member->>'rating'
    from jsonb_array_elements(public.get_group_member_snapshot_v2('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->'memberships') member
    where member->>'user_id' = '33333333-3333-4333-8333-333333333333'
  ),
  '1600.0000',
  'group snapshot joins rating data to visible memberships'
);

select is_empty(
  $$
    select member
    from jsonb_array_elements(public.get_group_member_snapshot_v2('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->'memberships') member
    where member->>'user_id' in (
      '55555555-5555-4555-8555-555555555555',
      '66666666-6666-4666-8666-666666666666'
    )
  $$,
  'snapshot excludes orphan guests and departed memberships'
);

select is(
  public.get_group_member_snapshot_v2('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  null,
  'archived groups retain the null read behavior'
);

select is(
  jsonb_array_length(public.list_match_history_bundle_v2(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, null, null, null, 21, null
  )->'matches'),
  21,
  'history bundle applies the cursor-page limit before enrichment'
);

select is(
  jsonb_array_length(public.list_match_history_bundle_v2(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, null, null, null, 21, null
  )->'revisions'),
  21,
  'history bundle contains only revisions related to the selected page'
);

select is(
  jsonb_array_length(public.list_match_history_bundle_v2(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, null, null, null, 21, null
  )->'ratingEvents'),
  21,
  'history bundle preserves rating-event data for compatibility'
);

select is(
  (public.list_match_history_bundle_v2(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, null, null, null, 21,
    '77777777-7777-4777-8777-777777777777'
  )->'matches'),
  '[]'::jsonb,
  'player-filtered history is scoped to active-revision participation'
);

select is(
  jsonb_array_length(public.list_match_history_bundle_v2(null, null, null, null, null, 21, null)->'matches'),
  21,
  'global history remains scoped to matches played by the actor'
);

select set_config('request.jwt.claims', '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated"}', true);

select throws_ok(
  $$ select public.get_group_member_snapshot_v2('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') $$,
  'MR403',
  'Not an active group member',
  'outsiders cannot read a group snapshot'
);

reset role;
set local role service_role;

select is(
  (
    select count(*)
    from public.list_visible_group_memberships_v2(array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']::uuid[])
  ),
  4::bigint,
  'service visibility projection uses the SQL guest policy'
);

select ok(
  exists (
    select 1
    from public.list_visible_group_memberships_v2(array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']::uuid[]) membership
    where membership.user_id = '33333333-3333-4333-8333-333333333333'
  ),
  'historical guest visibility remains correct beyond one thousand participation records'
);

select * from finish();
rollback;
