# Performance and cleanup verification

## Method

Baseline: `f5cb6b9`. Fixtures contain 100, 1,000, and 10,000 matches with fixed IDs/timestamps, mixed singles/doubles, guests, multiple groups, corrections, and tied timestamps. Rating and consistency events use the application's actual calculation code. Each optimized comparison replays its saved baseline `asOf`; those clocks are recorded in both database reports. See `scripts/performance/README.md` for commands and limitations.

SQL timings are single synthetic measurements under PGlite PostgreSQL 18/WASM, not production latency or a statistical benchmark. The deployed project's PostgreSQL 15/Supabase stack still requires verification. Initial model sizes are UTF-8 JSON bytes, excluding HTML/RSC framing and compression.

## Analytics measurements

| Matches | Baseline SQL | Optimized SQL | Baseline initial JSON | Optimized initial JSON |
|---:|---:|---:|---:|---:|
| 100 | 55.7 ms | 34.2 ms | 41,917 B | 35,259 B |
| 1,000 | 1,938.0 ms | 119.9 ms | 358,013 B | 87,053 B |
| 10,000 | 175,489.5 ms | 1,045.1 ms | 3,512,501 B | 129,585 B |

The bounded model has at most 200 points per period and one deduplicated point dictionary. Payload sizes vary with sampled values and overlap before reaching the bound; they no longer contain arrays proportional to total match history. Group/player metadata and relationship aggregates still depend on group size.

The independent comparator passes at all three sizes for all four periods: exact summaries, flags, matchups, sampled values, full-series chart bounds, and every point returned once through 50-point exact-history pagination. This comparison caught and corrected an expectation-formula regression before integration.

## Request structure

Counts below are derived from the original call graph and enforced by focused adapter/component tests, not a live network trace. Authentication/session traffic and separate status polling are excluded.

| Operation | Baseline data calls | New data calls |
|---|---:|---:|
| Nonempty history page | 8 (page RPC + 7 enrichment queries) | 1 bundle RPC |
| Create nonblank draft | 3 | 1 transactional RPC |
| Update editable draft | 4 | 1 transactional RPC |
| Delete blank existing draft | 3 | 1 transactional RPC |
| Analytics history before disclosure opens | 1 history load | 0 |
| Exact inspector before it opens | Embedded full history | 0 requests, bounded chart data only |

Membership visibility is resolved in SQL; historical participation arrays no longer cross into JavaScript. Group metadata and player loading share the same request-cached membership snapshot. The recorder retains at most one in-flight save plus one replaceable pending snapshot.

## Production route chunks

Unique JavaScript client-reference chunks, gzip bytes; excludes framework runtime, CSS, RSC framing, and deferred chunks absent from the manifest. Raw and per-chunk sizes are in `baseline-bundles.json` and `optimized-bundles.json`.

| Route | Baseline gzip | Optimized gzip |
|---|---:|---:|
| Home | 11,800 B | 11,809 B |
| Group | 12,534 B | 12,719 B |
| Recorder | 95,671 B | 31,070 B |
| Analytics shell | 138,162 B | 33,327 B |
| Login | 88,589 B | 25,104 B |

A ready analytics view still downloads the deferred Recharts chunk. These shell figures are not a total-transfer claim. Full recorder validation loads on submit; the Supabase browser SDK loads when exchanging a Google credential. No production dependencies were added; unused `class-variance-authority` was removed.

## Implementation and review

Sol-high agents A-E implemented database reads, analytics, autosave, client loading, and cleanup in isolated worktrees. Their integration checkpoints are `bfaa60b`, `3a16906`, `7ed09e2`, `963ec25`, and `8db4657` respectively. The coordinator owns integration, dependency changes, and measurement tooling.

The two Astra-low reviews found five issues, all addressed with regression tests: blank-draft navigation during creation, PostgreSQL microsecond ordering, anonymous exact-history access, anonymous ordinary-history access, and overflowing rating-version inputs. The original expectation-formula regression was separately caught by the frozen-oracle comparison and fixed before integration.

Integrated local checks: `npm run lint`, `npm run typecheck`, and `npm test` pass (644 tests in 96 files). The production build passes. The supplementary SQL suite passes all 331 assertions. Scale comparisons pass at all three fixture sizes across all four periods. Tests belonging solely to removed wrappers were deleted; active entrypoint coverage remains.

## Release gates

The normal Supabase database gate is blocked by unavailable local infrastructure and a declined permission for the CLI's telemetry write outside the workspace. The browser suite also found port 3000 already occupied; its standalone startup check confirms local Supabase is unavailable. A separate production-login browser attempt could not reach a server after its Supabase connection was blocked. The existing server was left untouched. Responsive CSS was reviewed statically; 390/430px visual behavior, real email/Google login, and live browser flows remain unverified.

The supplementary harness executes actual migrations and pgTAP SQL with minimal auth/role scaffolding. It does not validate PostgREST, real Supabase sessions, concurrent transactions, or browser behavior. Do not treat those local results as approval to deploy.

Deploy additive migrations before the application. Retain previous RPCs for rollback. Before release, run `npm run test:db` and `npm run test:e2e` on local Supabase, verify the documented authorization, correction, autosave, inspector-version, and mobile scenarios, then inspect deployed errors and latency.
