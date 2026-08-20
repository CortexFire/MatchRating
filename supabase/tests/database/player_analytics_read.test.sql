begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(6);

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
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 1550, 90, .06, 8, 2);

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
