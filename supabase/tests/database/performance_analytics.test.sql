begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(23);

select has_function(
  'public',
  'get_player_analytics_v2',
  array['uuid', 'uuid'],
  'bounded analytics exposes a versioned read RPC'
);

select has_function(
  'public',
  'get_player_analytics_history_v2',
  array['uuid', 'uuid', 'text', 'timestamp with time zone', 'bigint',
    'timestamp with time zone', 'uuid', 'integer'],
  'exact analytics history exposes a versioned cursor RPC'
);

select ok(
  has_function_privilege('authenticated', 'public.get_player_analytics_v2(uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.get_player_analytics_v2(uuid,uuid)', 'EXECUTE')
    and has_function_privilege(
      'authenticated',
      'public.get_player_analytics_history_v2(uuid,uuid,text,timestamptz,bigint,timestamptz,uuid,integer)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon',
      'public.get_player_analytics_history_v2(uuid,uuid,text,timestamptz,bigint,timestamptz,uuid,integer)',
      'EXECUTE'
    ),
  'bounded analytics reads are authenticated-only'
);

insert into public.profiles (id, display_name, first_name, last_name, active_until)
values
  ('11111111-1111-4111-8111-111111111111', 'Alice Tan', 'Alice', 'Tan', now() + interval '1 day'),
  ('22222222-2222-4222-8222-222222222222', 'Bea Rivera', 'Bea', 'Rivera', now() + interval '1 day'),
  ('33333333-3333-4333-8333-333333333333', 'Outside User', 'Outside', 'User', now() + interval '1 day');

insert into public.groups (
  id, owner_user_id, name, rating_input_version, rating_applied_version, analytics_applied_version
)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'Downtown Rec',
  1,
  1,
  1
);

insert into public.group_memberships (group_id, user_id, role, status)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'owner', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'member', 'active');

insert into public.group_rating_states (
  group_id, user_id, rating, rd, volatility, games_played, rank
)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 1600, 80, .06, 205, 1),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 1705, 109.99, .06, 205, 2);

insert into public.matches (id, group_id, created_by_user_id, status, submitted_at)
select
  ('10000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  '11111111-1111-4111-8111-111111111111'::uuid,
  'confirmed'::public.match_status,
  '2026-01-01T12:00:00Z'::timestamptz
    + (case when series >= 204 then 205 else series end) * interval '1 minute'
from generate_series(1, 205) as series;

insert into public.match_revisions (id, match_id, version, submitted_by_user_id, format)
select
  ('20000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  ('10000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  1,
  '11111111-1111-4111-8111-111111111111'::uuid,
  'singles'::public.match_format
from generate_series(1, 205) as series;

update public.matches
set active_revision_id = (
  '20000000-0000-4000-8000-' || right(id::text, 12)
)::uuid
where group_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

insert into public.match_participants (revision_id, user_id, team, slot)
select
  ('20000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  participant.user_id,
  participant.team,
  1
from generate_series(1, 205) as series
cross join (
  values
    ('11111111-1111-4111-8111-111111111111'::uuid, 'B'::public.team_code),
    ('22222222-2222-4222-8222-222222222222'::uuid, 'A'::public.team_code)
) as participant(user_id, team);

insert into public.match_games (
  id, revision_id, game_number, team_a_score, team_b_score, winner_team
)
select
  ('30000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  ('20000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  1,
  21,
  18,
  'A'::public.team_code
from generate_series(1, 205) as series;

insert into public.rating_events (
  group_id, match_id, revision_id, game_id, game_number, occurred_at,
  format, team, user_id, sequence, expected_score, actual_score,
  points_for, points_against,
  before_rating, before_rd, before_volatility, before_games_played,
  after_rating, after_rd, after_volatility, after_games_played
)
select
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  ('10000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  ('20000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  ('30000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  1,
  '2026-01-01T12:00:00Z'::timestamptz
    + (case when series >= 204 then 205 else series end) * interval '1 minute',
  'singles'::public.match_format,
  event.team,
  event.user_id,
  series * 2 + event.sequence_offset,
  event.expected_score,
  event.actual_score,
  event.points_for,
  event.points_against,
  1500 + case when event.team = 'A' then series - 1 else -(series - 1) end,
  110,
  .06,
  series - 1,
  1500 + case when event.team = 'A' then series else -series end,
  109.99,
  .06,
  series
from generate_series(1, 205) as series
cross join (
  values
    ('22222222-2222-4222-8222-222222222222'::uuid, 'A'::public.team_code, -1, .4::numeric, 1::smallint, 21, 18),
    ('11111111-1111-4111-8111-111111111111'::uuid, 'B'::public.team_code, 0, .6::numeric, 0::smallint, 18, 21)
) as event(user_id, team, sequence_offset, expected_score, actual_score, points_for, points_against);

insert into public.consistency_events (
  group_id, match_id, revision_id, user_id, occurred_at, format, team,
  sequence, expected_score, actual_score,
  before_log_mean, before_log_variance, before_matches_played,
  after_log_mean, after_log_variance, after_matches_played
)
select
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  ('10000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  ('20000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  '22222222-2222-4222-8222-222222222222'::uuid,
  '2026-01-01T12:00:00Z'::timestamptz
    + (case when series >= 204 then 205 else series end) * interval '1 minute',
  'singles'::public.match_format,
  'A'::public.team_code,
  series,
  .4,
  1,
  ln(85),
  .1,
  series - 1,
  ln(85),
  .1,
  series
from generate_series(1, 205) as series;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

set local role postgres;
select is(
  (
    select expected_game_wins
    from private.player_analytics_match_facts_v2(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '22222222-2222-4222-8222-222222222222',
      array['10000000-0000-4000-8000-000000000001'::uuid]
    )
  ),
  (
    select expected_game_wins
    from private.player_analytics_match_facts(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    )
    where user_id = '22222222-2222-4222-8222-222222222222'
      and match_id = '10000000-0000-4000-8000-000000000001'
  ),
  'v2 preserves reconstructed team-rating expectations when stored event expectations differ'
);
set local role authenticated;

create temporary table bounded_payload(value jsonb not null) on commit drop;
insert into bounded_payload
select public.get_player_analytics_v2(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '22222222-2222-4222-8222-222222222222'
);

select is((select value->>'status' from bounded_payload), 'ready', 'v2 analytics are ready');
select is((select value->>'ratingVersion' from bounded_payload), '1', 'v2 binds the applied rating version');
select is((select value#>>'{current,rd}' from bounded_payload), '109.99', 'v2 preserves current deviation');
select is(
  (select (value#>>'{periods,all,matchCount}')::integer from bounded_payload),
  205,
  'v2 summary includes every subject match'
);
select ok(
  (select jsonb_array_length(value#>'{periods,all,ratingHistory}') from bounded_payload) <= 200,
  'v2 samples the chart before returning JSON'
);
select is(
  (select value#>>'{periods,all,ratingHistory,0,matchId}' from bounded_payload),
  '10000000-0000-4000-8000-000000000001',
  'sampling retains the first point'
);
select is(
  (
    select item.value->>'matchId'
    from bounded_payload,
      lateral jsonb_array_elements(value#>'{periods,all,ratingHistory}') with ordinality item(value, position)
    order by position desc
    limit 1
  ),
  '10000000-0000-4000-8000-000000000205',
  'sampling retains the last point'
);
select is(
  (select value#>>'{periods,all,ratingHistoryBounds}' from bounded_payload),
  '[1396, 1810]',
  'chart bounds use the complete consistency envelope with padding'
);

create temporary table first_exact_page(value jsonb not null) on commit drop;
insert into first_exact_page
select public.get_player_analytics_history_v2(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '22222222-2222-4222-8222-222222222222',
  'all',
  '2026-09-07T12:00:00Z',
  1,
  null,
  null,
  50
);

select is(
  (select jsonb_array_length(value->'points') from first_exact_page),
  50,
  'exact history returns 50 points'
);
select is(
  (select value#>>'{points,0,matchId}' from first_exact_page),
  '10000000-0000-4000-8000-000000000205',
  'exact history sorts newest first'
);
select is(
  (select value#>>'{points,1,matchId}' from first_exact_page),
  '10000000-0000-4000-8000-000000000204',
  'exact history breaks equal timestamps by descending match ID'
);
select is((select value->>'hasMore' from first_exact_page), 'true', 'exact history reports an older page');

create temporary table exact_matches_seen(match_id uuid primary key) on commit drop;
do $$
declare
  v_page jsonb;
  v_cursor_at timestamptz;
  v_cursor_id uuid;
  v_page_count integer := 0;
begin
  loop
    v_page := public.get_player_analytics_history_v2(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '22222222-2222-4222-8222-222222222222',
      'all',
      '2026-09-07T12:00:00Z',
      1,
      v_cursor_at,
      v_cursor_id,
      50
    );
    v_page_count := v_page_count + 1;

    insert into exact_matches_seen(match_id)
    select (point->>'matchId')::uuid
    from jsonb_array_elements(v_page->'points') as point
    on conflict do nothing;

    exit when not (v_page->>'hasMore')::boolean;
    if v_page_count >= 10 then
      raise exception 'analytics history pagination did not terminate';
    end if;

    select
      (point->>'occurredAt')::timestamptz,
      (point->>'matchId')::uuid
    into v_cursor_at, v_cursor_id
    from jsonb_array_elements(v_page->'points') with ordinality as item(point, position)
    order by position desc
    limit 1;
  end loop;
end;
$$;

select is(
  (select count(*) from exact_matches_seen),
  205::bigint,
  'every exact historical match is reachable without overlap'
);

select throws_ok(
  $$
    select public.get_player_analytics_history_v2(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '22222222-2222-4222-8222-222222222222',
      'all', '2026-09-07T12:00:00Z', 0, null, null, 50
    )
  $$,
  'MR409',
  'Rating version changed',
  'exact history rejects a stale initial version'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',
  true
);
select is(
  public.get_player_analytics_v2(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '22222222-2222-4222-8222-222222222222'
  )::text,
  null,
  'v2 analytics do not disclose inaccessible players'
);
select throws_ok(
  $$
    select public.get_player_analytics_history_v2(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '22222222-2222-4222-8222-222222222222',
      'all', null, null, null, null, 50
    )
  $$,
  'MR403',
  'Analytics history is inaccessible',
  'exact history rejects an inaccessible player'
);

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$
    select public.get_player_analytics_v2(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '22222222-2222-4222-8222-222222222222'
    )
  $$,
  'MR401',
  'Authentication required',
  'v2 analytics require authentication'
);
select throws_ok(
  $$
    select public.get_player_analytics_history_v2(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '22222222-2222-4222-8222-222222222222',
      'all', null, null, null, null, 50
    )
  $$,
  'MR401',
  'Authentication required',
  'exact history requires authentication'
);

set local role postgres;
update public.groups
set analytics_applied_version = 0
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select is(
  public.get_player_analytics_v2(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '22222222-2222-4222-8222-222222222222'
  )->>'status',
  'updating',
  'v2 preserves the calm version-readiness state'
);

select * from finish();
rollback;
