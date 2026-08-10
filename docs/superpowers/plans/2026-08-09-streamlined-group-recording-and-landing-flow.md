# Streamlined Group Recording and Landing Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make group switching functional throughout match entry and replace the group landing navigation cards with recent matches and collapsed members.

**Architecture:** Keep the route group ID authoritative. A shared client selector navigates to a clean grouped match route, while server components load authorized groups and players. The group landing builds on the existing stored-match read model and server-preloads the five newest matches and active members.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase, Vitest, Testing Library, Playwright, Tailwind CSS.

## Global Constraints

- Read the relevant guides in `node_modules/next/dist/docs/` before editing Next.js code.
- Use test-driven development: add a focused failing test, verify the expected failure, then implement the minimum production change.
- Do not add database migrations, client data endpoints, or segment-wide loading/error files.
- Keep `/members` and `/rankings` routes available, but remove their group-landing navigation cards.
- Include pending, confirmed, and disputed matches in newest-first recent-match results.
- Preserve Active Match Drafts and Rating Rebuild Status on the group landing.

---

### Task 1: Terra Agent 1 — Match Recording Group Switch

**Files:**
- Create: `src/components/match/group-switcher.tsx`
- Create: `src/components/match/group-switcher.test.tsx`
- Create: `src/app/groups/[groupId]/matches/new/page.test.tsx`
- Modify: `src/app/groups/[groupId]/matches/new/page.tsx`
- Modify: `src/components/match/match-recorder.tsx`
- Modify: `src/components/match/match-recorder.test.tsx`
- Modify: `src/app/actions.ts`
- Modify: `src/app/actions.match-commands.test.ts`

**Interfaces:**
- Produce `GroupOption = Pick<AppGroup, "id" | "name">`.
- Produce `GroupSwitcher({ groups, currentGroupId })` using a controlled native select.
- Extend `MatchRecorder` to consume the available group options while keeping existing test defaults compatible.

- [ ] Add failing tests proving an actual group change prompts with `Switch groups? Your current match setup will be discarded.`, cancel preserves state, confirm calls `router.push("/groups/{groupId}/matches/new")`, and a single-group selector is disabled.
- [ ] Implement `GroupSwitcher` without preserving any search parameters.
- [ ] Add failing route tests proving `listCurrentUserGroups()` is loaded, the recorder is keyed by `groupId`, and a draft from another group renders the unavailable/expired recovery state.
- [ ] Update the new-match page to load group options, pass them to the recorder, key by route group, and reject mismatched drafts.
- [ ] Replace the Match Recording passive group pill with `GroupSwitcher` and update recorder tests.
- [ ] Add a failing action test proving `submitMatch` rejects an editable draft whose stored `group_id` differs from the validated submission group.
- [ ] Harden `submitMatch` with the same cross-group draft check used by draft saving.
- [ ] Run focused tests, typecheck, and lint; self-review; commit the task.

### Task 2: Sol Agent 3 — Group Landing Redesign

**Files:**
- Modify: `src/lib/app-data.ts`
- Modify: `src/lib/app-data.matches.test.ts`
- Modify: `src/components/app/match-row.tsx`
- Modify: `src/components/match/match-history-list.tsx`
- Create: `src/components/match/recent-match-list.tsx`
- Create: `src/components/match/recent-match-list.test.tsx`
- Create: `src/components/groups/group-members-disclosure.tsx`
- Create: `src/components/groups/group-members-disclosure.test.tsx`
- Modify: `src/app/groups/[groupId]/page.tsx`
- Modify: `src/app/groups/[groupId]/page.test.tsx`
- Modify: `src/app/groups/[groupId]/invite/page.tsx`

**Interfaces:**
- Extend `listGroupMatches(groupId, options?: { limit?: number }): Promise<AppMatchSummary[]>`.
- Change `MatchRow` to consume `AppMatchSummary` directly.
- Produce `GroupMembersDisclosure({ players, inviteHref })`.

- [ ] Add failing data tests for optional `.limit(5)`, group filtering, non-null active revisions, and deterministic `submitted_at DESC, id DESC` order before hydration.
- [ ] Implement the optional reader limit without filtering match status.
- [ ] Add failing component tests for direct `AppMatchSummary` rows and a recent list that shows at most five links, View all only when non-empty, and the exact empty state.
- [ ] Centralize match status, player, score, rating-summary, and America/Los_Angeles timestamp formatting in `MatchRow`; update full history and add Recent Matches.
- [ ] Add failing disclosure tests proving native details is initially closed, reports `Members (N)`, renders ranked players and Invite members when expanded, and handles zero members.
- [ ] Implement the server-preloaded disclosure with the existing `PlayerRow`.
- [ ] Add failing group-page tests covering access/not-found, parallel data reads, drafts, rating status, all-status recents, disclosure, and absence of `/members` and `/rankings` landing cards.
- [ ] Redesign the group page and change the invite back destination to `/groups/{groupId}`.
- [ ] Run focused tests, typecheck, and lint; self-review; commit the task.

### Task 3: Terra Agent 2 — Player Select Group Switch

**Depends on:** Task 1.

**Files:**
- Modify: `src/components/match/player-select-view.tsx`
- Modify: `src/components/match/match-recorder.tsx`
- Modify: `src/components/match/match-recorder.test.tsx`

**Interfaces:**
- Consume Task 1's `GroupSwitcher`, `GroupOption`, and route-native navigation behavior.
- Add `groups` and `currentGroupId` to `PlayerSelectView`.

- [ ] Add failing tests proving Player Select renders the shared switcher and targets the clean grouped route.
- [ ] Add failing keyed-rerender tests using distinct two-group player fixtures; verify prior players, selected teams, guests, search/filter state, scores, messages, and draft IDs do not survive the route-group change.
- [ ] Pass resolved group options from `MatchRecorder` to `PlayerSelectView` and replace its passive pill with `GroupSwitcher`.
- [ ] Verify only target-group players can be selected and guest creation receives the target group ID.
- [ ] Run focused tests, typecheck, and lint; self-review; commit the task.

## Integration Verification

- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run the group-switching Playwright spec for mobile and desktop when its authenticated two-group fixture is available.
- [ ] Run the stored-match-review Playwright spec for mobile and desktop when its Supabase environment is available.
