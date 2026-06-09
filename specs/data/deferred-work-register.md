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

| Deferred item | Owning epic |
|---|---|
| First table-creating migration | First product/app epic ("NafiOS Plan") |
| Ownership / tenancy model | First product/app epic |
| `@nafios/db-core` package (client factory + generated types) | First table's epic |
| Generated-types output wiring (`db:types` target path) | First table's epic |
| ERD | First product/app epic |
| Data dictionary | First product/app epic |
| Per-domain query/SQL layer (RPC / Postgres functions) | Owning product epic, on friction |
| RLS under live auth session (JWT / SSR proof) | First app epic |
| `updated_at` trigger vs app-set | First table's epic |
| PK strategy (UUID v4 vs v7) | First table's epic |
| Ownership column naming (`created_by` / `user_id` / `owner_id`) | First table's epic |

Every row names an owning epic — no orphan items.
