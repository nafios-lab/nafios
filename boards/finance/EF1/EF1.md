# EF1 — Finance Data Foundation

> - `M0`
> - `type:epic`
> - `module:finance`
> - `area:data`
> - Target Completion: Before Q2

## TL;DR

Stand up the complete database layer for the Finance module: design and create all **10 Postgres tables** that model finance, ship each as a version-controlled SQL migration, secure every table with row-level security, and apply them to the `staging` Supabase database. This is the **schema-and-data foundation only** — no application code, business logic, packages, or UI.

## Goal

Establish the Finance module's single source of truth for data: a fully modelled, related, and secured PostgreSQL schema, provisioned on Supabase, that every future Finance feature is built on top of.

## Stack & approach

- **Database:** Supabase Postgres.
- **Schema management:** raw SQL migrations run through the Supabase CLI — **no ORM, no Drizzle**.
- **Runtime access:** Supabase JS SDK (`@supabase/supabase-js`).
- **Security:** row-level security enabled with per-user policies on every table.
- **Conventions:** all migrations live in a single `@nafios/db` package; UUID primary keys; `created_at` / `updated_at` timestamps maintained by a shared `moddatetime` trigger where applicable.

## Scope / Deliverables

The schema is **10 tables**, each delivered as its own additive migration with its enums, constraints, indexes, and RLS policy:

1. `monthly_ledger` — the per-month header (also bootstraps the migration system).
2. `category` — spending categories.
3. `account` — money accounts.
4. `person` — people money is owed to or shared with.
5. `template` — recurring & adhoc line-item templates.
6. `envelope` — the per-month line items (most relationships in the schema).
7. `carry_over` — unspent / overspent amounts rolled between months.
8. `ledger_settlement_summary` — per-ledger settlement snapshot.
9. `opening_balance_adjustment` — append-only opening-balance corrections.
10. `finance_settings` — per-user finance configuration (singleton).

Plus, around the tables:

- Bootstrapped migration system and `@nafios/db` package.
- Migrations applied to the `staging` Supabase database, pushed directly from local dev (`supabase db push`). **No CI/CD migration pipeline in this epic.**
- ERD / DBML documentation of the final schema.

## Out of scope

- Finance packages, business logic, or any feature implementation.
- Any web app, front end, or UI.
- Derived/computed metrics (committed totals, headroom, etc.) — these are read-time concerns, not tables.

## Success Criteria

- All 10 tables exist with their enums, constraints, indexes, and RLS policies — each backed by a migration.
- The `staging` Supabase Postgres database holds the complete, related schema (migrations pushed directly from local dev).
