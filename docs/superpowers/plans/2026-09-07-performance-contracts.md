# Performance implementation contracts

Authority: 2026-09-07-performance-cleanup.md (approved user plan).

## Ownership
- A: src/lib/app-data.ts, src/lib/group-membership-visibility.ts, src/lib/matches/read-model.ts and their tests; new membership/history SQL and database tests. Migration 20260907120000_performance_reads.sql. Do not edit actions or analytics.
- B: src/lib/analytics/*, analytics exact-history route, analytics SQL/tests. Migration 20260907121000_performance_analytics.sql. Do not edit analytics components/page or E2E tests.
- C: src/app/actions.ts and action tests; src/components/match/match-recorder*; src/lib/matches/drafts*, validation*, new lightweight utilities; draft SQL/tests. Migration 20260907122000_transactional_draft_sync.sql. Do not edit app-data or analytics.
- D: src/components/analytics/*, analytics page/page test, login form and tests/CSS; new deferred-history wrapper; analytics E2E tests. Do not edit lib/analytics or actions. Keep shared MatchHistoryList interface unchanged by wrapping it.
- Coordinator: package/lockfile, performance scripts/fixtures/report, shared configuration, integration.
- E: cleanup only after A-D integration. R1/R2: read-only reviewers.

## Analytics frontend contract (B produces; D consumes)
Export AnalyticsRatingPoint with fields matchId:string, occurredAt:string, rating:number, rd:number, performanceSd:number, ratingDelta:number from analytics-policy.ts.
Keep AnalyticsPeriod = 'all'|'30d'|'90d'|'1y'.
Export AnalyticsPeriodSnapshot with summary, flags, matchups unchanged; replace ratingHistory with ratingHistoryPointIds:string[] and ratingHistoryBounds:[number,number] (already padded by 20, [0,1] for empty).
PlayerAnalyticsViewModel keeps existing discriminated status/base metadata. Ready variant has ratingVersion:string, historyPoints:Record<string,AnalyticsRatingPoint> keyed by matchId and periods:Record<AnalyticsPeriod,AnalyticsPeriodSnapshot>.
Updating variant retains current metadata and status; no history required.
If legacy analytics policy tests need the full-array oracle, retain a separately named legacy type/projector as test reference; production read model must consume bounded v2 model.

Endpoint: GET /api/groups/[groupId]/players/[playerId]/analytics/history?period=all|30d|90d|1y&cursor=...
Initial request may also include asOf and ratingVersion from model; D MUST send them so a changed snapshot returns 409 immediately. Endpoint validates timestamp and version, enforces visibility, and does not trust cursor identity. B may implement initial snapshot guards as optional parameters for other callers.
Success shape: {points:AnalyticsRatingPoint[],nextCursor:string|null,asOf:string,ratingVersion:string}.
50 points max, newest first, descending (occurredAt,matchId). Canonical encoded cursor binds group/player/period/asOf/version/last tuple. Cache-Control private,no-store. 400 malformed, 401 unauthenticated, 403 inaccessible, 409 changed version, 500 generic failure.
D displays latest chart point by default; a disclosure opens exact inspector with at most 50 options and older/newer controls using a page stack. Abort obsolete requests; 409 clears pages and router.refresh with user message.
No initial match-history fetch; deferred wrapper fetches existing /api/matches/history with groupId/playerId on first disclosure opening, caches successful page while mounted, then mounts unchanged MatchHistoryList.

## Sampling
Sort full period points ascending (occurredAt,matchId). <=200: all. Otherwise preserve first/last and split interior points into 49 equal-count chronological buckets using floor(index*49/interiorCount). From each retain min/max rating and min(rating-performanceSd)/max(rating+performanceSd), with earliest tuple on ties. Deduplicate and sort. Bounds use full series envelope +/-20. Samples across periods share historyPoints dictionary.

## Validation and runtime
All implementations use additive authenticated RPCs with explicit identity/membership checks, empty search_path for definer functions, and grants excluding public/anon. Preserve existing RPCs for rollback. Never apply to remote database while testing.
Unit tests run in agent worktree, using ancestor node_modules binaries if available. Do not run database/browser suites or install packages without coordinating: shared database/browser is coordinator-owned. Tell coordinator if dependencies cannot resolve. Do not edit package.json, lockfile or next.config.ts.
Commit only owned files and report SHA, tests, behavior and unresolved risks. No extra subagents. User explicitly authorized implementation; proceed without repeated design approval.
