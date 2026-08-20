# Rating Analytics Foundation Design

## Goal

Make the existing rating replay produce the canonical facts needed for player, opponent, teammate, score-pattern, activity, and group analytics without adding a second event pipeline or precomputing product labels whose definitions may change.

No analytics UI or client-facing route is included. Future analytics reads must use service-backed RPCs and may only return data when the analytics projection version matches the applied rating version.

## Production Baseline

The production project has 3 groups, 13 matches, 15 games, 52 rating events, and 21 current rating states. It is internally consistent: no stale groups, inactive-revision events, missing games-played values, or duplicate event sequences were found.

Production is ahead of the repository. It has `before_games_played`, `after_games_played`, the incremental begin/apply RPCs, and the two incremental indexes, while `supabase_migrations.schema_migrations` still ends at `20260813120000_consolidate_navigation_read_models`. The application changes that call the incremental RPCs remain uncommitted in the `incremental-rating-rebuilds` worktree.

The audit also confirmed three prerequisites:

- The engine rounds rating and RD to six decimals, but both rating tables store four decimals.
- Several direct-table RLS policies contain uncorrelated predicates such as `gm.group_id = gm.group_id`; the groups policy compares `gm.group_id = gm.id`.
- The incremental loader returns neither `gameId` nor `gameNumber`, so events cannot currently identify their source game.

## Architecture

### Canonical player-game facts

`rating_events` remains the derived trajectory and becomes the canonical player-game fact. Add:

- `game_id`, `game_number`, `occurred_at`, `format`, and `team`
- `expected_score` and `actual_score`, where actual score follows the selected `winnerTeam`
- `points_for` and `points_against`, which preserve the submitted score even when it conflicts with `winnerTeam`
- stored generated `rating_delta`, `expectation_residual`, and `point_delta`

Keep the existing before/after rating, RD, volatility, and games-played values. Widen rating and RD columns in both rating tables to `numeric(12,6)`. Replace the weak event uniqueness constraint with unique `(group_id, sequence)` and add unique `(group_id, game_id, user_id)`.

The Glicko calculator must emit the expectation used for the update rather than reimplementing that formula in SQL. For doubles, both players on a team receive the same team expectation. Full replay and seeded suffix replay must produce byte-for-byte equivalent enriched events at database precision.

### Player-match facts and compact rollups

Add `player_match_facts`, one row per group/match/player. It stores match result, game and point totals, expected game wins, first/last-game result, and the player’s rating-state bounds across the match. Comebacks, straight wins, deciding-game results, and streaks remain deterministic queries over this table.

Its exact data columns are `occurred_at`, `format`, `team`, `match_won`, `game_count`, `game_wins`, `points_for`, `points_against`, `expected_game_wins`, `first_game_won`, `last_game_won`, before/after rating, RD, volatility, and games played, plus a generated rating delta. Its primary key is `(group_id, match_id, user_id)`; `revision_id` identifies the active source revision.

Add three UTC-day rollups:

- `player_daily_stats`, keyed by group, player, date, and format
- `player_relationship_daily_stats`, keyed by group, player, related player, relationship kind, date, and format
- `group_daily_stats`, keyed by group and date

`player_daily_stats` stores match/game counts and wins, points for/against, expected game wins, rating delta, opening/closing/min/max rating, and closing RD, volatility, and games played. `player_relationship_daily_stats` adds `related_user_id` and `relationship_kind` (`opponent` or `teammate`) and stores the same additive result, expectation, point, and rating-movement measures from the player’s perspective. `group_daily_stats` stores match/game counts, singles/doubles splits, active-player count, total points, total absolute point differential, upset-game count, and even-expectation game count.

Relationship rows are directional. That uses a few more rows but makes player/opponent and player/teammate reads index-local and preserves player-specific expectation and rating change. The rollups store additive counts, wins, expected wins, points, rating movement, and opening/closing or min/max states. Rank snapshots, awards, chemistry labels, confidence labels, clique membership, and teammate recommendations are not persisted.

UTC is the canonical rollup boundary because groups do not currently have a timezone. Raw `occurred_at` values remain available so a later read API can re-bucket into a chosen group or viewer timezone.

### Dirty-suffix maintenance

The incremental worker adds game identity and analytics fields to each suffix event. `apply_incremental_rating_rebuild` performs one version-guarded transaction that:

1. validates the prefix and input version;
2. replaces suffix rating events and current rating states;
3. replaces affected player-match facts;
4. deletes daily rollups from the earliest affected UTC date;
5. rebuilds those dates from canonical events, including preserved prefix events on the boundary date; and
6. advances both rating and analytics applied versions.

This makes an appended match rebuild one match and usually one day. A revision rebuilds its dirty suffix, including locked successors whose incoming ratings changed. Full history is still used for guest identity rewrites or an invalid prefix.

Add nullable `groups.analytics_applied_version`. Future analytics reads require it to equal `rating_applied_version`. The legacy full-apply RPC remains callable for rollback, but it clears analytics rollups and sets `analytics_applied_version` to null because old workers do not emit trustworthy analytics facts.

### Authorization and source of truth

Add an idempotent reconciliation migration containing the deployed incremental schema/RPC definitions so local resets reproduce production. All later analytics migrations are also idempotent because production deployment will continue through Chrome SQL Editor without updating Supabase migration history.

Repair the affected legacy RLS policies with a qualified security-definer active-membership helper before adding analytics reads. New fact and rollup tables grant no direct access to `anon` or `authenticated`; only service-role rebuild functions write them. Future user-facing analytics must be exposed through membership-checking security-definer RPCs.

Do not drop `cursor_match_id`, `match_revisions.status`, `match_revisions.reason`, or stored current rank in this change. Production confirms the first three are unused, but removing them is a separate cleanup with its own compatibility audit.

## Rollout

Use expand/backfill/contract sequencing:

1. Land the idempotent incremental reconciliation and app’s pending seeded-suffix work.
2. Apply the RLS repair and additive analytics expansion in Chrome; new event fields remain nullable for legacy-worker compatibility.
3. Deploy the enriched worker, enqueue a full rebuild for each group, and let normal dispatch process the jobs.
4. Verify every group has `analytics_applied_version = rating_applied_version` and every active event is enriched.
5. Apply the all-or-none analytics-field constraint and final audits in Chrome. The canonical fields remain nullable as a set so the legacy rollback RPC can still write rating-only events. Leave the saved deployment query selected as the record.

If the enriched worker is rolled back, legacy full rebuilds continue to maintain ratings but explicitly make analytics unavailable until an enriched rebuild succeeds.

## Acceptance Criteria

- Full replay and seeded dirty-suffix replay yield identical ratings and enriched event facts.
- New matches replay only themselves; revisions replay themselves and all successors.
- Rating, match facts, rollups, and projection versions change atomically or not at all.
- All requested analytics categories can be computed from canonical facts and compact rollups without replaying Glicko at read time.
- Cross-group direct-table reads are denied by corrected RLS policies.
- Repository database resets reproduce production’s incremental and analytics contracts.
- `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:db` pass.
