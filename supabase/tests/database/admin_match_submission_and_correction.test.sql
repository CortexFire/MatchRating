begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(15);

insert into public.profiles (id, display_name, first_name, last_name)
values
  ('91111111-1111-4111-8111-111111111111', 'Owner', 'Owner', ''),
  ('92222222-2222-4222-8222-222222222222', 'Admin', 'Admin', ''),
  ('93333333-3333-4333-8333-333333333333', 'Player One', 'Player', 'One'),
  ('94444444-4444-4444-8444-444444444444', 'Player Two', 'Player', 'Two'),
  ('95555555-5555-4555-8555-555555555555', 'Neutral Member', 'Neutral', 'Member'),
  ('96666666-6666-4666-8666-666666666666', 'Outsider', 'Outsider', '');

insert into public.groups (id, owner_user_id, name)
values ('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '91111111-1111-4111-8111-111111111111', 'Admin Scoring Group');

insert into public.group_memberships (group_id, user_id, role, status)
values
  ('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '91111111-1111-4111-8111-111111111111', 'owner', 'active'),
  ('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '92222222-2222-4222-8222-222222222222', 'admin', 'active'),
  ('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '93333333-3333-4333-8333-333333333333', 'member', 'active'),
  ('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '94444444-4444-4444-8444-444444444444', 'member', 'active'),
  ('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '95555555-5555-4555-8555-555555555555', 'member', 'active');

insert into public.matches (id, group_id, created_by_user_id, status)
values (
  '90000000-0000-4000-8000-000000000001',
  '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '91111111-1111-4111-8111-111111111111',
  'pending_confirmation'
);
select is(
  (select status::text from public.matches where id = '90000000-0000-4000-8000-000000000001'),
  'confirmed',
  'legacy pending writes are normalized during rolling deployment'
);

create temporary table admin_match_state (
  name text primary key,
  value jsonb not null
) on commit drop;
grant select, insert on admin_match_state to authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"91111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

insert into admin_match_state (name, value)
select 'owner-submit', public.command_submit_match(
  '91010101-0101-4101-8101-010101010101',
  '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  null,
  'singles',
  array['93333333-3333-4333-8333-333333333333']::uuid[],
  array['94444444-4444-4444-8444-444444444444']::uuid[],
  '[{"teamAScore":21,"teamBScore":18,"winnerTeam":"A"}]'::jsonb
);

select is(
  (select status::text from public.matches where id = (select (value->>'matchId')::uuid from admin_match_state where name = 'owner-submit')),
  'confirmed',
  'a nonparticipant owner submits an immediately accepted match'
);
select ok(
  (select submitted_by_user_id not in ('93333333-3333-4333-8333-333333333333', '94444444-4444-4444-8444-444444444444') from public.match_revisions where id = (select (value->>'revisionId')::uuid from admin_match_state where name = 'owner-submit')),
  'the owner submitter does not need to be stored as a participant'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"92222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
insert into admin_match_state (name, value)
select 'admin-submit', public.command_submit_match(
  '91020202-0202-4202-8202-020202020202',
  '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  null,
  'singles',
  array['93333333-3333-4333-8333-333333333333']::uuid[],
  array['94444444-4444-4444-8444-444444444444']::uuid[],
  '[{"teamAScore":18,"teamBScore":21,"winnerTeam":"B"}]'::jsonb
);
select is(
  (select status::text from public.matches where id = (select (value->>'matchId')::uuid from admin_match_state where name = 'admin-submit')),
  'confirmed',
  'a nonparticipant admin submits an immediately accepted match'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"95555555-5555-4555-8555-555555555555","role":"authenticated"}',
  true
);
select throws_ok(
  $$
    select public.command_submit_match(
      '91030303-0303-4303-8303-030303030303',
      '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      null,
      'singles',
      array['93333333-3333-4333-8333-333333333333']::uuid[],
      array['94444444-4444-4444-8444-444444444444']::uuid[],
      '[{"teamAScore":21,"teamBScore":18,"winnerTeam":"A"}]'::jsonb
    )
  $$,
  'MRMAT',
  'Only match participants or group admins can do that',
  'an ordinary off-team member cannot submit'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"93333333-3333-4333-8333-333333333333","role":"authenticated"}',
  true
);
insert into admin_match_state (name, value)
select 'participant-submit', public.command_submit_match(
  '91040404-0404-4404-8404-040404040404',
  '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  null,
  'singles',
  array['93333333-3333-4333-8333-333333333333']::uuid[],
  array['94444444-4444-4444-8444-444444444444']::uuid[],
  '[{"teamAScore":21,"teamBScore":19,"winnerTeam":"A"}]'::jsonb
);
select is(
  (select status::text from public.matches where id = (select (value->>'matchId')::uuid from admin_match_state where name = 'participant-submit')),
  'confirmed',
  'a participant retains submission access'
);

update public.matches
set review_started_at = now() - interval '1 day'
where id = (select (value->>'matchId')::uuid from admin_match_state where name = 'owner-submit');

select set_config(
  'request.jwt.claims',
  '{"sub":"92222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
insert into admin_match_state (name, value)
select 'admin-correction', public.command_dispute_and_revise_match(
  '91050505-0505-4505-8505-050505050505',
  (select (value->>'matchId')::uuid from admin_match_state where name = 'owner-submit'),
  (select (value->>'revisionId')::uuid from admin_match_state where name = 'owner-submit'),
  'singles',
  array['93333333-3333-4333-8333-333333333333']::uuid[],
  array['94444444-4444-4444-8444-444444444444']::uuid[],
  '[{"teamAScore":17,"teamBScore":21,"winnerTeam":"B"}]'::jsonb
);
select is(
  (select status::text from public.matches where id = (select (value->>'matchId')::uuid from admin_match_state where name = 'owner-submit')),
  'confirmed',
  'an admin correction is accepted immediately'
);
select ok(
  (select review_started_at > now() - interval '1 minute' from public.matches where id = (select (value->>'matchId')::uuid from admin_match_state where name = 'owner-submit')),
  'an admin correction restarts the correction window'
);
select ok(
  (select submitted_by_user_id not in ('93333333-3333-4333-8333-333333333333', '94444444-4444-4444-8444-444444444444') from public.match_revisions where id = (select (value->>'revisionId')::uuid from admin_match_state where name = 'admin-correction')),
  'an admin correction can keep the admin off both teams'
);
select is(
  (
    select count(*)
    from public.match_confirmations
    where revision_id = (select (value->>'revisionId')::uuid from admin_match_state where name = 'owner-submit')
  ),
  0::bigint,
  'a correction does not create a manual confirmation record'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"95555555-5555-4555-8555-555555555555","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    'select public.command_dispute_and_revise_match(%L, %L, %L, %L, %L::uuid[], %L::uuid[], %L::jsonb)',
    '91060606-0606-4606-8606-060606060606',
    (select value->>'matchId' from admin_match_state where name = 'owner-submit'),
    (select value->>'revisionId' from admin_match_state where name = 'admin-correction'),
    'singles',
    '{93333333-3333-4333-8333-333333333333}',
    '{94444444-4444-4444-8444-444444444444}',
    '[{"teamAScore":21,"teamBScore":17,"winnerTeam":"A"}]'
  ),
  'MRMAT',
  'Only match participants or group admins can do that',
  'an ordinary off-team member cannot correct'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"93333333-3333-4333-8333-333333333333","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    'select public.command_dispute_and_revise_match(%L, %L, %L, %L, %L::uuid[], %L::uuid[], %L::jsonb)',
    '91070707-0707-4707-8707-070707070707',
    (select value->>'matchId' from admin_match_state where name = 'owner-submit'),
    (select value->>'revisionId' from admin_match_state where name = 'admin-correction'),
    'singles',
    '{93333333-3333-4333-8333-333333333333}',
    '{94444444-4444-4444-8444-444444444444}',
    '[{"teamAScore":21,"teamBScore":16,"winnerTeam":"A"}]'
  ),
  'a participant retains correction access'
);

update public.matches
set review_started_at = now() - interval '30 days'
where id = (select (value->>'matchId')::uuid from admin_match_state where name = 'admin-submit');

select set_config(
  'request.jwt.claims',
  '{"sub":"91111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    'select public.command_dispute_and_revise_match(%L, %L, %L, %L, %L::uuid[], %L::uuid[], %L::jsonb)',
    '91080808-0808-4808-8808-080808080808',
    (select value->>'matchId' from admin_match_state where name = 'admin-submit'),
    (select value->>'revisionId' from admin_match_state where name = 'admin-submit'),
    'singles',
    '{93333333-3333-4333-8333-333333333333}',
    '{94444444-4444-4444-8444-444444444444}',
    '[{"teamAScore":21,"teamBScore":18,"winnerTeam":"A"}]'
  ),
  'MREXP',
  'Match correction window has expired',
  'the correction window applies to group owners and admins'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.command_review_match(uuid,uuid,public.confirmation_action)',
    'EXECUTE'
  ),
  'authenticated users cannot execute manual confirmation'
);

select is(
  (
    select column_default
    from information_schema.columns
    where table_schema = 'public' and table_name = 'matches' and column_name = 'status'
  ),
  '''confirmed''::match_status',
  'new match rows default to accepted status'
);

select * from finish();
rollback;
