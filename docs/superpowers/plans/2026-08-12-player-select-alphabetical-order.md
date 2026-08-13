# Player Select Alphabetical Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display Player Select rows alphabetically by first name without changing player order elsewhere.

**Architecture:** Keep ordering inside the existing `PlayerSelectView` client component. Filter into a new array, then sort that array with a first-name comparator and a full-name tie-breaker so the input prop is never mutated.

**Tech Stack:** Next.js 16.2.9, React 19.2.4, TypeScript 5, Vitest 4.1.8, ESLint 9

## Global Constraints

- Sort by the first word of the displayed player name.
- Use the full displayed name as the deterministic tie-breaker.
- Preserve alphabetical order in every search and filter view.
- Do not change ordering on other screens.
- Do not add a new automated test, per the user's request.

---

### Task 1: Alphabetize Visible Player Rows

**Files:**
- Modify: `src/components/match/player-select-view.tsx:73-87,360-370`

**Interfaces:**
- Consumes: `players: AppPlayer[]` and the existing Player Select search/filter state.
- Produces: `comparePlayersByFirstName(left: AppPlayer, right: AppPlayer): number`, used only to order `visiblePlayers`.

- [ ] **Step 1: Add the first-name comparator and apply it after filtering**

Add this comparator near the existing local helper functions:

```ts
function comparePlayersByFirstName(left: AppPlayer, right: AppPlayer) {
  const leftFirstName = left.name.trim().split(/\s+/, 1)[0] ?? "";
  const rightFirstName = right.name.trim().split(/\s+/, 1)[0] ?? "";
  const firstNameOrder = leftFirstName.localeCompare(rightFirstName, undefined, { sensitivity: "base" });

  return firstNameOrder || left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
}
```

Chain `.sort(comparePlayersByFirstName)` onto the array returned by the existing `players.filter(...)` expression. `filter` creates a new array, so sorting it does not mutate `players`.

- [ ] **Step 2: Run focused existing component tests**

Run:

```powershell
npm test -- --run src/components/match/match-recorder.test.tsx
```

Expected: the existing MatchRecorder and Player Select component tests pass with zero failures.

- [ ] **Step 3: Run static verification**

Run:

```powershell
npm run typecheck
npx eslint src/components/match/player-select-view.tsx
git diff --check
```

Expected: all commands exit with status 0 and report no errors.

- [ ] **Step 4: Review the scoped diff**

Run:

```powershell
git diff -- src/components/match/player-select-view.tsx
git status --short
```

Expected: the implementation diff only changes Player Select ordering; unrelated existing worktree changes remain untouched.
