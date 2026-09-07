begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(23);

insert into public.profiles (id, display_name, first_name, last_name)
values
  ('11111111-1111-4111-8111-111111111111', 'Owner', 'Owner', ''),
  ('22222222-2222-4222-8222-222222222222', 'Creator', 'Creator', ''),
  ('33333333-3333-4333-8333-333333333333', 'Participant', 'Participant', ''),
  ('44444444-4444-4444-8444-444444444444', 'Neutral', 'Neutral', ''),
  ('55555555-5555-4555-8555-555555555555', 'Outsider', 'Outsider', '');

insert into public.groups (id, owner_user_id, name)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Test Ladder'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'Other Ladder');

insert into public.group_memberships (group_id, user_id, role, status, left_at)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'owner', 'active', null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'member', 'active', null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'member', 'active', null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', 'member', 'active', null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'owner', 'active', null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'member', 'active', null);

select ok(
  has_function_privilege(
    'authenticated',
    'public.sync_active_match_draft_v2(uuid,uuid,public.match_format,uuid[],uuid[],jsonb)',
    'EXECUTE'
  ) and not has_function_privilege(
    'anon',
    'public.sync_active_match_draft_v2(uuid,uuid,public.match_format,uuid[],uuid[],jsonb)',
    'EXECUTE'
  ),
  'draft sync has an authenticated-only execution boundary'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);

select is(
  public.sync_active_match_draft_v2(
    null,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'singles',
    '{}'::uuid[],
    '{}'::uuid[],
    '[{"teamAScore":null,"teamBScore":null,"winnerTeam":"B"}]'
  ),
  '{"draftId": null, "outcome": "unchanged"}'::jsonb,
  'a fresh blank draft is a no-op'
);
select is((select count(*) from public.active_match_drafts), 0::bigint, 'blank no-op creates no row');

create temporary table draft_sync_state (value jsonb not null) on commit drop;
grant select, insert on draft_sync_state to authenticated;
insert into draft_sync_state
select public.sync_active_match_draft_v2(
  null,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'singles',
  array['22222222-2222-4222-8222-222222222222']::uuid[],
  array['33333333-3333-4333-8333-333333333333']::uuid[],
  '[{"teamAScore":21,"teamBScore":null,"winnerTeam":"B"}]'
);

select is((select value->>'outcome' from draft_sync_state), 'saved', 'a partial draft is saved');
select is(
  (select created_by_user_id from public.active_match_drafts where id = (select (value->>'draftId')::uuid from draft_sync_state)),
  '22222222-2222-4222-8222-222222222222'::uuid,
  'the RPC derives the creator from the authenticated session'
);
select is(
  (select games from public.active_match_drafts where id = (select (value->>'draftId')::uuid from draft_sync_state)),
  '[{"teamAScore":21,"teamBScore":null,"winnerTeam":"B"}]'::jsonb,
  'nullable scores and the selected winner are preserved'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',
  true
);
select is(
  public.sync_active_match_draft_v2(
    (select (value->>'draftId')::uuid from draft_sync_state),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'singles',
    array['22222222-2222-4222-8222-222222222222']::uuid[],
    array['33333333-3333-4333-8333-333333333333']::uuid[],
    '[{"teamAScore":21,"teamBScore":19,"winnerTeam":"A"}]'
  )->>'outcome',
  'saved',
  'a stored participant can update the shared draft'
);
select is(
  (select created_by_user_id from public.active_match_drafts where id = (select (value->>'draftId')::uuid from draft_sync_state)),
  '22222222-2222-4222-8222-222222222222'::uuid,
  'shared editing does not replace the creator'
);
select ok(
  (select expires_at > now() + interval '23 hours' from public.active_match_drafts where id = (select (value->>'draftId')::uuid from draft_sync_state)),
  'saving renews draft expiry'
);

reset role;
insert into public.matches (id, group_id, created_by_user_id)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '22222222-2222-4222-8222-222222222222'
);
update public.active_match_drafts
set submitted_match_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
where id = (select (value->>'draftId')::uuid from draft_sync_state);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    'select public.sync_active_match_draft_v2(%L, %L, %L, %L::uuid[], %L::uuid[], %L::jsonb)',
    (select value->>'draftId' from draft_sync_state),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'singles',
    '{22222222-2222-4222-8222-222222222222}',
    '{33333333-3333-4333-8333-333333333333}',
    '[{"teamAScore":21,"teamBScore":18,"winnerTeam":"A"}]'
  ),
  'MRVAL',
  'This active match was already submitted.',
  'a retired draft cannot be changed'
);
reset role;
update public.active_match_drafts set submitted_match_id = null
where id = (select (value->>'draftId')::uuid from draft_sync_state);
delete from public.matches where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    'select public.sync_active_match_draft_v2(%L, %L, %L, %L::uuid[], %L::uuid[], %L::jsonb)',
    (select value->>'draftId' from draft_sync_state),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'singles',
    '{22222222-2222-4222-8222-222222222222}',
    '{33333333-3333-4333-8333-333333333333}',
    '[{"teamAScore":21,"teamBScore":18,"winnerTeam":"A"}]'
  ),
  'MRVAL',
  'Only the match creator or a participant can edit this active match.',
  'a neutral active member cannot edit a shared draft'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.sync_active_match_draft_v2(null, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'singles', '{}'::uuid[], '{}'::uuid[], '[{"teamAScore":null,"teamBScore":null,"winnerTeam":"A"}]')$$,
  'MR403',
  'You are not an active member of this group.',
  'a nonmember cannot sync even a blank draft'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.sync_active_match_draft_v2(null, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'singles', '{22222222-2222-4222-8222-222222222222,22222222-2222-4222-8222-222222222222}'::uuid[], '{}'::uuid[], '[{"teamAScore":null,"teamBScore":null,"winnerTeam":"A"}]')$$,
  'MRVAL',
  'singles drafts allow at most 1 player per team.',
  'team size is validated inside the transaction'
);
select throws_ok(
  $$select public.sync_active_match_draft_v2(null, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'doubles', '{22222222-2222-4222-8222-222222222222}'::uuid[], '{22222222-2222-4222-8222-222222222222}'::uuid[], '[{"teamAScore":null,"teamBScore":null,"winnerTeam":"A"}]')$$,
  'MRVAL',
  'A draft cannot contain duplicate players.',
  'duplicate players are rejected inside the transaction'
);
select throws_ok(
  $$select public.sync_active_match_draft_v2(null, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'singles', '{22222222-2222-4222-8222-222222222222}'::uuid[], '{55555555-5555-4555-8555-555555555555}'::uuid[], '[{"teamAScore":null,"teamBScore":null,"winnerTeam":"A"}]')$$,
  'MRVAL',
  'Player 55555555-5555-4555-8555-555555555555 is not an active member of this group.',
  'selected players must be active group members'
);
select throws_ok(
  $$select public.sync_active_match_draft_v2(null, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'singles', '{}'::uuid[], '{}'::uuid[], '[{"teamAScore":null,"teamBScore":null,"winnerTeam":"A"},{"teamAScore":null,"teamBScore":null,"winnerTeam":"A"},{"teamAScore":null,"teamBScore":null,"winnerTeam":"A"},{"teamAScore":null,"teamBScore":null,"winnerTeam":"A"},{"teamAScore":null,"teamBScore":null,"winnerTeam":"A"},{"teamAScore":null,"teamBScore":null,"winnerTeam":"A"},{"teamAScore":null,"teamBScore":null,"winnerTeam":"A"},{"teamAScore":null,"teamBScore":null,"winnerTeam":"A"}]')$$,
  'MRVAL',
  'Invalid active match draft.',
  'drafts allow at most seven games'
);
select throws_ok(
  $$select public.sync_active_match_draft_v2(null, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'singles', '{}'::uuid[], '{}'::uuid[], '[{"teamAScore":12,"teamBScore":12,"winnerTeam":"C"}]')$$,
  'MRVAL',
  'Invalid active match draft.',
  'draft games require a valid selected winner'
);

select throws_ok(
  format(
    'select public.sync_active_match_draft_v2(%L, %L, %L, %L::uuid[], %L::uuid[], %L::jsonb)',
    (select value->>'draftId' from draft_sync_state),
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'singles',
    '{}',
    '{}',
    '[{"teamAScore":null,"teamBScore":null,"winnerTeam":"A"}]'
  ),
  'MRVAL',
  'This active match belongs to another group.',
  'a draft cannot be moved across groups'
);

reset role;
update public.active_match_drafts
set expires_at = now() - interval '1 second'
where id = (select (value->>'draftId')::uuid from draft_sync_state);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
select is(
  public.sync_active_match_draft_v2(
    (select (value->>'draftId')::uuid from draft_sync_state),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'singles',
    '{}'::uuid[],
    '{}'::uuid[],
    '[{"teamAScore":null,"teamBScore":null,"winnerTeam":"A"}]'
  )->>'outcome',
  'expired',
  'an expired draft returns the existing expired outcome'
);
select is((select count(*) from public.active_match_drafts), 0::bigint, 'expired draft cleanup commits with the outcome');

insert into draft_sync_state
select public.sync_active_match_draft_v2(
  null,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'singles',
  array['22222222-2222-4222-8222-222222222222']::uuid[],
  '{}'::uuid[],
  '[{"teamAScore":null,"teamBScore":null,"winnerTeam":"A"}]'
);
select is(
  public.sync_active_match_draft_v2(
    (select (value->>'draftId')::uuid from draft_sync_state order by ctid desc limit 1),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'singles',
    '{}'::uuid[],
    '{}'::uuid[],
    '[{"teamAScore":null,"teamBScore":null,"winnerTeam":"B"}]'
  )->>'outcome',
  'deleted',
  'a blank existing draft is deleted'
);
select is((select count(*) from public.active_match_drafts), 0::bigint, 'blank deletion removes the existing row');

reset role;
select set_config('request.jwt.claims', '{}', true);
set local role authenticated;
select throws_ok(
  $$select public.sync_active_match_draft_v2(null, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'singles', '{}'::uuid[], '{}'::uuid[], '[{"teamAScore":null,"teamBScore":null,"winnerTeam":"A"}]')$$,
  'MR401',
  'You must be signed in to do that.',
  'the RPC derives and requires the actor from the session'
);

select * from finish();
rollback;
