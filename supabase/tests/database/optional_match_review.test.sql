begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(13);

insert into public.profiles (id, display_name, first_name, last_name)
values
  ('81111111-1111-4111-8111-111111111111', 'Submitter', 'Submitter', ''),
  ('82222222-2222-4222-8222-222222222222', 'Partner', 'Partner', ''),
  ('83333333-3333-4333-8333-333333333333', 'Opponent', 'Opponent', ''),
  ('84444444-4444-4444-8444-444444444444', 'Opponent Partner', 'Opponent', 'Partner'),
  ('85555555-5555-4555-8555-555555555555', 'Outsider', 'Outsider', '');

insert into public.groups (id, owner_user_id, name)
values ('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '81111111-1111-4111-8111-111111111111', 'Optional Review Group');

insert into public.group_memberships (group_id, user_id, role, status)
values
  ('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '81111111-1111-4111-8111-111111111111', 'owner', 'active'),
  ('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '82222222-2222-4222-8222-222222222222', 'member', 'active'),
  ('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '83333333-3333-4333-8333-333333333333', 'member', 'active'),
  ('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '84444444-4444-4444-8444-444444444444', 'member', 'active');

create temporary table optional_review_state (
  name text primary key,
  value jsonb not null
) on commit drop;
grant select, insert on optional_review_state to authenticated;

select ok(
  has_function_privilege('service_role', 'public.auto_accept_expired_match_reviews()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.auto_accept_expired_match_reviews()', 'EXECUTE'),
  'automatic acceptance is service-role only'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"81111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

insert into optional_review_state (name, value)
select 'match', public.command_submit_match(
  '81010101-0101-4101-8101-010101010101',
  '8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  null,
  'doubles',
  array['81111111-1111-4111-8111-111111111111', '82222222-2222-4222-8222-222222222222']::uuid[],
  array['83333333-3333-4333-8333-333333333333', '84444444-4444-4444-8444-444444444444']::uuid[],
  '[{"teamAScore":21,"teamBScore":18,"winnerTeam":"A"}]'::jsonb
);

select ok(
  (select review_started_at is not null from public.matches where id = (select (value->>'matchId')::uuid from optional_review_state where name = 'match')),
  'submission initializes the review clock'
);

update public.matches
set review_started_at = now() - interval '23 hours'
where id = (select (value->>'matchId')::uuid from optional_review_state where name = 'match');

select is(public.auto_accept_expired_match_reviews(), 0::bigint, 'fresh pending matches remain pending');

update public.matches
set review_started_at = now() - interval '24 hours'
where id = (select (value->>'matchId')::uuid from optional_review_state where name = 'match');

select is(public.auto_accept_expired_match_reviews(), 1::bigint, 'pending matches auto-accept at 24 hours');
select is(
  (select status::text from public.matches where id = (select (value->>'matchId')::uuid from optional_review_state where name = 'match')),
  'confirmed',
  'automatic acceptance uses the existing confirmed status'
);
select is(
  (select count(*) from public.match_confirmations where revision_id = (select (value->>'revisionId')::uuid from optional_review_state where name = 'match')),
  0::bigint,
  'automatic acceptance does not manufacture a confirmation'
);

insert into optional_review_state (name, value)
select 'submitter-correction', public.command_dispute_and_revise_match(
  '81020202-0202-4202-8202-020202020202',
  (select (value->>'matchId')::uuid from optional_review_state where name = 'match'),
  (select (value->>'revisionId')::uuid from optional_review_state where name = 'match'),
  'singles',
  array['81111111-1111-4111-8111-111111111111']::uuid[],
  array['83333333-3333-4333-8333-333333333333']::uuid[],
  '[{"teamAScore":18,"teamBScore":21,"winnerTeam":"B"}]'::jsonb
);

select is(
  (select status::text from public.matches where id = (select (value->>'matchId')::uuid from optional_review_state where name = 'match')),
  'pending_confirmation',
  'a current participant can correct an accepted match'
);
select ok(
  (select review_started_at > now() - interval '1 minute' from public.matches where id = (select (value->>'matchId')::uuid from optional_review_state where name = 'match')),
  'a correction restarts the review clock'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"83333333-3333-4333-8333-333333333333","role":"authenticated"}',
  true
);
select public.command_review_match(
  '81030303-0303-4303-8303-030303030303',
  (select (value->>'revisionId')::uuid from optional_review_state where name = 'submitter-correction'),
  'confirmed'
);

select lives_ok(
  format(
    'select public.command_dispute_and_revise_match(%L, %L, %L, %L, %L, %L, %L)',
    '81040404-0404-4404-8404-040404040404',
    (select value->>'matchId' from optional_review_state where name = 'match'),
    (select value->>'revisionId' from optional_review_state where name = 'submitter-correction'),
    'singles',
    array['81111111-1111-4111-8111-111111111111']::uuid[],
    array['83333333-3333-4333-8333-333333333333']::uuid[],
    '[{"teamAScore":21,"teamBScore":19,"winnerTeam":"A"}]'::jsonb
  ),
  'a participant may correct after previously confirming'
);

update public.matches
set review_started_at = now() - interval '30 days'
where id = (select (value->>'matchId')::uuid from optional_review_state where name = 'match');

select throws_ok(
  format(
    'select public.command_dispute_and_revise_match(%L, %L, %L, %L, %L, %L, %L)',
    '81050505-0505-4505-8505-050505050505',
    (select value->>'matchId' from optional_review_state where name = 'match'),
    (select active_revision_id::text from public.matches where id = (select (value->>'matchId')::uuid from optional_review_state where name = 'match')),
    'singles',
    array['81111111-1111-4111-8111-111111111111']::uuid[],
    array['83333333-3333-4333-8333-333333333333']::uuid[],
    '[{"teamAScore":21,"teamBScore":17,"winnerTeam":"A"}]'::jsonb
  ),
  'MR409',
  'Match dispute window has expired',
  'correction is rejected at the exact 30-day boundary'
);

select throws_ok(
  format(
    'select public.command_review_match(%L, %L, %L)',
    '81060606-0606-4606-8606-060606060606',
    (select active_revision_id::text from public.matches where id = (select (value->>'matchId')::uuid from optional_review_state where name = 'match')),
    'disputed'
  ),
  'MRVAL',
  'Disputes must include a corrected result',
  'the generic review command cannot create unresolved disputes'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"85555555-5555-4555-8555-555555555555","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    'select public.command_dispute_and_revise_match(%L, %L, %L, %L, %L, %L, %L)',
    '81070707-0707-4707-8707-070707070707',
    (select value->>'matchId' from optional_review_state where name = 'match'),
    (select active_revision_id::text from public.matches where id = (select (value->>'matchId')::uuid from optional_review_state where name = 'match')),
    'singles',
    array['81111111-1111-4111-8111-111111111111']::uuid[],
    array['85555555-5555-4555-8555-555555555555']::uuid[],
    '[{"teamAScore":21,"teamBScore":17,"winnerTeam":"A"}]'::jsonb
  ),
  'MR403',
  'Not an active group member',
  'former and non-members cannot correct a match'
);

update public.matches
set status = 'confirmed'
where id = (select (value->>'matchId')::uuid from optional_review_state where name = 'match');

select is(public.auto_accept_expired_match_reviews(), 0::bigint, 'resolved matches are not auto-accepted again');

select * from finish();
rollback;
