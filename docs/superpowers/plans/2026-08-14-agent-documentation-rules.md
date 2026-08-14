# Agent Documentation Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make repository agents consult the design guide before UI-impacting work and keep the schema reference synchronized with database schema changes.

**Architecture:** Preserve the existing Next.js compatibility block in the root `AGENTS.md`. Add two focused Markdown sections whose trigger conditions and required actions are explicit enough to apply before planning or implementation begins.

**Tech Stack:** Markdown repository guidance

## Global Constraints

- UI-impacting work must read and follow root-level `design.md`.
- UI-impacting work must not update `design.md` unless the user explicitly requests it.
- Database schema work must read root-level `schema.md` before planning or implementation.
- Database schema work must update `schema.md` in the same change so it describes the resulting schema.
- The existing Next.js rule must remain unchanged.

---

### Task 1: Add project documentation rules

**Files:**
- Modify: `AGENTS.md:1`

**Interfaces:**
- Consumes: Root-level `design.md` and `schema.md` as authoritative project references.
- Produces: Repository-wide agent instructions for UI-impacting and database schema work.

- [ ] **Step 1: Confirm the required rules are currently absent**

Run:

```powershell
rg -n "design\.md|schema\.md" AGENTS.md
```

Expected: no matches and exit code 1.

- [ ] **Step 2: Add the documentation rules after the existing Next.js block**

Append this exact content to `AGENTS.md`:

```markdown

# Project Documentation

## UI-impacting work

Before planning or implementing work that affects layout, styling, components, interactions, responsiveness, or accessibility, read and follow the root-level `design.md` file. Do not update `design.md` unless the user explicitly requests it.

## Database schema work

Before planning or implementing database schema changes, read the root-level `schema.md` file. This includes migrations and changes to tables, columns, types, constraints, indexes, relationships, enums, or policies. Update `schema.md` in the same change so it accurately describes the resulting schema.
```

- [ ] **Step 3: Verify the new rules and unchanged Next.js block**

Run:

```powershell
Get-Content -Raw AGENTS.md
git diff --check -- AGENTS.md
git diff -- AGENTS.md
```

Expected: both documentation rules appear after the original Next.js block, the original block is unchanged, and `git diff --check` reports no errors.

- [ ] **Step 4: Commit the documentation change**

```powershell
git add -- AGENTS.md docs/superpowers/plans/2026-08-14-agent-documentation-rules.md
git commit -m "Improve agent documentation rules"
```
