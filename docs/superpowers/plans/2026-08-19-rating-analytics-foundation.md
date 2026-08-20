# Rating Analytics Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn incremental rating replay into a versioned, revision-safe source of canonical player-game facts, player-match facts, and compact analytics rollups.

**Architecture:** Enrich the existing `rating_events` suffix in the TypeScript Glicko replay, then derive match facts and UTC-day rollups atomically in the version-guarded database apply RPC. Keep `group_rating_states` as the current snapshot, preserve legacy rating RPCs for rollback, and use `groups.analytics_applied_version` to prevent stale analytics reads.

**Tech Stack:** Next.js 16.2.9, TypeScript, Vitest, Workflow DevKit, Supabase Postgres 15, pgTAP, Chrome Supabase SQL Editor

**Spec:** `docs/superpowers/specs/2026-08-19-rating-analytics-foundation-design.md`

## Global Constraints

- Preserve match order `(submitted_at, id)` and selected `winnerTeam` semantics.
- Preserve the 30-day revision command as the only lockout authority; locked successors still replay after an earlier change.
- Do not add analytics UI, client routes, production fixtures, or a second queue.
- Keep legacy full-history RPC signatures callable; a legacy apply marks analytics stale instead of inventing missing facts.
- Deploy production SQL through authenticated Chrome without updating migration history; every new migration must therefore be safely rerunnable.
- Do not modify `design.md`; this plan has no UI impact.

---

### Task 1: Reconcile the Deployed Incremental Rebuild

**Files:**
- Create: `supabase/migrations/20260819120000_reconcile_incremental_rating_rebuilds.sql`
- Modify: `supabase/audit/rating_rebuild_contract.sql`
- Modify: `src/lib/ratings/glicko2.ts`
- Modify: `src/lib/ratings/glicko2.test.ts`
- Modify: `src/workflows/rebuild-group-ratings.ts`
- Modify: `src/workflows/rebuild-group-ratings.test.ts`
- Test: `supabase/tests/database/incremental_rating_rebuilds.test.sql`

**Interfaces:**
- Produces: `begin_incremental_rating_rebuild(uuid,uuid) -> jsonb`
- Produces: `apply_incremental_rating_rebuild(uuid,bigint,integer,jsonb,jsonb) -> jsonb`
- Produces: `rebuildGroupRatingsFromMatches(matches, initialRatings?, sequenceOffset?)`

- [ ] Copy the verified production incremental definitions into an idempotent migration: use `add column if not exists`, `create index if not exists`, guarded constraint creation, and `create or replace function`; revoke client execution and grant only `service_role` for worker RPCs.
- [ ] Port the existing seeded-suffix changes from `.worktrees/incremental-rating-rebuilds` rather than rewriting them, preserving validation of `initialRatings`, `prefixEventCount`, stale reloads, nested failure-message extraction, and retry behavior.
- [ ] Add pgTAP cases for earliest boundary coalescing, absorbing null boundaries, append-only one-match loads, earlier revision suffixes, locked successors, invalid-prefix full fallback, prefix-preserving apply, stale atomic rejection, and service-only execution.
- [ ] Run `npm test -- --run src/lib/ratings/glicko2.test.ts src/workflows/rebuild-group-ratings.test.ts` and `npm run test:db`; require all new tests to pass before continuing.
- [ ] Commit only the reconciliation, calculator, workflow, audit, and test files with `git commit -m "feat: reconcile incremental rating rebuilds"`.

### Task 2: Repair Group Authorization Before Analytics Exposure

**Files:**
- Create: `supabase/migrations/20260819130000_harden_group_scoped_rls.sql`
- Modify: `supabase/tests/database/membership_and_profile_authorization.test.sql`
- Modify: `supabase/tests/database/navigation_read_models.test.sql`

**Interfaces:**
- Produces: `private.is_active_group_member(uuid) -> boolean`, stable security definer
- Preserves: existing authenticated read-model RPC signatures

- [ ] Add failing pgTAP tests proving a member of group A cannot directly select matches, rating events, rating states, invites, memberships, or rebuild jobs from group B, and that a legitimate group member can read group A.
- [ ] Define `private.is_active_group_member(p_group_id uuid)` with fully qualified aliases and an empty search path. Revoke execution from public/anon, grant execution to authenticated for RLS evaluation, and use it in corrected policies. Replace every `gm.group_id = gm.group_id` and `gm.group_id = gm.id` policy expression in scope.
- [ ] Keep existing security-definer navigation RPC membership checks and grants unchanged; do not broaden direct write privileges.
- [ ] Run `npm run test:db` and require the existing navigation isolation test and new cross-group tests to pass.
- [ ] Commit the RLS migration and authorization tests with `git commit -m "fix: enforce group-scoped database reads"`.

### Task 3: Emit Canonical Player-Game Facts at Full Engine Precision

**Files:**
- Modify: `src/lib/ratings/glicko2.ts`
- Modify: `src/lib/ratings/glicko2.test.ts`
- Modify: `src/lib/ratings/projection.ts`
- Modify: `src/lib/ratings/projection.test.ts`
- Modify: `src/workflows/rebuild-group-ratings.test.ts`

**Interfaces:**
- Extends `HistoricalMatch.games[]` with `gameId: string` and `gameNumber: number`
- Extends `RatingEvent` with `gameId`, `gameNumber`, `occurredAt`, `format`, `team`, `expectedScore`, `actualScore`, `pointsFor`, and `pointsAgainst`
- Preserves `RatingEvent.before`, `after`, `matchId`, `revisionId`, `userId`, and global `sequence`

- [ ] Write failing singles tests asserting complementary expectations, selected-winner actual scores, score-perspective points, game identity, match time/format/team metadata, and continued sequence offsets.
- [ ] Write failing doubles tests asserting one team expectation is shared by both partners, opposing expectations sum to one within `1e-9`, and each player receives correctly oriented points.
- [ ] Refactor the calculator so the same expectation value drives both the Glicko update and emitted fact. Do not duplicate the expectation formula in a projection helper or SQL.
- [ ] Add equivalence tests comparing complete enriched event arrays for full replay versus a seeded suffix with prefix-only and newly introduced players.
- [ ] Run the focused rating and workflow tests; require exact six-decimal rating/RD and eight-decimal volatility equality after seed serialization.
- [ ] Commit the enriched event contract and tests with `git commit -m "feat: emit rating analytics facts"`.

### Task 4: Add the Analytics Schema in an Expand Migration

**Files:**
- Create: `supabase/migrations/20260819140000_expand_rating_analytics.sql`
- Create: `supabase/tests/database/rating_analytics.test.sql`
- Modify: `supabase/audit/rating_rebuild_contract.sql`

**Interfaces:**
- Adds nullable `groups.analytics_applied_version bigint` and `analytics_updated_at timestamptz`
- Adds player-game fields to `rating_events`
- Creates `player_match_facts`, `player_daily_stats`, `player_relationship_daily_stats`, and `group_daily_stats`

- [ ] Widen `group_rating_states.rating`, `group_rating_states.rd`, `rating_events.before_rating`, `before_rd`, `after_rating`, and `after_rd` to `numeric(12,6)` without rounding existing values.
- [ ] Add nullable event columns `game_id uuid references match_games(id) on delete cascade`, `game_number integer`, `occurred_at timestamptz`, `format match_format`, `team team_code`, `expected_score numeric(10,9)`, `actual_score smallint`, `points_for integer`, and `points_against integer`. Add stored generated `rating_delta`, `expectation_residual`, and `point_delta` after the backfill-compatible base columns.
- [ ] Add guarded scalar checks for expectation/actual-score ranges, nonnegative points, and `after_games_played = before_games_played + 1`; game/revision/participant ownership is transactionally validated in Task 5. Replace the old unique constraint with unique `(group_id, sequence)` and add unique `(group_id, game_id, user_id)`.
- [ ] Add covering indexes for `(group_id,user_id,sequence desc)`, `(group_id,occurred_at,match_id,game_number,user_id)`, and `(group_id,game_id,team,user_id)`; remove only indexes proven redundant by `pg_indexes` comparison.
- [ ] Create `player_match_facts` with primary key `(group_id,match_id,user_id)` and columns `revision_id`, `occurred_at`, `format`, `team`, `match_won`, `game_count`, `game_wins`, `points_for`, `points_against`, `expected_game_wins numeric(12,9)`, `first_game_won`, `last_game_won`, before/after rating, RD, volatility, games played, and generated `rating_delta`.
- [ ] Create `player_daily_stats` with primary key `(group_id,user_id,stat_date,format)` and columns for match/game counts and wins, points for/against, expected game wins, rating delta, opening/closing/min/max rating, and closing RD, volatility, and games played.
- [ ] Create directional `player_relationship_daily_stats` with primary key `(group_id,user_id,related_user_id,relationship_kind,stat_date,format)`, a check limiting kind to `opponent|teammate`, match/game counts and wins, points, expected game wins, player rating delta, and first/last occurrence time.
- [ ] Create `group_daily_stats` with primary key `(group_id,stat_date)` and match/game counts, singles/doubles match and game counts, active-player count, total points, total absolute point differential, upset-game count, and even-expectation game count.
- [ ] Enable RLS on all new tables, revoke access from public/anon/authenticated, and grant DML only to `service_role`; no client select policy is added.
- [ ] Add catalog pgTAP tests for types, generated expressions, keys, checks, indexes, RLS, and grants, then run `npm run test:db`.
- [ ] Commit the additive schema and catalog tests with `git commit -m "feat: add rating analytics schema"`.

### Task 5: Make Incremental Apply Maintain Facts and Rollups Atomically

**Files:**
- Create: `supabase/migrations/20260819143000_project_rating_analytics.sql`
- Modify: `supabase/tests/database/rating_analytics.test.sql`
- Modify: `supabase/tests/database/incremental_rating_rebuilds.test.sql`

**Interfaces:**
- Produces private `refresh_rating_analytics_suffix(uuid,timestamptz) -> void`
- Extends incremental begin history games with `gameId` and `gameNumber`
- Keeps the public incremental apply signature unchanged

- [ ] Extend both begin loaders to return game ID and game number while retaining `winnerTeam`, scores, format, submitted time, and deterministic ordering.
- [ ] Make incremental prefix validation require non-null canonical fact fields and a unique active game/user mapping whenever `analytics_applied_version = rating_applied_version`; otherwise atomically fall back to prefix zero.
- [ ] In apply, validate every event’s group, active revision, game, game number, team, participant, format, submitted time, score perspective, expectation range, actual score, and sequence before deleting derived state.
- [ ] Capture the earliest UTC date touched by the old or new suffix. Replace rating events and player-match facts for the dirty suffix, then delete and rebuild all three daily rollups from that date using canonical events, including preserved prefix events on the same date.
- [ ] Build player-match facts with selected-winner match W/L, game/point totals, expected game wins, first/last game result, and first/last rating state. Build directional teammate/opponent daily rows by self-joining the maximum four events per game.
- [ ] Set `analytics_applied_version` and `analytics_updated_at` only in the same transaction that sets `rating_applied_version`. On stale input, change neither ratings nor analytics.
- [ ] Update legacy `apply_rating_rebuild` to clear the group’s analytics tables and set `analytics_applied_version = null` while preserving its rating behavior and signature.
- [ ] Add pgTAP scenarios for one-match append, same-day boundary replay, a 30-day revision suffix, locked successor inclusion, full fallback, stale rejection, legacy stale marking, and rollback after a forced SQL exception.
- [ ] Run `npm run test:db` and commit the projection migration and database tests with `git commit -m "feat: project rating analytics incrementally"`.

### Task 6: Wire the Enriched Worker Contract

**Files:**
- Modify: `src/workflows/rebuild-group-ratings.ts`
- Modify: `src/workflows/rebuild-group-ratings.test.ts`
- Modify: `supabase/audit/rating_rebuild_contract.sql`

**Interfaces:**
- `RebuildInput.history[].games[]` consumes `gameId`/`gameNumber` from the incremental begin RPC
- `applyProjection` continues sending `p_job_id`, `p_expected_version`, `p_prefix_event_count`, `p_ratings`, and enriched `p_events`

- [ ] Add failing workflow contract tests that validate game IDs/numbers and all emitted analytics fields, and reject duplicate game/user identities, nonfinite expectations, invalid teams, or score perspectives as `FatalError`.
- [ ] Preserve transient RPC retries, stale-loop reload, dispatch leasing, and nested leaf-error extraction unchanged.
- [ ] Extend the read-only audit to assert precision, fields, generated columns, unique indexes, rollup tables, function payload strings, service-only grants, RLS policy definitions, and the `winnerTeam` contract.
- [ ] Run `npm test`, `npm run typecheck`, and `npm run lint`.
- [ ] Commit the workflow and audit contract with `git commit -m "feat: send enriched rating events"`.

### Task 7: Backfill, Contract, and Verify Production Through Chrome

**Files:**
- Create: `supabase/migrations/20260819150000_contract_rating_analytics.sql`
- Modify: `supabase/tests/database/rating_analytics.test.sql`
- Modify: `supabase/audit/rating_rebuild_contract.sql`

**Interfaces:**
- No new client interface
- Production deployment queries: `reconcile_incremental_rating_rebuilds_20260819`, `expand_rating_analytics_20260819`, and `contract_rating_analytics_20260819`

- [ ] In Chrome, run a read-only preflight asserting migration history still ends at `20260813120000`, current function signatures, and current row counts. Wait for active rating jobs to reach zero, then record the live group/match/game/event counts as the backfill baseline; do not create fixtures or edit match data.
- [ ] Run the idempotent reconciliation and RLS migrations in transaction-wrapped saved queries, then rerun authorization and incremental audits.
- [ ] Run the expand migration before deploying the enriched worker. Verify old worker RPCs remain callable and the new columns are nullable during compatibility rollout.
- [ ] After the worker deploy, enqueue `enqueue_rating_rebuild(group_id, null, null)` once for each group captured by the preflight and let the existing maintenance dispatcher claim the jobs. Require one completed full-rebuild job per captured group and compare facts against the preflight’s live match/game counts rather than hard-coded counts.
- [ ] Run a read-only backfill audit requiring zero stale rating groups, zero stale analytics groups, zero unenriched active events, exact game/participant cardinality, contiguous sequences, and rollup totals matching canonical facts.
- [ ] Run the contract migration to add and validate an all-or-none check: the canonical analytics base fields are either all null for a legacy rating-only event or all non-null for an enriched event. Keep the columns and `analytics_applied_version` nullable so the legacy rollback RPC remains callable.
- [ ] Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:db`. Require all commands to pass, including the previously failing navigation isolation test.
- [ ] Leave Chrome selected on `contract_rating_analytics_20260819` with the final all-true audit result. Do not update `supabase_migrations.schema_migrations`; rerun safety is provided by the idempotent SQL.
- [ ] Commit the contract migration and final audit/test updates with `git commit -m "chore: contract rating analytics data"` before any optional push or pull request.

## Deferred Cleanup

After analytics ships, create a separate compatibility plan for `rating_rebuild_jobs.cursor_match_id`, `match_revisions.status`, and `match_revisions.reason`. Production currently contains zero cursor values, only `active` statuses, and only empty reasons, but dropping them is not required for analytics and should not share this rollout.
