# Task 2 Report: Invite Redemption Database Coverage

## Status

Completed and verified locally.

## Commit Hashes

- Base commit: `5b6c1cf` (`fix invite runtime behaviors`)
- Task commit: `08ffd0d` (`test invite redemption database coverage`)

## Files Changed

- `supabase/tests/database/invites.test.sql`
- `.superpowers/sdd/invite-group-port/task-2-report.md`

## Assertions Covered

- `group_invites_one_active_per_group_idx` rejects a second active invite for the same group.
- An authenticated invitee redeems a permanent invite using command ID `cccccccc-cccc-4ccc-8ccc-cccccccccccc` and receives the fixture group ID.
- The first redemption creates exactly one active membership, one invite-redemption row, increments `use_count` to exactly `1`, and creates exactly one initial rating state with `rating = 1500` and `rd = 350`.
- Repeating the exact same command ID and invite ID replays the exact stored `jsonb` result, leaving the membership, redemption, and use count singular.
- The focused transaction has a pgTAP plan of 10 and ends with `rollback`.

## Database Commands and Exact Results

```powershell
.\node_modules\.bin\supabase.cmd start
```

Result: exit `0`; local URLs and credentials were printed. The CLI reported `Stopped services: [supabase_imgproxy_matchrating supabase_pooler_matchrating]` during startup housekeeping, then the database test commands connected successfully to the local database.

```powershell
.\node_modules\.bin\supabase.cmd test db --local --file supabase\tests\database\invites.test.sql
```

Result: exit `1`; the current Supabase CLI rejected `--file` with `Unrecognized flag: --file in command supabase test db`. Its help specified positional test paths.

```powershell
.\node_modules\.bin\supabase.cmd test db --local supabase\tests\database\invites.test.sql
```

Initial result: exit `1`; pgTAP reported `Bad plan. You planned 10 tests but ran 2`, caused by `ERROR: infinite recursion detected in policy for relation "group_memberships"` while a direct state assertion ran as `authenticated`.

After resetting the test role before direct table assertions and restoring `authenticated` only for the retry RPC:

```powershell
.\node_modules\.bin\supabase.cmd test db --local supabase\tests\database\invites.test.sql
```

Result: exit `0`; `Files=1, Tests=10`; `Result: PASS`.

```powershell
.\node_modules\.bin\supabase.cmd test db --local supabase\tests\database
```

Result: exit `0`; all four database files passed, `Files=4, Tests=86`; `Result: PASS`.

## Self-Review Findings

- The test follows the existing pgTAP transaction convention: `begin`, extension/search path setup, exact plan, and `rollback`.
- The duplicate insert exercises the actual partial unique index rather than asserting catalog metadata alone.
- The retry assertion compares the full returned `jsonb` result with the initial stored result, while separate exact counts protect every required idempotent side effect.
- Direct state checks run as the test owner because the suite's authenticated membership RLS policy intentionally recurses for direct reads; both command invocations remain authenticated with the invitee JWT claims.
- The existing authenticated-versus-anonymous RPC privilege assertion remains only in `transactional_match_commands.test.sql`; this test does not duplicate it.
- `git diff --check` completed with no whitespace errors.

## Concerns

None. The local stack was available after the normal project start command, and both required database test scopes passed.
