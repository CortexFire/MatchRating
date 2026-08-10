# End-to-end tests

The Playwright suite writes demo users, group fixtures, matches, and reviews. Its default target is therefore the local Supabase stack only.

Run it with:

```text
npm run db:start
npm run test:e2e
```

The E2E launcher obtains the local Supabase URL and keys directly from the pinned local CLI at server start. It does not read or write an `.env` file, and Playwright never reuses a server already listening on port 3000.

An external Supabase target is intentionally opt-in because this suite mutates data. To allow one, set all three values below in the calling process and set `MATCHRATING_E2E_ALLOW_EXTERNAL_SUPABASE=true`:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
```

Without that explicit flag, caller-provided Supabase values are ignored and the launcher uses local Supabase.
