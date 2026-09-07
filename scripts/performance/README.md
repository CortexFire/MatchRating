# Reproducing the performance checks

Run commands from the application checkout. Generated reports and optional tooling stay in ignored `output/`; nothing connects to a remote database.

## Production bundles

Run `npm run build`, then `node scripts/performance/bundle-report.mjs > output/performance/bundles.json` (create the output directory first).

The report sums unique client-reference JavaScript chunks for each route, both raw and gzip. It excludes shared framework runtime, CSS, RSC data, and deferred chunks absent from the manifest. Compare before and after using this same method; these figures are not total network transfer or precise per-package sizes.

## Supplementary database tests

The normal database gate is `npm run test:db` against local Supabase/PostgreSQL 15. When that stack is unavailable, an optional PostgreSQL/WASM harness can execute the migrations and pgTAP suites in memory:

```sh
npm install --prefix output/performance-tools --no-save --package-lock=false --ignore-scripts @electric-sql/pglite@0.5.8 @electric-sql/pglite-pgtap
node scripts/performance/db-harness.mjs
```

This uses PostgreSQL 18, minimal Supabase roles and auth functions, and an `auth.users` table sufficient for the repository's login-activity SQL tests. It does not test Supabase Auth, PostgREST, HTTP behavior, or concurrent database sessions and does not replace the normal Supabase/E2E release gates. The harness reports TAP failures and migration errors with a nonzero exit code.

## Scale fixtures and reference analytics

```sh
node scripts/performance/run-typescript.cjs scripts/performance/database-report.ts baseline
```

Optionally append one size (`100`, `1000`, or `10000`). Each size uses a new in-memory database and a rolled-back transaction. The fixtures use fixed IDs/timestamps, actual rating/consistency calculations, mixed singles/doubles, shared groups, guests, revisions, and tied timestamps. The original SQL analytics payload and frozen pre-optimization TypeScript projection are saved for parity comparisons. Full SQL `EXPLAIN (ANALYZE, BUFFERS)` output is included; synthetic WASM timings must not be presented as production latency.

The reference policy is deliberately frozen at commit `f5cb6b9` and must never be imported by application code. Keep it independent of production changes so comparisons can detect semantic drift.

The benchmark fixes `statement_timestamp()` only inside its disposable database transaction. New baselines use the fixture clock; comparisons replay the exact `asOf` saved with each baseline. This prevents a long run from moving a period boundary between measurements. Production migrations are not rewritten, and normal pgTAP runs use the real clock.

After implementation, run `node scripts/performance/run-typescript.cjs scripts/performance/database-compare.ts .` (optionally append a size). This reuses the saved baseline facts, checks summaries/flags/matchups and sampled values against the frozen policy, verifies full-series bounds, walks every exact-history page in all four periods, enforces payload/sample/page budgets, and records optimized SQL plans. Passing another checkout instead of `.` lets the coordinator verify an isolated agent's migration before integrating it.
