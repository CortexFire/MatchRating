begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(17);

select has_index(
  'public',
  'rating_events',
  'rating_events_revision_user_sequence_idx',
  'navigation hydration has a revision-leading rating-events index'
);

select ok(
  has_function_privilege('authenticated', 'public.get_home_page_data(integer)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.get_group_page_data(uuid,integer)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.get_match_recorder_page_data(uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.get_home_page_data(integer)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.get_group_page_data(uuid,integer)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.get_match_recorder_page_data(uuid,uuid)', 'EXECUTE'),
  'navigation RPCs are authenticated-only'
);

insert into public.profiles (id, display_name, first_name, last_name, is_guest, active_until)
values
  ('11111111-1111-4111-8111-111111111111', 'Alice Tan', 'Alice', 'Tan', false, now() + interval '1 day'),
  ('22222222-2222-4222-8222-222222222222', 'Bea Rivera', 'Bea', 'Rivera', false, null),
  ('33333333-3333-4333-8333-333333333333', 'Used Guest', 'Used', 'Guest', true, null),
  ('44444444-4444-4444-8444-444444444444', 'Orphan Guest', 'Orphan', 'Guest', true, null),
  ('55555555-5555-4555-8555-555555555555', 'Outside User', 'Outside', 'User', false, null);

insert into public.groups (id, owner_user_id, name, description)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Wednesday Club', 'Weekly ladder'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '55555555-5555-4555-8555-555555555555', 'Outside Club', 'Private');

insert into public.group_memberships (group_id, user_id, role, status)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'owner', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'member', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'member', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', 'member', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '55555555-5555-4555-8555-555555555555', 'owner', 'active');

insert into public.group_rating_states (group_id, user_id, rating, rd, games_played)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 1642, 72, 18),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 1510, 88, 9),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 1490, 350, 0),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', 1480, 350, 0);

insert into public.matches (id, group_id, created_by_user_id, status, submitted_at, review_started_at)
values
  ('c1000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'confirmed', now() - interval '1 hour', now() - interval '1 hour'),
  ('c1000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'confirmed', now(), now()),
  ('c1000000-0000-4000-8000-000000000003', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '55555555-5555-4555-8555-555555555555', 'confirmed', now() + interval '1 hour', now() + interval '1 hour');

insert into public.match_revisions (id, match_id, version, submitted_by_user_id, format)
values
  ('d1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 1, '11111111-1111-4111-8111-111111111111', 'singles'),
  ('d1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000002', 1, '22222222-2222-4222-8222-222222222222', 'singles'),
  ('d1000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000003', 1, '55555555-5555-4555-8555-555555555555', 'singles');

update public.matches set active_revision_id = case id
  when 'c1000000-0000-4000-8000-000000000001'::uuid then 'd1000000-0000-4000-8000-000000000001'::uuid
  when 'c1000000-0000-4000-8000-000000000002'::uuid then 'd1000000-0000-4000-8000-000000000002'::uuid
  else 'd1000000-0000-4000-8000-000000000003'::uuid
end;

insert into public.match_participants (revision_id, user_id, team, slot)
values
  ('d1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'A', 1),
  ('d1000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'B', 1),
  ('d1000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'A', 1),
  ('d1000000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', 'B', 1),
  ('d1000000-0000-4000-8000-000000000003', '55555555-5555-4555-8555-555555555555', 'A', 1),
  ('d1000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'B', 1);

insert into public.match_games (revision_id, game_number, team_a_score, team_b_score, winner_team)
values
  ('d1000000-0000-4000-8000-000000000001', 1, 21, 18, 'A'),
  ('d1000000-0000-4000-8000-000000000002', 1, 21, 16, 'A'),
  ('d1000000-0000-4000-8000-000000000003', 1, 21, 19, 'A');

insert into public.active_match_drafts (
  id, group_id, created_by_user_id, format, team_a_user_ids, team_b_user_ids, games, expires_at, submitted_match_id, updated_at
)
values
  ('e1000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'singles', array['11111111-1111-4111-8111-111111111111']::uuid[], array['33333333-3333-4333-8333-333333333333']::uuid[], '[{"teamAScore":12,"teamBScore":12,"winnerTeam":"A"}]', now() + interval '1 hour', null, now()),
  ('e1000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'singles', array['11111111-1111-4111-8111-111111111111']::uuid[], array['44444444-4444-4444-8444-444444444444']::uuid[], '[]', now() - interval '1 second', null, now() - interval '1 day'),
  ('e1000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'singles', array['11111111-1111-4111-8111-111111111111']::uuid[], array['22222222-2222-4222-8222-222222222222']::uuid[], '[]', now() + interval '1 hour', 'c1000000-0000-4000-8000-000000000001', now() - interval '2 days');

insert into public.rating_rebuild_jobs (id, group_id, status, created_by_user_id, created_at)
values ('f1000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'failed', '11111111-1111-4111-8111-111111111111', now());

set local role authenticated;

select throws_ok(
  $$ select public.get_home_page_data(3) $$,
  'MR401',
  'Authentication required',
  'missing authenticated subject is rejected'
);

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select throws_ok(
  $$ select public.get_home_page_data(21) $$,
  'MRVAL',
  'Navigation match limit must be between 1 and 20',
  'oversized navigation limits are rejected'
);

select is(
  jsonb_array_length(public.get_home_page_data(3)->'groups'),
  1,
  'home returns only the actor active groups'
);

select is(
  jsonb_array_length(public.get_home_page_data(3)->'memberships'),
  3,
  'home includes associated guests but excludes orphan guests'
);

select is(
  jsonb_array_length(public.get_home_page_data(3)->'drafts'),
  1,
  'home excludes expired and submitted drafts'
);

select is(
  jsonb_array_length(public.get_home_page_data(3)->'matchBundle'->'matches'),
  1,
  'home returns only matches played by the actor'
);

select is(
  jsonb_array_length(public.get_home_page_data(3)->'matchBundle'->'games'),
  1,
  'home match bundle excludes unrelated child rows'
);

select is(
  jsonb_array_length(public.get_group_page_data('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1)->'matchBundle'->'matches'),
  1,
  'group match limiting happens before hydration'
);

select is(
  public.get_group_page_data('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 5)->'ratingStatus'->>'canRetry',
  'true',
  'group rating status allows an owner to retry a failed rebuild'
);

select is(
  public.get_match_recorder_page_data('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'e1000000-0000-4000-8000-000000000001')->'draft'->>'id',
  'e1000000-0000-4000-8000-000000000001',
  'recorder returns a visible active draft in the selected group'
);

select is(
  (public.get_match_recorder_page_data('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'e1000000-0000-4000-8000-000000000002')->'draft')::text,
  'null',
  'recorder treats an expired draft as missing'
);

select is(
  jsonb_array_length(public.get_match_recorder_page_data('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null)->'groups'),
  1,
  'recorder group switcher excludes inaccessible groups'
);

select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);

select is(
  (public.get_group_page_data('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 5))::text,
  null,
  'nonmembers receive null without learning private group data'
);

select is(
  (public.get_match_recorder_page_data('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null))::text,
  null,
  'nonmembers cannot load the private recorder model'
);

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

select is(
  public.get_group_page_data('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 5)->'ratingStatus'->>'canRetry',
  'false',
  'ordinary members cannot retry failed rating rebuilds'
);

select * from finish();
rollback;
