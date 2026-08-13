# Group Section Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the group detail page sections in the order rating-status notice, members, active matches, and recent matches.

**Architecture:** Keep the existing Next.js Server Component and its parallel data loading unchanged. Express the intended visual and semantic order directly through JSX component order, and protect it with the existing server-rendered page test.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, React DOM server rendering

## Global Constraints

- Preserve every section's existing content and behavior.
- Keep the members disclosure collapsed by default.
- Do not change data loading, links, empty states, or match behavior.
- Keep semantic document order aligned with visual order; do not use CSS ordering.

---

### Task 1: Reorder the group detail sections

**Files:**
- Modify: `src/app/groups/[groupId]/page.test.tsx`
- Modify: `src/app/groups/[groupId]/page.tsx`

**Interfaces:**
- Consumes: Existing `RatingRebuildStatus`, `GroupMembersDisclosure`, `ActiveMatchDraftList`, and `RecentMatchList` component props.
- Produces: The existing `GroupPage` default export with a changed semantic render order and no signature changes.

- [ ] **Step 1: Write the failing ordering assertion**

Add these assertions to the existing landing-page rendering test after its section-presence assertions:

```tsx
const ratingStatusPosition = html.indexOf("Match saved. Ratings updating");
const membersPosition = html.indexOf("Members (1)");
const activeMatchesPosition = html.indexOf("Active matches");
const recentMatchesPosition = html.indexOf("Recent Matches");

expect(ratingStatusPosition).toBeLessThan(membersPosition);
expect(membersPosition).toBeLessThan(activeMatchesPosition);
expect(activeMatchesPosition).toBeLessThan(recentMatchesPosition);
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- --run "src/app/groups/[groupId]/page.test.tsx"`

Expected: FAIL because `Members (1)` currently appears after both match sections.

- [ ] **Step 3: Write the minimal implementation**

In the `MobileShell` children in `src/app/groups/[groupId]/page.tsx`, retain the header first and arrange the existing section components as follows:

```tsx
<RatingRebuildStatus
  groupId={groupId}
  jobId={ratingStatus.id}
  status={ratingStatus.status}
  canRetry={ratingStatus.canRetry}
/>
<GroupMembersDisclosure players={players} inviteHref={`/groups/${groupId}/invite`} />
<ActiveMatchDraftList drafts={activeDrafts} />
<RecentMatchList matches={recentMatches} historyHref={`/groups/${groupId}/history`} />
```

- [ ] **Step 4: Run focused and broader verification**

Run: `npm test -- --run "src/app/groups/[groupId]/page.test.tsx"`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS with no TypeScript errors.

Run: `npm test`

Expected: All tests pass.

- [ ] **Step 5: Commit the implementation**

```bash
git add -- "src/app/groups/[groupId]/page.test.tsx" "src/app/groups/[groupId]/page.tsx" "docs/superpowers/plans/2026-08-11-group-section-order.md"
git commit -m "fix: show group members before matches"
```
