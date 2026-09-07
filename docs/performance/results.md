# Performance and cleanup verification

## Method

Baseline: `f5cb6b9`. Fixtures contain 100, 1,000, and 10,000 matches with fixed IDs/timestamps, mixed singles/doubles, guests, multiple groups, corrections, and tied timestamps. Rating and consistency events use the application's actual calculation code. See `scripts/performance/README.md` for commands and limitations.

SQL timings are single synthetic measurements under PGlite PostgreSQL 18/WASM, not production latency or a statistical benchmark. The deployed project's PostgreSQL 15/Supabase stack still requires verification. Initial model sizes are UTF-8 JSON bytes, excluding HTML/RSC framing and compression.

## Analytics measurements

| Matches | Baseline SQL | Optimized SQL | Baseline initial JSON | Optimized initial JSON |
|---:|---:|---:|---:|---:|
| 100 | 55.7 ms | 34.3 ms | 41,917 B | 35,259 B |
| 1,000 | 1,938.0 ms | 120.7 ms | 358,013 B | 87,053 B |
| 10,000 | 175,489.5 ms | 1,059.9 ms | 3,512,501 B | 128,441 B |

The bounded model has at most 200 points per period and one deduplicated point dictionary. Payload sizes vary with sampled values and overlap before reaching the bound; they no longer contain arrays proportional to total match history. Group/player metadata and relationship aggregates still depend on group size.

The independent comparator passes at all three sizes for all four periods: exact summaries, flags, matchups, sampled values, full-series chart bounds, and every point returned once through 50-point exact-history pagination. This comparison caught and corrected an expectation-formula regression before integration.

## Release gates

Verification is still in progress. The normal Supabase database gate is blocked by unavailable local infrastructure and a declined permission for the CLI's telemetry write outside the workspace. The browser suite also found port 3000 already occupied; its standalone startup check confirms local Supabase is unavailable. The existing server was left untouched.

The supplementary harness executes actual migrations and pgTAP SQL with minimal auth/role scaffolding. It does not validate PostgREST, real Supabase sessions, concurrent transactions, or browser behavior. Do not treat those local results as approval to deploy.

Deploy additive migrations before the application. Retain previous RPCs for rollback. Before release, run `npm run test:db` and `npm run test:e2e` on local Supabase, verify the documented authorization, correction, autosave, inspector-version, and mobile scenarios, then inspect deployed errors and latency.
