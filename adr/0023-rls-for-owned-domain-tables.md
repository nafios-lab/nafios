# 0023. Row-Level Security for owned domain tables

- **Status:** Accepted
- **Date:** 2026-06-28
- **Source:** EF1.1 — Finance Data Foundation (`monthly_ledger`)

## Context

[ADR-0019](0019-app-layer-authz-rls-deferred.md) made authorization an
application-layer concern and **deferred** Postgres RLS. It deferred RLS, did
not reject it, and named the condition for adopting it:

> RLS will be adopted when: (1) the data model has stabilized with real tables
> and ownership columns; (2) multi-tenancy / cross-user access patterns emerge;
> (3) a dedicated data-security epic designs and tests RLS policies alongside
> the application layer.

The Finance Data Foundation epic is that moment. `monthly_ledger` is the first
**owned domain table**: every row belongs to exactly one user (`user_id`), each
user must see and write only their own rows, and the table is the FK hub for
later finance tables (`envelope`, `ledger_settlement_summary`, …). The
ownership semantics are now concrete, and a forgotten `WHERE user_id = …` in
app code would silently leak another user's financial data.

The auth-epic tables (`profiles`, `family_members`) keep RLS disabled — their
access goes through `SECURITY DEFINER` RPCs and app-layer scoping, and changing
them is out of scope here.

## Decision

**Owned domain tables enable RLS as defense-in-depth**, starting with
`monthly_ledger`. App-layer authorization from ADR-0019 **remains** — RLS layers
on top of it, it does not replace it.

The owner-isolation pattern for an owned table:

- `user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE`
  — inserts stamp the owner from the request JWT automatically.
- `ENABLE ROW LEVEL SECURITY` plus one `FOR ALL TO authenticated` policy:
  `USING ((select auth.uid()) = user_id)` and the same `WITH CHECK`.
  `auth.uid()` is wrapped in `(select …)` so it is evaluated once per statement.
- Explicit `GRANT`s to `authenticated` and `service_role` (the project sets
  `auto_expose_new_tables = false`). RLS scopes the rows `authenticated` reaches;
  `service_role` bypasses RLS for migrations, seeds, jobs, and admin cleanup.

This does not change ADR-0019's stance for the existing auth-epic tables, nor
mandate RLS on every future table — it establishes the pattern for tables with
clear single-user ownership.

## Consequences

- A missing `user_id` filter in a finance server function can no longer leak
  another user's rows — the database refuses them. Two layers must both fail to
  cause a leak.
- `service_role` carries no JWT, so `auth.uid()` is NULL; a `service_role`
  insert that omits `user_id` fails the `NOT NULL` constraint by design. Seeds
  and jobs must set `user_id` explicitly.
- RLS is testable end-to-end: the `monthly_ledger` integration suite signs in as
  two real users and asserts cross-user reads return zero rows and cross-user
  inserts are rejected by `WITH CHECK`.
- Per-table opt-in: each new owned table decides explicitly whether to enable
  RLS. The pattern above is the default for single-user-owned tables.
- Related: ADR-0012 (Supabase), ADR-0014 (`supabase-js` data access),
  ADR-0016 (`auth` schema referenced, `auth.uid()` canonical), ADR-0019
  (app-layer authz — still in force as the first layer).

## Alternatives considered

- **Keep RLS deferred (status quo, ADR-0019).** Consistent with the auth-epic
  tables, but leaves financial data protected by a single app-layer check at the
  exact point the data model and ownership became concrete — which is the
  trigger ADR-0019 set for adopting RLS.
- **RLS-only (drop app-layer checks).** The app still needs identity for UI,
  validation, and auditing, and RLS gives poor error ergonomics for app flows.
  Defense-in-depth (both layers) is the intended end state.
- **Composite-FK ownership pinning now** (`UNIQUE (id, user_id)` so child tables
  can FK `(ledger_id, user_id)`). Deferred to the `envelope` ticket per EF1.1
  §13; not required for this table's RLS.
