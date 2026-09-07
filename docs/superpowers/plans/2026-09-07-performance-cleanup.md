PLEASE IMPLEMENT THIS PLAN:
# Performance and Cleanup Implementation Plan

## 1. Goals and execution model

Improve database efficiency, initial loading, and large-history performance while preserving rating calculations, authorization, match recording, and existing analytics meanings.

**Confirmed decisions:** remove obsolete application code and nonfunctional controls; use bounded charts while preserving access to every exact match.

**Agent models:**

- Implementation agents A–E: **`gpt-5.6-sol` with `high` reasoning**.
- Review agents R1–R2: **`gpt-6-astra` with `low` reasoning**.
- A coordinator owns contracts, integration, shared configuration, and final verification.

Execute in isolated worktrees from the same contract checkpoint. Agents must not edit another agent’s assigned files. Reserve distinct migration filenames before dispatch. Run database and browser suites serially against the shared local environment; isolated unit tests and builds may run concurrently.

All agents must follow `AGENTS.md`, read relevant installed Next.js documentation, and follow `design.md` for UI changes. Migrate all styling in any touched Tailwind UI file to its colocated CSS Module. Do not modify `design.md`.

## 2. Preparation and shared contracts — coordinator

Before parallel implementation:

- Record baseline production bundle sizes, request counts, analytics payload sizes, and local query plans.
- Create deterministic local fixtures covering 100, 1,000, and 10,000 matches, singles/doubles, corrections, guests, multiple groups, and equal submission timestamps.
- Record old-versus-new analytics comparison fixtures with fixed timestamps.
- Publish the following contracts and ownership assignments. Each agent receives this plan, its contract, relevant project instructions, and its acceptance tests.

**Compatibility contracts**

- Keep the existing match-history HTTP parameters, 20-match page size, cursor semantics, authorization errors, and `MatchHistoryPage` response unchanged.
- Keep `syncActiveMatchDraft` input/result types and existing user-facing validation semantics.
- Introduce versioned database RPCs rather than replacing RPC signatures required by the previous application release.
- Preserve analytics period meanings, ranking rules, flags, relationship insights, rating confidence, consistency values, and version-readiness checks.

**Analytics contract**

The new ready model contains:

- Existing player, group, availability, and timestamp metadata.
- One deduplicated dictionary of chart points.
- Four period snapshots containing unchanged summaries, flags, and matchups, plus ordered chart-point IDs and the full-data chart bounds.
- No unbounded historical arrays in the initial browser payload.

Add an authenticated exact-history endpoint beneath the player analytics route. It accepts `period` and an optional cursor, returns up to 50 exact rating points and `nextCursor`, and uses descending `(occurredAt, matchId)` ordering. Bind cursors to group, player, period, fixed `asOf`, and rating version. Return `409` when the rating version changes; the client clears inspector pagination and refreshes analytics. Preserve private, non-cacheable responses.

## 3. Wave 1 — four Sol-high agents working in parallel

| Agent | Ownership | Deliverable |
|---|---|---|
| A: Database reads | Application data helpers, membership visibility, history RPC/adapters, associated tests | Bounded, consolidated membership and history reads |
| B: Analytics backend | Analytics SQL, policy/read-model types, exact-history API, associated tests | Aggregated analytics with bounded payloads |
| C: Autosave and validation | Draft command, recorder, shared match validation, associated tests | One database command per save and bounded save queue |
| D: Client loading | Analytics UI/chart/history disclosure, login UI, associated tests | Deferred hidden content, bounded chart rendering, deferred login SDK |

### Agent A — membership and match-history reads

- Replace application-side guest-participation traversal with authorized SQL reads using the existing `private.visible_group_memberships` semantics.
- Group listings return group metadata and SQL member counts without transferring every membership to the application.
- Group member/player reads return visible memberships, profiles, and ratings together. Share the result within a request using scalar group IDs as cache keys; eliminate duplicate membership reads from group metadata and player loading.
- Preserve guest visibility through historical revisions and active drafts, current membership restrictions, archived-group handling, and displayed ranking order.
- Introduce a history-bundle RPC that selects the cursor page first, then retrieves its related records in the same database call. Return the existing public history shape through the application adapter.
- Preserve rating information in the history response for compatibility. Do not introduce a second history-row type in this change.
- Group enrichment records by revision once in the TypeScript projection rather than repeatedly filtering full arrays.

**Acceptance:** one data RPC for each history page; no historical participation arrays fetched into JavaScript for membership visibility; no duplicate membership query on the members page; results remain correct beyond 1,000 participation records.

### Agent B — analytics aggregation and exact inspection

- Build an additive analytics RPC that reads canonical active-revision facts once per invocation.
- Aggregate cohort information in SQL per period and player: match counts, rating changes, doubles counts, and distinct partners.
- Return compact subject aggregates needed for existing flags and insights: wins/games/expectations, upset counts, residual moments, encountered players, relationship totals, and current streak. Calculate the streak once.
- Preserve existing rounding, thresholds, tie-breaking, timestamps, and current-rank semantics by comparing against the old policy implementation.
- Include historical consistency directly in the fact query, replacing the new path’s JSON-build/JSON-reparse enrichment.
- Return at most 200 chart points per period. Preserve every point when there are at most 200. Otherwise retain first and last points, partition interior points into 49 chronological buckets, and retain each bucket’s rating minimum/maximum and performance-envelope minimum/maximum. Deduplicate and sort with deterministic ties.
- Compute chart bounds from the complete series, not the sample. Deduplicate overlapping samples across periods in the returned model.
- Implement the exact-history endpoint and version-bound cursor contract. Query only the requested player and page for exact inspection.
- Keep calculations request-time and version guarded. Do not add a new background projection system or persistent analytics tables in this implementation.

**Acceptance:** summaries, flags, and insights match the reference fixtures; browser payload size does not grow with total match count; every historical match remains reachable through exact pagination; all new reads enforce viewer/subject/group authorization.

### Agent C — transactional autosave and recorder bundle

- Add an authenticated transactional draft RPC that derives the actor from the session.
- Perform active-membership, selected-player, draft-editability, expiration, and submitted-state checks inside the transaction.
- Lock existing drafts while checking and updating/deleting them. Retain current shared-edit semantics; do not introduce a new client conflict-resolution UI.
- Preserve blank-draft no-op behavior, blank-existing-draft deletion, expiry renewal, validation limits, and existing outcomes.
- Make the Server Action a validation/adapter layer around this single RPC.
- Replace the unbounded snapshot promise chain with **one in-flight save plus one replaceable pending snapshot**.
- Ensure navigation and submission flush the newest snapshot. Retain retryability after failures and prevent overlapping draft creation.
- Remove eager full-Zod loading from the recorder’s initial import graph. Keep synchronous lightweight completeness checks; dynamically load full submission validation on submit. Separate lightweight draft utilities from schema initialization.
- Keep full validation on the server and preserve error messages.

**Acceptance:** one database RPC per save; slow saves never accumulate an unbounded queue; final persisted content is the latest draft; no lost final save during navigation/submission; full validation remains effective.

### Agent D — analytics UI and login loading

- Remove the initial match-history fetch from the analytics page.
- Fetch and mount `MatchHistoryList` only when its disclosure opens. Retain successfully loaded state during subsequent close/reopen operations.
- Show loading, empty, failure, and retry states; abort obsolete requests when group/player changes or the component unmounts.
- Consume Agent B’s published analytics contract using fixtures while its backend is under construction.
- Render the bounded chart series, memoize chart-data transformation, reuse date formatters, and disable expensive large-series animation.
- Replace the unbounded inspector select with a paginated exact-match inspector. Display 50 options at a time with older/newer navigation, retaining exact rating, deviation, and consistency values. Fetch its first page on opening the inspector.
- On an inspector `409`, discard stale pages, refresh the analytics model, and tell the user the ratings changed.
- Keep Recharts for this iteration; do not add a chart-library replacement. Separate the ready chart module so updating/empty states do not require it.
- Dynamically import the Supabase browser client when a Google credential needs exchanging. Keep email login and Google nonce/session handling unchanged.

**Acceptance:** no match-history request before disclosure expansion; no exact-inspector request before opening it; at most 200 chart points and 50 inspector options mounted; email login does not eagerly load the Supabase client chunk; layouts remain usable at 390px and 430px.

## 4. Wave 2 — integration, cleanup, and independent review

The coordinator integrates A, B, C, and D in that order, resolves contract mismatches, then creates one stable checkpoint.

Run the following agents concurrently:

**Agent E — cleanup, Sol-high**

- Remove `class-variance-authority`; coordinator applies the dependency and lockfile edit.
- Remove the confirmed unused profile/history helpers, superseded draft-save wrapper, unused OTP verification action, leave-group action, and retry action after checking the integrated call graph.
- Remove tests solely exercising deleted compatibility wrappers; retain behavioral coverage through active entrypoints.
- Remove unused `canRetry` application props/state. Retain database response compatibility.
- Remove the nonfunctional rankings search and singles/doubles controls.
- Preserve active correction/revision actions, demo authentication, maintenance/recovery workflow, calibration/backfill scripts, historical migrations, Tailwind dependencies, and working features.

**Agent R1 — read-only correctness review, Astra-low**

Review A–D for authorization regressions, canonical rating consistency, pagination boundaries, autosave races, and contract mismatches. Report findings without modifying files; send fixes back to their owning Sol-high agents.

After cleanup and fixes are integrated, use **Agent R2 — Astra-low** for a final independent performance and UI review. Do not have review agents test against the same database/browser instance concurrently.

Each implementation handoff must include its commit, owned files changed, interface changes, tests/results, query or bundle evidence, and any unresolved issue. Unresolved acceptance failures prevent integration.

## 5. Verification and rollout

Run focused tests during each workstream, then run the integrated checks:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:db`
- `npm run build`
- `npm run test:e2e`

**Required scenarios**

- Anonymous/nonmember access, departed memberships, archived groups, cross-group IDs, and guest visibility.
- Empty history, equal timestamps, page boundaries, filters, corrections, and histories beyond default database response limits.
- Analytics period boundaries, all existing flags, relationship ties, missing consistency coverage, updating versions, and exact-inspector version changes.
- Rapid editing with slow/failing saves, shared drafts, deletion, expiry, navigation flushing, and submission while saving.
- Collapsed-history loading/retry, group switching, keyboard inspection, mobile layout, email login, and Google login.

**Performance evidence**

Compare baseline and final production builds using the same methodology. Report route chunks, initial analytics payload size, database request counts, and query execution/buffer statistics for all fixture sizes. Treat structural budgets—one history RPC, one autosave RPC, bounded payload/chart/inspector—as hard gates. Report measured timing changes without inventing percentage guarantees.

Deploy additive migrations before the application release. Keep previous RPCs available for application rollback; remove obsolete database interfaces only in a later compatibility cleanup. Verify the deployed flows and inspect error rates and latency after release.

**Defaults:** no rating-algorithm changes, no new user features, no framework upgrades, no speculative caching, and no additional production dependencies.