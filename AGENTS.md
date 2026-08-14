<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project Documentation

## UI-impacting work

Before planning or implementing work that affects layout, styling, components, interactions, responsiveness, or accessibility, read and follow the root-level `design.md` file. Do not update `design.md` unless the user explicitly requests it.

## Database schema work

Before planning or implementing database schema changes, read the root-level `schema.md` file. This includes migrations and changes to tables, columns, types, constraints, indexes, relationships, enums, or policies. Update `schema.md` in the same change so it accurately describes the resulting schema.
