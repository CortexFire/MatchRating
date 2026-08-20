begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(31);

select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'group_rating_states'
      and column_name in ('consistency_log_mean', 'consistency_log_variance')
      and data_type = 'numeric'
      and numeric_precision = 18
      and numeric_scale = 12
      and is_nullable = 'NO'
  ),
  2::bigint,
  'current consistency means and variances use the exact non-null numeric contract'
);

select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'group_rating_states'
      and column_name = 'consistency_matches_played' and data_type = 'integer'
      and is_nullable = 'NO' and column_default = '0'
  )
    and (select column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'group_rating_states'
        and column_name = 'consistency_log_mean') = '5.298317366548'
    and (select column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'group_rating_states'
        and column_name = 'consistency_log_variance') = '0.122500000000',
  'current consistency state defaults to the population prior'
);

select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.group_rating_states'::regclass and conname = 'group_rating_states_consistency_log_mean_check')
    and exists (select 1 from pg_constraint where conrelid = 'public.group_rating_states'::regclass and conname = 'group_rating_states_consistency_log_variance_check')
    and exists (select 1 from pg_constraint where conrelid = 'public.group_rating_states'::regclass and conname = 'group_rating_states_consistency_matches_played_check'),
  'current consistency state rejects non-finite or impossible values'
);

select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'consistency_events'
      and column_name in (
        'id', 'group_id', 'match_id', 'revision_id', 'user_id', 'occurred_at',
        'format', 'team', 'sequence', 'expected_score', 'actual_score',
        'before_log_mean', 'before_log_variance', 'before_matches_played',
        'after_log_mean', 'after_log_variance', 'after_matches_played', 'created_at'
      )
      and is_nullable = 'NO'
  ),
  18::bigint,
  'consistency events persist the complete required canonical fact'
);

select ok(
  (select count(*) from pg_constraint where conrelid = 'public.consistency_events'::regclass and contype = 'f') = 4
    and exists (select 1 from pg_constraint where conrelid = 'public.consistency_events'::regclass and confrelid = 'public.groups'::regclass)
    and exists (select 1 from pg_constraint where conrelid = 'public.consistency_events'::regclass and confrelid = 'public.matches'::regclass)
    and exists (select 1 from pg_constraint where conrelid = 'public.consistency_events'::regclass and confrelid = 'public.match_revisions'::regclass)
    and exists (select 1 from pg_constraint where conrelid = 'public.consistency_events'::regclass and confrelid = 'public.profiles'::regclass),
  'consistency event identities reference groups, matches, revisions, and profiles'
);

select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.consistency_events'::regclass and conname = 'consistency_events_group_match_user_key' and contype = 'u')
    and exists (select 1 from pg_constraint where conrelid = 'public.consistency_events'::regclass and conname = 'consistency_events_group_sequence_key' and contype = 'u'),
  'consistency events enforce canonical player-match and sequence identities'
);

select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.consistency_events'::regclass and conname = 'consistency_events_expected_score_check')
    and exists (select 1 from pg_constraint where conrelid = 'public.consistency_events'::regclass and conname = 'consistency_events_actual_score_check')
    and exists (select 1 from pg_constraint where conrelid = 'public.consistency_events'::regclass and conname = 'consistency_events_before_state_check')
    and exists (select 1 from pg_constraint where conrelid = 'public.consistency_events'::regclass and conname = 'consistency_events_after_state_check')
    and exists (select 1 from pg_constraint where conrelid = 'public.consistency_events'::regclass and conname = 'consistency_events_matches_played_step_check'),
  'consistency events enforce probabilities, finite states, and one-match transitions'
);

select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'consistency_events' and indexname = 'consistency_events_group_match_sequence_idx')
    and exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'consistency_events' and indexname = 'consistency_events_group_user_sequence_desc_idx'),
  'consistency event chronology and latest-player prefix reads are indexed'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.consistency_events'::regclass)
    and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'consistency_events' and policyname = 'members can read consistency events'),
  'consistency events use the established active-member read policy under RLS'
);

select ok(
  has_table_privilege('authenticated', 'public.consistency_events', 'SELECT')
    and not has_table_privilege('public', 'public.consistency_events', 'INSERT, UPDATE, DELETE')
    and not has_table_privilege('anon', 'public.consistency_events', 'INSERT, UPDATE, DELETE')
    and not has_table_privilege('authenticated', 'public.consistency_events', 'INSERT, UPDATE, DELETE')
    and has_table_privilege('service_role', 'public.consistency_events', 'INSERT, UPDATE, DELETE'),
  'only service-side code can mutate consistency events directly'
);

select ok(
  to_regprocedure('public.begin_incremental_rating_rebuild(uuid,uuid)') is not null
    and to_regprocedure('public.apply_incremental_rating_rebuild(uuid,bigint,integer,jsonb,jsonb)') is not null,
  'legacy incremental rebuild RPCs remain available to already-running workers'
);

select ok(
  to_regprocedure('public.begin_incremental_rating_rebuild_v2(uuid,uuid)') is not null
    and to_regprocedure('public.apply_incremental_rating_rebuild_v2(uuid,bigint,integer,integer,jsonb,jsonb,jsonb)') is not null,
  'versioned consistency-aware rebuild RPCs expose the accepted worker signature'
);

select ok(
  has_function_privilege('service_role', 'public.begin_incremental_rating_rebuild_v2(uuid,uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.apply_incremental_rating_rebuild_v2(uuid,bigint,integer,integer,jsonb,jsonb,jsonb)', 'EXECUTE'),
  'service role can execute both versioned rebuild RPCs'
);

select ok(
  not has_function_privilege('anon', 'public.begin_incremental_rating_rebuild_v2(uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.begin_incremental_rating_rebuild_v2(uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.apply_incremental_rating_rebuild_v2(uuid,bigint,integer,integer,jsonb,jsonb,jsonb)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.apply_incremental_rating_rebuild_v2(uuid,bigint,integer,integer,jsonb,jsonb,jsonb)', 'EXECUTE'),
  'anonymous and authenticated clients cannot execute versioned rebuild RPCs'
);

insert into public.profiles (id, display_name, first_name, last_name)
values
  ('e1111111-1111-4111-8111-111111111111', 'Consistency One', 'Consistency', 'One'),
  ('e2222222-2222-4222-8222-222222222222', 'Consistency Two', 'Consistency', 'Two'),
  ('e3333333-3333-4333-8333-333333333333', 'Consistency Outsider', 'Consistency', 'Outsider');

insert into public.groups (id, owner_user_id, name, rating_input_version)
values ('eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'e1111111-1111-4111-8111-111111111111', 'Consistency Ladder', 1);

insert into public.group_memberships (group_id, user_id, role, status)
values
  ('eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'e1111111-1111-4111-8111-111111111111', 'owner', 'active'),
  ('eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'e2222222-2222-4222-8222-222222222222', 'member', 'active');

insert into public.matches (id, group_id, created_by_user_id, submitted_at)
values ('ebbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'e1111111-1111-4111-8111-111111111111', '2026-08-20T18:00:00Z');

insert into public.match_revisions (id, match_id, version, submitted_by_user_id, format)
values ('eccccccc-cccc-4ccc-8ccc-cccccccccccc', 'ebbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 1, 'e1111111-1111-4111-8111-111111111111', 'singles');

insert into public.match_participants (revision_id, user_id, team, slot)
values
  ('eccccccc-cccc-4ccc-8ccc-cccccccccccc', 'e1111111-1111-4111-8111-111111111111', 'A', 1),
  ('eccccccc-cccc-4ccc-8ccc-cccccccccccc', 'e2222222-2222-4222-8222-222222222222', 'B', 1);

insert into public.match_games (id, revision_id, game_number, team_a_score, team_b_score, winner_team)
values ('eddddddd-dddd-4ddd-8ddd-dddddddddddd', 'eccccccc-cccc-4ccc-8ccc-cccccccccccc', 1, 21, 18, 'A');

update public.matches set active_revision_id = 'eccccccc-cccc-4ccc-8ccc-cccccccccccc'
where id = 'ebbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

insert into public.rating_rebuild_jobs (
  id, group_id, from_match_id, status, created_by_user_id, target_version,
  dispatch_token, dispatch_lease_expires_at
)
values (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'ebbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'queued', 'e1111111-1111-4111-8111-111111111111', 1,
  'efffffff-ffff-4fff-8fff-ffffffffffff', now() + interval '10 minutes'
);

create temporary table consistency_begin_state (value jsonb not null) on commit drop;
insert into consistency_begin_state
select public.begin_incremental_rating_rebuild_v2(
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'efffffff-ffff-4fff-8fff-ffffffffffff'
);

select ok(
  (select (value->>'prefixEventCount')::integer from consistency_begin_state) = 0
    and (select (value->>'prefixConsistencyEventCount')::integer from consistency_begin_state) = 0
    and (select jsonb_array_length(value->'initialRatings') from consistency_begin_state) = 0
    and (select jsonb_array_length(value->'history') from consistency_begin_state) = 1,
  'an absent dual prefix produces a full replay input with empty initial ratings'
);

create temporary table consistency_payloads (
  ratings jsonb not null,
  rating_events jsonb not null,
  consistency_events jsonb not null
) on commit drop;

insert into consistency_payloads values (
  '[
    {"userId":"e1111111-1111-4111-8111-111111111111","rating":1510,"rd":300,"volatility":0.06,"gamesPlayed":1,"rank":1,"logKappaMean":5.2,"logKappaVariance":0.1,"consistencyMatchesPlayed":1},
    {"userId":"e2222222-2222-4222-8222-222222222222","rating":1490,"rd":300,"volatility":0.06,"gamesPlayed":1,"rank":2,"logKappaMean":5.4,"logKappaVariance":0.11,"consistencyMatchesPlayed":1}
  ]'::jsonb,
  '[
    {"matchId":"ebbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","revisionId":"eccccccc-cccc-4ccc-8ccc-cccccccccccc","gameId":"eddddddd-dddd-4ddd-8ddd-dddddddddddd","gameNumber":1,"occurredAt":"2026-08-20T18:00:00Z","format":"singles","team":"A","userId":"e1111111-1111-4111-8111-111111111111","sequence":1,"expectedScore":0.5,"actualScore":1,"pointsFor":21,"pointsAgainst":18,"before":{"rating":1500,"rd":350,"volatility":0.06,"gamesPlayed":0},"after":{"rating":1510,"rd":300,"volatility":0.06,"gamesPlayed":1}},
    {"matchId":"ebbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","revisionId":"eccccccc-cccc-4ccc-8ccc-cccccccccccc","gameId":"eddddddd-dddd-4ddd-8ddd-dddddddddddd","gameNumber":1,"occurredAt":"2026-08-20T18:00:00Z","format":"singles","team":"B","userId":"e2222222-2222-4222-8222-222222222222","sequence":2,"expectedScore":0.5,"actualScore":0,"pointsFor":18,"pointsAgainst":21,"before":{"rating":1500,"rd":350,"volatility":0.06,"gamesPlayed":0},"after":{"rating":1490,"rd":300,"volatility":0.06,"gamesPlayed":1}}
  ]'::jsonb,
  '[
    {"matchId":"ebbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","revisionId":"eccccccc-cccc-4ccc-8ccc-cccccccccccc","occurredAt":"2026-08-20T18:00:00Z","format":"singles","team":"A","userId":"e1111111-1111-4111-8111-111111111111","sequence":1,"expectedScore":0.5,"actualScore":1,"before":{"logKappaMean":5.298317366548,"logKappaVariance":0.1225,"matchesPlayed":0},"after":{"logKappaMean":5.2,"logKappaVariance":0.1,"matchesPlayed":1}},
    {"matchId":"ebbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","revisionId":"eccccccc-cccc-4ccc-8ccc-cccccccccccc","occurredAt":"2026-08-20T18:00:00Z","format":"singles","team":"B","userId":"e2222222-2222-4222-8222-222222222222","sequence":2,"expectedScore":0.5,"actualScore":0,"before":{"logKappaMean":5.298317366548,"logKappaVariance":0.1225,"matchesPlayed":0},"after":{"logKappaMean":5.4,"logKappaVariance":0.11,"matchesPlayed":1}}
  ]'::jsonb
);

select is(
  (
    select public.apply_incremental_rating_rebuild_v2(
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 1, 0, 0,
      ratings, rating_events, consistency_events
    )->>'status'
    from consistency_payloads
  ),
  'completed',
  'a valid dual projection applies atomically'
);

select is(
  (select count(*) from public.rating_events where group_id = 'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  2::bigint,
  'valid apply persists the complete rating event stream'
);

select is(
  (select count(*) from public.consistency_events where group_id = 'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  2::bigint,
  'valid apply persists one consistency event per match participant'
);

select ok(
  exists (
    select 1 from public.group_rating_states
    where group_id = 'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and user_id = 'e1111111-1111-4111-8111-111111111111'
      and consistency_log_mean = 5.2
      and consistency_log_variance = 0.1
      and consistency_matches_played = 1
  ),
  'valid apply persists the latest current consistency state'
);

select ok(
  (select rating_applied_version from public.groups where id = 'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 1
    and (select status from public.rating_rebuild_jobs where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') = 'completed',
  'freshness and job completion advance with the dual projection'
);

insert into public.rating_rebuild_jobs (
  id, group_id, from_match_id, status, created_by_user_id, target_version,
  dispatch_token, dispatch_lease_expires_at
)
values (
  'f0111111-1111-4111-8111-111111111111',
  'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'ebbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'queued', 'e1111111-1111-4111-8111-111111111111', 1,
  'f0222222-2222-4222-8222-222222222222', now() + interval '10 minutes'
);

select public.begin_incremental_rating_rebuild_v2(
  'f0111111-1111-4111-8111-111111111111',
  'f0222222-2222-4222-8222-222222222222'
);

select throws_ok(
  $$
    select public.apply_incremental_rating_rebuild_v2(
      'f0111111-1111-4111-8111-111111111111', 1, 0, 0,
      ratings, rating_events, '[]'::jsonb
    ) from consistency_payloads
  $$,
  'MRVAL',
  'Invalid canonical consistency events',
  'an incomplete consistency projection is rejected before persistent changes'
);

select ok(
  (select count(*) from public.rating_events where group_id = 'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 2
    and (select count(*) from public.consistency_events where group_id = 'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 2
    and (select consistency_log_mean from public.group_rating_states where group_id = 'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id = 'e1111111-1111-4111-8111-111111111111') = 5.2
    and (select status from public.rating_rebuild_jobs where id = 'f0111111-1111-4111-8111-111111111111') = 'running',
  'consistency validation failure rolls back ratings, both streams, state, and job completion'
);

update public.rating_rebuild_jobs
set status = 'failed', error = 'test cleanup', updated_at = now()
where id = 'f0111111-1111-4111-8111-111111111111';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select is(
  (select count(*) from public.consistency_events where group_id = 'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  2::bigint,
  'an active group member can read consistency events'
);
select set_config('request.jwt.claims', '{"sub":"e3333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select is(
  (select count(*) from public.consistency_events where group_id = 'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  0::bigint,
  'an outsider cannot read consistency events'
);
reset role;

insert into public.matches (id, group_id, created_by_user_id, submitted_at)
values ('f1333333-3333-4333-8333-333333333333', 'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'e1111111-1111-4111-8111-111111111111', '2026-08-20T19:00:00Z');
insert into public.match_revisions (id, match_id, version, submitted_by_user_id, format)
values ('f1444444-4444-4444-8444-444444444444', 'f1333333-3333-4333-8333-333333333333', 1, 'e1111111-1111-4111-8111-111111111111', 'singles');
insert into public.match_participants (revision_id, user_id, team, slot)
values
  ('f1444444-4444-4444-8444-444444444444', 'e1111111-1111-4111-8111-111111111111', 'A', 1),
  ('f1444444-4444-4444-8444-444444444444', 'e2222222-2222-4222-8222-222222222222', 'B', 1);
insert into public.match_games (id, revision_id, game_number, team_a_score, team_b_score, winner_team)
values ('f1555555-5555-4555-8555-555555555555', 'f1444444-4444-4444-8444-444444444444', 1, 17, 21, 'B');
update public.matches set active_revision_id = 'f1444444-4444-4444-8444-444444444444'
where id = 'f1333333-3333-4333-8333-333333333333';
update public.groups set rating_input_version = 2 where id = 'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

insert into public.rating_rebuild_jobs (
  id, group_id, from_match_id, status, created_by_user_id, target_version,
  dispatch_token, dispatch_lease_expires_at
)
values (
  'f1666666-6666-4666-8666-666666666666',
  'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'f1333333-3333-4333-8333-333333333333',
  'queued', 'e1111111-1111-4111-8111-111111111111', 2,
  'f1777777-7777-4777-8777-777777777777', now() + interval '10 minutes'
);

create temporary table consistency_suffix_state (value jsonb not null) on commit drop;
insert into consistency_suffix_state
select public.begin_incremental_rating_rebuild_v2(
  'f1666666-6666-4666-8666-666666666666',
  'f1777777-7777-4777-8777-777777777777'
);

select ok(
  (select (value->>'prefixEventCount')::integer from consistency_suffix_state) = 2
    and (select (value->>'prefixConsistencyEventCount')::integer from consistency_suffix_state) = 2,
  'append-only begin preserves independent complete prefixes for both streams'
);

select ok(
  (select jsonb_array_length(value->'initialRatings') from consistency_suffix_state) = 2
    and (select value->'initialRatings' @> '[{"userId":"e1111111-1111-4111-8111-111111111111","logKappaMean":5.200000000000,"logKappaVariance":0.100000000000,"consistencyMatchesPlayed":1}]'::jsonb from consistency_suffix_state),
  'append-only begin seeds latest Glicko and consistency state together'
);

select ok(
  (select jsonb_array_length(value->'history') from consistency_suffix_state) = 1
    and (select value#>>'{history,0,id}' from consistency_suffix_state) = 'f1333333-3333-4333-8333-333333333333',
  'append-only begin returns only the dirty suffix history'
);

update public.consistency_events set actual_score = 0
where group_id = 'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and sequence = 1;
truncate consistency_suffix_state;
insert into consistency_suffix_state
select public.begin_incremental_rating_rebuild_v2(
  'f1666666-6666-4666-8666-666666666666',
  'f1777777-7777-4777-8777-777777777777'
);
select ok(
  (select (value->>'prefixEventCount')::integer from consistency_suffix_state) = 0
    and (select (value->>'prefixConsistencyEventCount')::integer from consistency_suffix_state) = 0
    and (select jsonb_array_length(value->'initialRatings') from consistency_suffix_state) = 0
    and (select jsonb_array_length(value->'history') from consistency_suffix_state) = 2,
  'a corrupted consistency prefix forces both streams to a full replay'
);

update public.consistency_events set actual_score = 1
where group_id = 'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and sequence = 1;
insert into public.match_revisions (id, match_id, version, submitted_by_user_id, format)
values ('f1888888-8888-4888-8888-888888888888', 'ebbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 2, 'e1111111-1111-4111-8111-111111111111', 'singles');
insert into public.match_participants (revision_id, user_id, team, slot)
values
  ('f1888888-8888-4888-8888-888888888888', 'e1111111-1111-4111-8111-111111111111', 'A', 1),
  ('f1888888-8888-4888-8888-888888888888', 'e2222222-2222-4222-8222-222222222222', 'B', 1);
insert into public.match_games (id, revision_id, game_number, team_a_score, team_b_score, winner_team)
values ('f1999999-9999-4999-8999-999999999999', 'f1888888-8888-4888-8888-888888888888', 1, 19, 21, 'B');
update public.matches set active_revision_id = 'f1888888-8888-4888-8888-888888888888'
where id = 'ebbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
truncate consistency_suffix_state;
insert into consistency_suffix_state
select public.begin_incremental_rating_rebuild_v2(
  'f1666666-6666-4666-8666-666666666666',
  'f1777777-7777-4777-8777-777777777777'
);
select ok(
  (select (value->>'prefixEventCount')::integer from consistency_suffix_state) = 0
    and (select (value->>'prefixConsistencyEventCount')::integer from consistency_suffix_state) = 0
    and (select value#>>'{history,0,revisionId}' from consistency_suffix_state) = 'f1888888-8888-4888-8888-888888888888',
  'an active-revision correction invalidates the dual prefix and replays active history'
);

select is(
  (
    select public.apply_incremental_rating_rebuild_v2(
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 1, 0, 0,
      ratings, rating_events, consistency_events
    )->>'status'
    from consistency_payloads
  ),
  'stale',
  'stale versioned projections retain the legacy stale result'
);

select ok(
  (select count(*) from public.rating_events where group_id = 'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 2
    and (select count(*) from public.consistency_events where group_id = 'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 2
    and (select rating_applied_version from public.groups where id = 'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 1
    and (select status from public.rating_rebuild_jobs where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') = 'completed',
  'stale apply leaves rating events, consistency events, state freshness, and job status unchanged'
);

select * from finish();
rollback;
