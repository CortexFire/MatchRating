-- Read-only production audit for the canonical incremental rating-rebuild contract.
-- Run in the Supabase SQL Editor after the prefix-zero backfill and contract migration.
with targets as (
  select
    to_regprocedure('public.begin_rating_rebuild(uuid,uuid)')::oid as legacy_begin_oid,
    to_regprocedure('public.apply_rating_rebuild(uuid,bigint,jsonb,jsonb)')::oid as legacy_apply_oid,
    to_regprocedure('public.begin_incremental_rating_rebuild(uuid,uuid)')::oid as incremental_begin_oid,
    to_regprocedure('public.apply_incremental_rating_rebuild(uuid,bigint,integer,jsonb,jsonb)')::oid as incremental_apply_oid
), definitions as (
  select
    pg_get_functiondef(incremental_begin_oid) as incremental_begin_body,
    pg_get_functiondef(incremental_apply_oid) as incremental_apply_body
  from targets
), canonical_columns as (
  select
    count(*) = 14
      and count(*) filter (where is_nullable = 'NO' and column_name not in ('rating_delta', 'expectation_residual', 'point_delta')) = 11
      and count(*) filter (where is_generated = 'ALWAYS') = 3 as compatible
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'rating_events'
    and column_name in (
      'before_games_played', 'after_games_played', 'game_id', 'game_number',
      'occurred_at', 'format', 'team', 'expected_score', 'actual_score',
      'points_for', 'points_against', 'rating_delta', 'expectation_residual',
      'point_delta'
    )
), canonical_indexes as (
  select
    bool_or(indexname = 'rating_events_group_game_user_key' and indexdef like 'CREATE UNIQUE INDEX%')
      and bool_or(indexname = 'rating_events_group_sequence_key' and indexdef like 'CREATE UNIQUE INDEX%')
      and bool_or(indexname = 'rating_events_group_user_occurred_idx')
      and bool_or(indexname = 'rating_events_group_game_team_idx') as compatible
  from pg_indexes
  where schemaname = 'public' and tablename = 'rating_events'
), expected_facts as (
  select
    match.group_id,
    match.id as match_id,
    revision.id as revision_id,
    game.id as game_id,
    game.game_number,
    match.submitted_at as occurred_at,
    revision.format,
    participant.team,
    participant.user_id,
    case when game.winner_team = participant.team then 1 else 0 end::smallint as actual_score,
    case when participant.team = 'A' then game.team_a_score else game.team_b_score end as points_for,
    case when participant.team = 'A' then game.team_b_score else game.team_a_score end as points_against
  from public.matches match
  join public.match_revisions revision on revision.id = match.active_revision_id
  join public.match_games game on game.revision_id = revision.id
  join public.match_participants participant on participant.revision_id = revision.id
), missing_or_mismatched as (
  select count(*) as fact_count
  from expected_facts expected
  left join public.rating_events event
    on event.group_id = expected.group_id
    and event.match_id = expected.match_id
    and event.revision_id = expected.revision_id
    and event.game_id = expected.game_id
    and event.game_number = expected.game_number
    and event.occurred_at = expected.occurred_at
    and event.format = expected.format
    and event.team = expected.team
    and event.user_id = expected.user_id
    and event.actual_score = expected.actual_score
    and event.points_for = expected.points_for
    and event.points_against = expected.points_against
  where event.id is null
), extra_or_superseded as (
  select count(*) as fact_count
  from public.rating_events event
  left join expected_facts expected
    on expected.group_id = event.group_id
    and expected.game_id = event.game_id
    and expected.user_id = event.user_id
  where expected.game_id is null
), sequence_gaps as (
  select count(*) as group_count
  from (
    select group_id
    from public.rating_events
    group by group_id
    having min(sequence) <> 1
      or max(sequence) <> count(*)
      or count(distinct sequence) <> count(*)
  ) invalid
), doubles_expectations as (
  select count(*) as game_count
  from (
    select group_id, game_id
    from public.rating_events
    where format = 'doubles'
    group by group_id, game_id
    having max(expected_score) filter (where team = 'A')
        <> min(expected_score) filter (where team = 'A')
      or max(expected_score) filter (where team = 'B')
        <> min(expected_score) filter (where team = 'B')
      or abs(
        max(expected_score) filter (where team = 'A')
        + max(expected_score) filter (where team = 'B') - 1
      ) > 0.000000001
  ) invalid
), permissions as (
  select
    has_function_privilege('service_role', 'public.begin_incremental_rating_rebuild(uuid,uuid)', 'EXECUTE')
      and has_function_privilege('service_role', 'public.apply_incremental_rating_rebuild(uuid,bigint,integer,jsonb,jsonb)', 'EXECUTE') as service_can_incremental,
    not has_function_privilege('service_role', 'public.begin_rating_rebuild(uuid,uuid)', 'EXECUTE')
      and not has_function_privilege('service_role', 'public.apply_rating_rebuild(uuid,bigint,jsonb,jsonb)', 'EXECUTE') as service_cannot_legacy,
    not has_function_privilege('anon', 'public.begin_incremental_rating_rebuild(uuid,uuid)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.begin_incremental_rating_rebuild(uuid,uuid)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.apply_incremental_rating_rebuild(uuid,bigint,integer,jsonb,jsonb)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.apply_incremental_rating_rebuild(uuid,bigint,integer,jsonb,jsonb)', 'EXECUTE') as clients_cannot_execute
)
select
  targets.incremental_begin_oid is not null and targets.incremental_apply_oid is not null as incremental_functions_exist,
  canonical_columns.compatible as canonical_columns_compatible,
  canonical_indexes.compatible as canonical_indexes_compatible,
  coalesce(position('gameId' in definitions.incremental_begin_body) > 0, false)
    and coalesce(position('gameNumber' in definitions.incremental_begin_body) > 0, false)
    and coalesce(position('winnerTeam' in definitions.incremental_begin_body) > 0, false) as incremental_history_compatible,
  coalesce(position('incremental_expected_facts' in definitions.incremental_apply_body) > 0, false)
    and coalesce(position('sequence > p_prefix_event_count' in definitions.incremental_apply_body) > 0, false) as incremental_apply_compatible,
  permissions.service_can_incremental,
  permissions.service_cannot_legacy,
  permissions.clients_cannot_execute,
  missing_or_mismatched.fact_count = 0 as every_active_game_participant_has_one_fact,
  extra_or_superseded.fact_count = 0 as no_superseded_or_extra_facts,
  sequence_gaps.group_count = 0 as group_sequences_are_contiguous,
  not exists (
    select 1 from public.rating_events
    where game_id is null or game_number is null or occurred_at is null
      or format is null or team is null or expected_score is null
      or actual_score is null or points_for is null or points_against is null
  ) as canonical_fields_are_populated,
  doubles_expectations.game_count = 0 as doubles_expectations_are_consistent,
  not exists (
    select 1 from public.groups
    where rating_applied_version <> rating_input_version
  ) as every_group_is_fresh
from targets
cross join definitions
cross join canonical_columns
cross join canonical_indexes
cross join missing_or_mismatched
cross join extra_or_superseded
cross join sequence_gaps
cross join doubles_expectations
cross join permissions;
