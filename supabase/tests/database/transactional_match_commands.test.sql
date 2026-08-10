begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(38);

insert into public.profiles (id, display_name, first_name, last_name)
values
  ('11111111-1111-4111-8111-111111111111', 'Owner', 'Owner', ''),
  ('22222222-2222-4222-8222-222222222222', 'Member', 'Member', ''),
  ('33333333-3333-4333-8333-333333333333', 'Opponent', 'Opponent', ''),
  ('44444444-4444-4444-8444-444444444444', 'Outsider', 'Outsider', '');

insert into public.groups (id, owner_user_id, name)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Test Ladder');

insert into public.group_memberships (group_id, user_id, role, status)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'owner', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'member', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'member', 'active');

create temporary table match_command_test_state (
  name text primary key,
  value jsonb not null
) on commit drop;
grant select, insert on match_command_test_state to authenticated;

select ok(
  not has_table_privilege('authenticated', 'public.matches', 'INSERT'),
  'authenticated clients cannot bypass match command RPCs with direct writes'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.command_submit_match(uuid,uuid,uuid,public.match_format,uuid[],uuid[],jsonb)',
    'EXECUTE'
  )
    and has_function_privilege(
      'authenticated',
      'public.command_revise_match(uuid,uuid,uuid,public.match_format,uuid[],uuid[],jsonb)',
      'EXECUTE'
    )
    and has_function_privilege(
      'authenticated',
      'public.command_review_match(uuid,uuid,public.confirmation_action)',
      'EXECUTE'
    )
    and has_function_privilege(
      'authenticated',
      'public.command_dispute_and_revise_match(uuid,uuid,uuid,public.match_format,uuid[],uuid[],jsonb)',
      'EXECUTE'
    ),
  'authenticated callers can execute match command RPCs'
);
select ok(
  not has_function_privilege('authenticated', 'public.apply_rating_rebuild(uuid,bigint,jsonb,jsonb)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.apply_rating_rebuild(uuid,bigint,jsonb,jsonb)', 'EXECUTE'),
  'rating worker RPCs are restricted to the service role'
);
select ok(
  has_function_privilege('authenticated', 'public.command_create_group(uuid,text,text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.command_create_group(uuid,text,text)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.command_create_guest_players(uuid,uuid,jsonb)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.command_create_guest_players(uuid,uuid,jsonb)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.command_join_group_by_invite(uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.command_join_group_by_invite(uuid,uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.command_claim_guest_profiles(uuid,uuid,uuid[])', 'EXECUTE')
    and not has_function_privilege('anon', 'public.command_claim_guest_profiles(uuid,uuid,uuid[])', 'EXECUTE'),
  'all command RPCs have an explicit authenticated-only privilege boundary'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);

insert into match_command_test_state (name, value)
select 'first-submit', public.command_submit_match(
  '01010101-0101-4101-8101-010101010101',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  null,
  'singles',
  array['22222222-2222-4222-8222-222222222222']::uuid[],
  array['33333333-3333-4333-8333-333333333333']::uuid[],
  '[{"teamAScore":21,"teamBScore":18}]'::jsonb
);

select ok(
  (select value->>'matchId' is not null from match_command_test_state where name = 'first-submit'),
  'an ordinary member can submit a complete match'
);
select is((select count(*) from public.matches), 1::bigint, 'submission creates one match');
select is((select count(*) from public.match_revisions), 1::bigint, 'submission creates one revision');
select is((select count(*) from public.match_participants), 2::bigint, 'submission creates both participants');
select is((select count(*) from public.match_games), 1::bigint, 'submission creates every game');

select is(
  public.command_submit_match(
    '01010101-0101-4101-8101-010101010101',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    null,
    'singles',
    array['22222222-2222-4222-8222-222222222222']::uuid[],
    array['33333333-3333-4333-8333-333333333333']::uuid[],
    '[{"teamAScore":21,"teamBScore":18}]'::jsonb
  ),
  (select value from match_command_test_state where name = 'first-submit'),
  'an identical retry replays the original result'
);
select is((select count(*) from public.matches), 1::bigint, 'an identical retry does not duplicate the match');

select throws_ok(
  $$
    select public.command_submit_match(
      '01010101-0101-4101-8101-010101010101',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      null,
      'singles',
      array['22222222-2222-4222-8222-222222222222']::uuid[],
      array['33333333-3333-4333-8333-333333333333']::uuid[],
      '[{"teamAScore":21,"teamBScore":17}]'::jsonb
    )
  $$,
  'MRCMD',
  'Command ID was reused with different input',
  'a command ID cannot be reused with changed input'
);

select throws_ok(
  $$
    select public.command_submit_match(
      '02020202-0202-4202-8202-020202020202',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      null,
      'singles',
      array['22222222-2222-4222-8222-222222222222']::uuid[],
      array['33333333-3333-4333-8333-333333333333']::uuid[],
      '[{"teamAScore":100,"teamBScore":18}]'::jsonb
    )
  $$,
  'MRVAL',
  'Scores must be integers between 0 and 99',
  'database validation rejects out-of-range scores'
);
select is((select count(*) from public.matches), 1::bigint, 'invalid input rolls back the match and outbox transaction');

select set_config(
  'request.jwt.claims',
  '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}',
  true
);
select throws_ok(
  $$
    select public.command_submit_match(
      '03030303-0303-4303-8303-030303030303',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      null,
      'singles',
      array['22222222-2222-4222-8222-222222222222']::uuid[],
      array['33333333-3333-4333-8333-333333333333']::uuid[],
      '[{"teamAScore":21,"teamBScore":18}]'::jsonb
    )
  $$,
  'MR403',
  'Not an active group member',
  'an outsider cannot submit a match'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select throws_ok(
  $$
    select public.command_submit_match(
      '12121212-1212-4212-8212-121212121212',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      null,
      'singles',
      array['22222222-2222-4222-8222-222222222222']::uuid[],
      array['33333333-3333-4333-8333-333333333333']::uuid[],
      '[{"teamAScore":21,"teamBScore":18}]'::jsonb
    )
  $$,
  'MRVAL',
  'Submitter must play in the match',
  'a neutral scorer cannot create an unreviewable match'
);
select is((select count(*) from public.matches), 1::bigint, 'neutral submission rejection makes no aggregate writes');

select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    'select public.command_revise_match(%L, %L, %L, %L, %L::uuid[], %L::uuid[], %L::jsonb)',
    '14141414-1414-4414-8414-141414141414',
    (select value->>'matchId' from match_command_test_state where name = 'first-submit'),
    (select value->>'revisionId' from match_command_test_state where name = 'first-submit'),
    'singles',
    '{22222222-2222-4222-8222-222222222222}',
    '{33333333-3333-4333-8333-333333333333}',
    '[{"teamAScore":21,"teamBScore":19}]'
  ),
  'MR409',
  'Match is not disputed',
  'a pending match cannot be revised without a dispute'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    'select public.command_review_match(%L, %L, %L)',
    '15151515-1515-4515-8515-151515151515',
    (select value->>'revisionId' from match_command_test_state where name = 'first-submit'),
    'disputed'
  ),
  'an opposing participant can dispute a pending revision'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    'select public.command_revise_match(%L, %L, %L, %L, %L::uuid[], %L::uuid[], %L::jsonb)',
    '13131313-1313-4313-8313-131313131313',
    (select value->>'matchId' from match_command_test_state where name = 'first-submit'),
    (select value->>'revisionId' from match_command_test_state where name = 'first-submit'),
    'singles',
    '{11111111-1111-4111-8111-111111111111}',
    '{33333333-3333-4333-8333-333333333333}',
    '[{"teamAScore":21,"teamBScore":17}]'
  ),
  'MR403',
  'Only current match participants can revise',
  'a non-participant cannot add themselves to a disputed revision'
);
select is((select count(*) from public.match_revisions), 1::bigint, 'unauthorized revision rejection leaves history unchanged');

select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
insert into match_command_test_state (name, value)
select 'revision', public.command_revise_match(
  '04040404-0404-4404-8404-040404040404',
  (select (value->>'matchId')::uuid from match_command_test_state where name = 'first-submit'),
  (select (value->>'revisionId')::uuid from match_command_test_state where name = 'first-submit'),
  'singles',
  array['22222222-2222-4222-8222-222222222222']::uuid[],
  array['33333333-3333-4333-8333-333333333333']::uuid[],
  '[{"teamAScore":21,"teamBScore":19}]'::jsonb
);
select is((select count(*) from public.match_revisions), 2::bigint, 'a current participant can revise a disputed match');

select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    'select public.command_revise_match(%L, %L, %L, %L, %L::uuid[], %L::uuid[], %L::jsonb)',
    '05050505-0505-4505-8505-050505050505',
    (select value->>'matchId' from match_command_test_state where name = 'first-submit'),
    (select value->>'revisionId' from match_command_test_state where name = 'first-submit'),
    'singles',
    '{22222222-2222-4222-8222-222222222222}',
    '{33333333-3333-4333-8333-333333333333}',
    '[{"teamAScore":21,"teamBScore":17}]'
  ),
  'MR409',
  'Stale match revision',
  'a stale revision is rejected without another write'
);
select is((select count(*) from public.match_revisions), 2::bigint, 'stale revision rejection leaves revision history unchanged');

select set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    'select public.command_review_match(%L, %L, %L)',
    '06060606-0606-4606-8606-060606060606',
    (select value->>'revisionId' from match_command_test_state where name = 'first-submit'),
    'confirmed'
  ),
  'MR409',
  'Match revision is no longer pending',
  'an obsolete revision cannot be confirmed'
);

insert into match_command_test_state (name, value)
select 'atomic-revision', public.command_dispute_and_revise_match(
  '11111111-1111-4111-8111-111111111112',
  (select (value->>'matchId')::uuid from match_command_test_state where name = 'first-submit'),
  (select (value->>'revisionId')::uuid from match_command_test_state where name = 'revision'),
  'singles',
  array['22222222-2222-4222-8222-222222222222']::uuid[],
  array['33333333-3333-4333-8333-333333333333']::uuid[],
  '[{"teamAScore":21,"teamBScore":16}]'::jsonb
);
select is(
  (select status::text from public.matches where id = (select (value->>'matchId')::uuid from match_command_test_state where name = 'first-submit')),
  'pending_confirmation',
  'atomic correction leaves the replacement revision pending confirmation'
);
select is(
  (select action::text from public.match_confirmations where revision_id = (select (value->>'revisionId')::uuid from match_command_test_state where name = 'revision')),
  'disputed',
  'atomic correction records the review decision on the replaced revision'
);
select is(
  (select active_revision_id from public.matches where id = (select (value->>'matchId')::uuid from match_command_test_state where name = 'first-submit')),
  (select (value->>'revisionId')::uuid from match_command_test_state where name = 'atomic-revision'),
  'atomic correction installs the returned revision as active'
);
select is(
  public.command_dispute_and_revise_match(
    '11111111-1111-4111-8111-111111111112',
    (select (value->>'matchId')::uuid from match_command_test_state where name = 'first-submit'),
    (select (value->>'revisionId')::uuid from match_command_test_state where name = 'revision'),
    'singles',
    array['22222222-2222-4222-8222-222222222222']::uuid[],
    array['33333333-3333-4333-8333-333333333333']::uuid[],
    '[{"teamAScore":21,"teamBScore":16}]'::jsonb
  ),
  (select value from match_command_test_state where name = 'atomic-revision'),
  'an identical atomic correction retry replays the original result'
);
select is(
  (select count(*) from public.match_revisions),
  3::bigint,
  'an identical atomic correction retry does not duplicate the revision'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    'select public.command_review_match(%L, %L, %L)',
    '07070707-0707-4707-8707-070707070707',
    (select value->>'revisionId' from match_command_test_state where name = 'atomic-revision'),
    'confirmed'
  ),
  'an opposing participant can confirm the corrected pending revision'
);
select is(
  (select status::text from public.matches where id = (select (value->>'matchId')::uuid from match_command_test_state where name = 'first-submit')),
  'confirmed',
  'confirmation and match status update commit together'
);
select throws_ok(
  format(
    'select public.command_revise_match(%L, %L, %L, %L, %L::uuid[], %L::uuid[], %L::jsonb)',
    '16161616-1616-4616-8616-161616161616',
    (select value->>'matchId' from match_command_test_state where name = 'first-submit'),
    (select value->>'revisionId' from match_command_test_state where name = 'atomic-revision'),
    'singles',
    '{22222222-2222-4222-8222-222222222222}',
    '{33333333-3333-4333-8333-333333333333}',
    '[{"teamAScore":21,"teamBScore":15}]'
  ),
  'MR409',
  'Match is not disputed',
  'a confirmed match cannot be revised'
);

update public.groups
set rating_input_version = rating_input_version + 1
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is(
  (
    public.apply_rating_rebuild(
      (select (value->>'ratingJobId')::uuid from match_command_test_state where name = 'atomic-revision'),
      (select target_version from public.rating_rebuild_jobs where id = (select (value->>'ratingJobId')::uuid from match_command_test_state where name = 'atomic-revision')),
      '[]'::jsonb,
      '[]'::jsonb
    )->>'status'
  ),
  'stale',
  'a projection for an obsolete input version is rejected'
);
select is(
  (select rating_applied_version from public.groups where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  0::bigint,
  'stale projection rejection leaves the applied version unchanged'
);

update public.rating_rebuild_jobs
set status = 'failed', error = 'forced test failure'
where id = (select (value->>'ratingJobId')::uuid from match_command_test_state where name = 'atomic-revision');
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    'select public.retry_rating_rebuild(%L, %L)',
    '08080808-0808-4808-8808-080808080808',
    (select value->>'ratingJobId' from match_command_test_state where name = 'atomic-revision')
  ),
  'MRADM',
  'Admin role required',
  'an ordinary member cannot retry failed ratings'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    'select public.retry_rating_rebuild(%L, %L)',
    '09090909-0909-4909-8909-090909090909',
    (select value->>'ratingJobId' from match_command_test_state where name = 'atomic-revision')
  ),
  'a group owner can retry failed ratings'
);
select is(
  (select count(*) from public.rating_rebuild_jobs where group_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and status in ('queued', 'running')),
  1::bigint,
  'rating rebuild requests coalesce to one active job per group'
);

select * from finish();
rollback;
