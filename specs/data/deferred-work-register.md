---
title: Deferred work register (datasource-be-foundation)
status: active
version: 1.0.0
updated: 2026-06-09
owner: Hanafi
related_adrs: [0015]
---

# Deferred Work Register

Items deliberately **not built** in the datasource-be-foundation epic, with
the owning future epic that will deliver each one.

| Deferred item | Owning epic | Status |
|---|---|---|
| First table-creating migration | First product/app epic ("NafiOS Plan") | **Resolved** — `profiles` + `family_members` (nafios-auth C3) |
| Ownership / tenancy model | First product/app epic | **Resolved** — `profile_id` for domain FK, `created_by`/`updated_by` for audit |
| `@nafios/db-core` package (client factory + generated types) | First table's epic | Open |
| Generated-types output wiring (`db:types` target path) | First table's epic | Open |
| ERD | First product/app epic | Open |
| Data dictionary | First product/app epic | Open |
| Per-domain query/SQL layer (RPC / Postgres functions) | Owning product epic, on friction | Open |
| RLS under live auth session (JWT / SSR proof) | First app epic | Open |
| `updated_at` trigger vs app-set | First table's epic | **Resolved** — DB trigger (`public.set_updated_at()`) |
| PK strategy (UUID v4 vs v7) | First table's epic | **Resolved** — UUID v4 (`gen_random_uuid()`) |
| Ownership column naming (`created_by` / `user_id` / `owner_id`) | First table's epic | **Resolved** — `profile_id` (domain), `created_by`/`updated_by` (audit) |

Every row names an owning epic — no orphan items.
