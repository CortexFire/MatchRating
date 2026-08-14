# Agent Documentation Rules Design

## Context

The repository has root-level `design.md` and `schema.md` reference files, but `AGENTS.md` does not currently tell agents when to consult or maintain them.

## Decision

Add two explicit documentation rules to `AGENTS.md` while preserving the existing Next.js guidance.

### UI-impacting work

Before planning or implementing work that affects layout, styling, components, interactions, responsiveness, or accessibility, agents must read and follow the root-level `design.md` file. UI work does not update `design.md` unless the user explicitly requests an update.

### Database schema work

Before planning or implementing database schema changes, agents must read the root-level `schema.md` file. Schema changes include migrations and changes to tables, columns, types, constraints, indexes, relationships, enums, or policies. Agents must update `schema.md` in the same change so it accurately describes the resulting schema.

## Verification

Review the final `AGENTS.md` and confirm that:

- The existing Next.js rule is unchanged.
- UI-impacting work is gated on reading and following `design.md`.
- UI work is not instructed to update `design.md`.
- Database schema work is gated on reading `schema.md`.
- Database schema work must keep `schema.md` synchronized.
