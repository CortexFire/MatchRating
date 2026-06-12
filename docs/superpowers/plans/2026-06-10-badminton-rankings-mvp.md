# Badminton Rankings MVP Implementation Checklist

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first badminton match tracking MVP with group-isolated Glicko-2 rankings.

**Architecture:** Next.js App Router on Vercel with Supabase Auth/Postgres. Server Components render reads, Server Actions handle mutations, and derived ratings rebuild from immutable match revisions.

**Tech Stack:** Next.js, TypeScript, Tailwind CSS, Supabase SSR, Supabase Postgres/RLS, Vitest, Playwright.

---

## Tasks

- [x] Scaffold Next.js App Router with TypeScript, Tailwind, lint, Vitest, and Playwright.
- [x] Add pure Glicko-2 rating engine with singles, doubles partner-strength adjustment, and replay rebuild.
- [x] Add match validation and invite token hashing tests.
- [x] Add Supabase migration with core tables, RLS enabled, explicit grants, and service-role-only rating writes.
- [x] Add Supabase SSR/server clients and typed Server Actions for auth, groups, invites, matches, confirmations, disputes, revisions, and rebuilds.
- [x] Add mobile app shell and all MVP routes from the production plan.
- [x] Add local demo data fallback so UI can be verified before Supabase env vars are connected.
- [ ] Apply Supabase migration to a real project and run RLS integration tests.
- [ ] Export active Figma frames after MCP rate limit resets and complete pixel comparison.
- [ ] Wire pages to live Supabase read queries once project credentials are available.
