begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

select has_function(
  'public',
  'get_player_analytics_facts',
  array['uuid', 'uuid'],
  'player analytics exposes a two-identifier read RPC'
);

select ok(
  has_function_privilege('authenticated', 'public.get_player_analytics_facts(uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.get_player_analytics_facts(uuid,uuid)', 'EXECUTE'),
  'analytics reads are authenticated-only'
);

insert into public.profiles (id, display_name, first_name, last_name, active_until)
values
  ('11111111-1111-4111-8111-111111111111', 'Alice Tan', 'Alice', 'Tan', now() + interval '1 day'),
  ('22222222-2222-4222-8222-222222222222', 'Bea Rivera', 'Bea', 'Rivera', now() + interval '1 day'),
  ('33333333-3333-4333-8333-333333333333', 'Outside User', 'Outside', 'User', now() + interval '1 day');

insert into public.groups (id, owner_user_id, name, rating_input_version, rating_applied_version, analytics_applied_version)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Downtown Rec', 1, 1, 1);

insert into public.group_memberships (group_id, user_id, role, status)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'owner', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'member', 'active');

insert into public.group_rating_states (group_id, user_id, rating, rd, volatility, games_played, rank)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 1600, 80, .06, 10, 1),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 1550, 110.01, .06, 8, 2);

insert into public.matches (id, group_id, created_by_user_id, status, submitted_at)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'confirmed', '2026-08-18T12:00:00Z');

insert into public.match_revisions (id, match_id, version, submitted_by_user_id, format)
values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 1, '11111111-1111-4111-8111-111111111111', 'singles'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 2, '11111111-1111-4111-8111-111111111111', 'singles');

update public.matches
set active_revision_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

insert into public.match_participants (revision_id, user_id, team, slot)
values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', 'A', 1),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '22222222-2222-4222-8222-222222222222', 'B', 1);

insert into public.match_games (id, revision_id, game_number, team_a_score, team_b_score, winner_team)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 1, 18, 21, 'B');

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'rating_events' and column_name = 'before_games_played'
  ) then
    execute $insert$
      insert into public.rating_events (
        group_id, match_id, revision_id, game_id, game_number, occurred_at,
        format, team, user_id, sequence, expected_score, actual_score,
        points_for, points_against,
        before_rating, before_rd, before_volatility, before_games_played,
        after_rating, after_rd, after_volatility, after_games_played
      ) values
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 1, '2026-08-18T12:00:00Z', 'singles', 'A', '11111111-1111-4111-8111-111111111111', 1, .4, 0, 18, 21, 1600, 80, .06, 10, 1588, 78, .06, 11),
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 1, '2026-08-18T12:00:00Z', 'singles', 'B', '22222222-2222-4222-8222-222222222222', 2, .6, 1, 21, 18, 1538, 110.01, .06, 8, 1550, 109.99, .06, 9)
    $insert$;
  else
    insert into public.rating_events (
      group_id, match_id, revision_id, user_id, sequence,
      before_rating, before_rd, before_volatility,
      after_rating, after_rd, after_volatility
    ) values
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', 1, 1600, 80, .06, 1588, 78, .06),
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '22222222-2222-4222-8222-222222222222', 2, 1538, 110.01, .06, 1550, 109.99, .06);
  end if;
end;
$$;

insert into public.consistency_events (
  group_id, match_id, revision_id, user_id, occurred_at, format, team,
  sequence, expected_score, actual_score,
  before_log_mean, before_log_variance, before_matches_played,
  after_log_mean, after_log_variance, after_matches_played
)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '22222222-2222-4222-8222-222222222222',
  '2026-08-18T12:00:00Z', 'singles', 'B', 1, .6, 1,
  ln(90), .12, 4, ln(85), .11, 5
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select is(
  public.get_player_analytics_facts(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '22222222-2222-4222-8222-222222222222'
  )->>'status',
  'ready',
  'a member can read another visible member analytics'
);

select is(
  public.get_player_analytics_facts(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '22222222-2222-4222-8222-222222222222'
  )->'current'->>'rating',
  '1550',
  'analytics returns the subject current rating'
);

select is(
  public.get_player_analytics_facts(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '22222222-2222-4222-8222-222222222222'
  )->'current'->>'rd',
  '110.01',
  'analytics returns the unrounded current rating deviation'
);

select is(
  array[
    public.get_player_analytics_facts(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '22222222-2222-4222-8222-222222222222'
    )->'matches'->0->>'rdBefore',
    public.get_player_analytics_facts(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '22222222-2222-4222-8222-222222222222'
    )->'matches'->0->>'rdAfter'
  ],
  array['110.01', '109.99'],
  'analytics returns the unrounded deviation for each historical rating state'
);

select is(
  public.get_player_analytics_facts(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '22222222-2222-4222-8222-222222222222'
  )->'matches'->0->>'performanceSdAfter',
  '85',
  'analytics returns the active revision canonical post-match consistency'
);

set local role postgres;
update public.consistency_events
set after_log_mean = 50
where group_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  and match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  and user_id = '22222222-2222-4222-8222-222222222222';
set local role authenticated;

select throws_ok(
  $$
    select public.get_player_analytics_facts(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '22222222-2222-4222-8222-222222222222'
    )
  $$,
  'MRVAL',
  'Invalid historical consistency coverage',
  'analytics rejects a consistency value outside the safe integer projection range'
);

set local role postgres;
update public.consistency_events
set
  revision_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  after_log_mean = ln(85)
where group_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  and match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  and user_id = '22222222-2222-4222-8222-222222222222';
set local role authenticated;

select throws_ok(
  $$
    select public.get_player_analytics_facts(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '22222222-2222-4222-8222-222222222222'
    )
  $$,
  'MRVAL',
  'Invalid historical consistency coverage',
  'analytics rejects a consistency event from an inactive revision'
);

set local role postgres;
delete from public.consistency_events
where group_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  and match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  and user_id = '22222222-2222-4222-8222-222222222222';
set local role authenticated;

select throws_ok(
  $$
    select public.get_player_analytics_facts(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '22222222-2222-4222-8222-222222222222'
    )
  $$,
  'MRVAL',
  'Invalid historical consistency coverage',
  'analytics rejects a missing canonical consistency event'
);

select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select is(
  public.get_player_analytics_facts(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '22222222-2222-4222-8222-222222222222'
  )::text,
  null,
  'nonmembers receive null without private group disclosure'
);

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role postgres;
update public.groups set analytics_applied_version = 0 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local role authenticated;
select is(
  public.get_player_analytics_facts(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '22222222-2222-4222-8222-222222222222'
  )->>'status',
  'updating',
  'stale analytics return a calm updating contract'
);

select * from finish();
rollback;
