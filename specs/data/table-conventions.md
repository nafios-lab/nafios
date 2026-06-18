---
title: Table conventions and RLS patterns
status: active
version: 1.0.0
updated: 2026-06-09
owner: Hanafi
related_adrs: [0012, 0013, 0014, 0015, 0016]
---

# Table Conventions — Specification

## Purpose

Defines the standard column set, RLS pattern, and naming rules that every
NafiOS table must follow. These are **copy-paste templates** — no tables are
created by this spec (see [ADR-0015](../../adr/0015-conventions-as-templates-not-applied-tables.md)).

## Scope

**In:** standard columns, RLS pattern, table/column naming rules.
**Out:** actual table creation (first product epic), ownership/tenancy model
(decided with first table), auth flows and session handling.

## Entities

### Standard column set (template)

Every NafiOS table includes these columns:

```sql
-- Standard column set (template; do not apply directly)
id          uuid primary key default gen_random_uuid(),
created_at  timestamptz not null default now(),
updated_at  timestamptz not null default now(),
deleted_at  timestamptz,
created_by  uuid references auth.users(id),
updated_by  uuid references auth.users(id)
```

**Open choices (decided with the first real table):**

- **PK strategy:** template defaults to `gen_random_uuid()` (UUID v4). UUID v7
  requires an extension — do not add it speculatively. Revisit at first-table time.
- **`updated_at` maintenance:** DB trigger vs application-set. Pick and document
  when the first table is created.

### RLS pattern (template)

Deny-by-default, owner-scoped:

```sql
-- RLS pattern (template; deny-by-default, owner-scoped)
alter table <table_name> enable row level security;

create policy <table_name>_owner on <table_name>
  for all
  using   (<owner_col> = auth.uid())
  with check (<owner_col> = auth.uid());
```

The `<owner_col>` placeholder is resolved when the ownership/tenancy model is
decided (first product epic). `auth.uid()` is the canonical identity function
(see [ADR-0016](../../adr/0016-auth-schema-referenced-not-owned.md)).

## Invariants

1. Every table **must** enable RLS (`alter table ... enable row level security`).
2. The deny-by-default principle: without an explicit policy, no role can read or
   write rows.
3. The `auth` schema is referenced, never owned — no migration touches `auth.*`.
4. These templates are **runnable SQL** — they can be applied inside a transaction
   and rolled back.

> **Note (ADR-0019):** authorization is currently handled at the **application
> layer**; RLS is deferred, and the live tables (`profiles`, `family_members`)
> run with RLS disabled. Invariants 1–2 describe the *target* convention for when
> RLS is adopted (first product epic, once the `<owner_col>` model is decided),
> not current practice.

## Public API

N/A — these are documentation templates, not code.

## Error modes

N/A.

## Examples

See the applied migrations under `supabase/migrations/` for concrete tables that
follow this column template (e.g. the `profiles` and `family_members` tables).

## Open questions

- **UUID v4 vs v7 for primary keys** — deferred to first-table epic.
- **`updated_at` trigger vs app-set** — deferred to first-table epic.
- **Table pluralization** — adopt **plural** table names (e.g. `profiles`, `transactions`).
  Singular is acceptable for join tables or where plural reads awkwardly.
- **Ownership column name** — `created_by`, `user_id`, or `owner_id`? Decided with
  the first table's domain model.
