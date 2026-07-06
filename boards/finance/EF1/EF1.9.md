# EF1.9 — Design & create the `opening_balance_adjustment` table

> - `M0`
> - `type:feature`
> - `module:finance`
> - `area:data`
> - `P0`
> - `size:S`
> - **Epic:** EF1 — Finance Data Foundation

> **This ticket is self-contained.** Everything needed to add the migration, create the table, secure it, and verify it is in this file. Stack: **Supabase Postgres**, schema via the **Supabase CLI** (raw SQL migrations), runtime access via the **Supabase JS SDK**. **No ORM / no Drizzle.**
>
> **Assumes EF1.1 is done** (the `@nafios/db` package + `monthly_ledger`). This table's **only app FK is to `monthly_ledger`** — it does not depend on EF1.2–EF1.8. Purely additive — one new migration.

---

## 1. What you're building

Create one Postgres table, `opening_balance_adjustment`, plus its FKs, one index, and the RLS policy. **No enum. No CHECK constraints. No `updated_at` (append-only → no trigger).**

**What this table is (domain context):** When a user edits a ledger's `opening_balance`, the change is **logged** (domain §5 invariant: "Opening Balance adjustments are logged"). Each row is one such edit — an **append-only audit entry** recording the `previous_value`, the `new_value`, an optional `reason`, and when (`adjusted_at`). The ledger's *current* opening balance lives on `monthly_ledger`; this table is the history of how it got there.

---

## 2. The rules this table must enforce (and why)

1. **Each edit belongs to one ledger; deleting the ledger removes its audit trail.** → `ledger_id NOT NULL` + FK `CASCADE`.
2. **A user only ever sees/writes their own adjustments.** → RLS owner-isolation policy.

> **NOT this table's job:**
> - **Append-only enforcement.** "Append-only" is a **domain/repo convention** (only INSERT; never UPDATE/DELETE individual rows). Postgres allows updates by default; this ticket does **not** add a rule/trigger to block them (see §13.1). RLS still scopes by owner.
> - **Applying the new value** to `monthly_ledger.opening_balance` — that's the domain operation (E4.3) that *also* writes a row here. Both happen in the edit transaction.
> - **Validating the maxCapped ceiling** against the new opening balance — domain guard (E4.3), not here.

---

## 3. Relationships (verified against the full DB design)

**FKs — created in THIS migration:**

| Column | References | Null | On delete | Why |
|---|---|---|---|---|
| `user_id` | `auth.users(id)` | NOT NULL | `CASCADE` | Ownership. Drives RLS. |
| `ledger_id` | `monthly_ledger(id)` (EF1.1) | NOT NULL | `CASCADE` | The ledger this edit belongs to; audit trail removed with the ledger. |

No inbound FKs — nothing references this table.

---

## 4. Columns

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `user_id` | `uuid` | NOT NULL | `auth.uid()` | Owner. FK → `auth.users(id)` `CASCADE`. Drives RLS. |
| `ledger_id` | `uuid` | NOT NULL | — | FK → `monthly_ledger(id)` `CASCADE`. The ledger whose opening balance changed. |
| `previous_value` | `numeric(12,2)` | NOT NULL | — | The opening balance **before** this edit. |
| `new_value` | `numeric(12,2)` | NOT NULL | — | The opening balance **after** this edit. |
| `reason` | `text` | NULL | — | Optional note explaining the adjustment. |
| `adjusted_at` | `timestamptz` | NOT NULL | `now()` | When the edit happened. **No `created_at`/`updated_at`** — `adjusted_at` is the row's timestamp. |

**Implementation notes:**
- **No `updated_at`** (append-only) → **no `moddatetime` trigger**.
- Money columns `numeric(12,2)` — read as **strings** through the SDK.

---

## 5. Enum, constraints & index

- **No enum. No CHECK constraints** (none specified in the DB design §4). Optional non-negativity hardening flagged in §13.2.

| Name | Kind | Definition | Query it serves |
|---|---|---|---|
| `idx_oba_ledger` | INDEX | `(user_id, ledger_id)` | a ledger's adjustment history, per user (E4.3); also serves RLS |

---

## 6. Trigger + Row-Level Security

- **No `updated_at` trigger** (append-only, no `updated_at`).
- **RLS:** enable + one `owner_all` policy with the `(select auth.uid())` form, `TO authenticated`. `service_role` bypasses RLS (seeds/jobs set `user_id` explicitly). `auth.users` and `monthly_ledger` are referenced, not created.

(Exact SQL in §8.)

---

## 7. Adding the migration (additive)

Adds `supabase/migrations/20260627090000_finance_create_opening_balance_adjustment.sql` + `tests/integration/opening-balance-adjustment.test.ts`; regenerates `database.types.ts`. Only needs `monthly_ledger` (EF1.1). Commands and hard rules as in EF1.1 §7 (`db reset` clean from scratch, regenerate+commit types, direct `db push` to `staging` from local dev — no CI/CD pipeline).

---

## 8. The migration SQL (`20260627090000_finance_create_opening_balance_adjustment.sql`)

```sql
-- opening_balance_adjustment: append-only audit log of opening-balance edits.
-- "Opening Balance adjustments are logged" (domain §5). No updated_at.
create table opening_balance_adjustment (
  id             uuid          primary key default gen_random_uuid(),
  user_id        uuid          not null default auth.uid()
                                 references auth.users (id) on delete cascade,
  ledger_id      uuid          not null
                                 references monthly_ledger (id) on delete cascade,
  previous_value numeric(12,2) not null,
  new_value      numeric(12,2) not null,
  reason         text,
  adjusted_at    timestamptz   not null default now()
);

-- a ledger's adjustment history, per user (also serves the RLS user_id predicate)
create index idx_oba_ledger on opening_balance_adjustment (user_id, ledger_id);

-- row-level security: a user sees/writes only their own adjustments
alter table opening_balance_adjustment enable row level security;

create policy owner_all on opening_balance_adjustment
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

---

## 9. Rollback (local iteration only)

```sql
drop table if exists opening_balance_adjustment;   -- drops its index & policy too
```

---

## 10. SDK type generation

Run `bun run db:types` after applying. Types the audit row for the SDK so the adjustment-history read (E4.3) is type-safe.

---

## 11. Verification matrix

Setup: reuse EF1.1's two seed users. As the test user, insert a `monthly_ledger` (`<ledger>`).

```sql
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"00000000-0000-0000-0000-00000000000a"}';
reset role;
```

| # | Action | Expected |
|---|---|---|
| 1 | Insert `ledger_id=<ledger>, previous_value=5000.00, new_value=5200.00, reason='bonus'` | ✅ inserts |
| 2 | Insert a second adjustment for the same `<ledger>` (history accrues) | ✅ inserts (no uniqueness) |
| 3 | Insert with `reason=NULL` | ✅ inserts (reason optional) |
| 4 | Insert with `previous_value` or `new_value` NULL, or `ledger_id` NULL | ❌ NOT NULL |
| 5 | Insert with `ledger_id=<random uuid>` | ❌ FK violation (`monthly_ledger`) |
| 6 | Delete the `<ledger>` | ✅ its adjustments cascade-deleted |
| 7 | As user A, `select`/`insert` a row owned by user B | 0 rows / ❌ RLS `WITH CHECK` |
| 8 | Delete the auth user; check their adjustments | gone (`CASCADE`) |
| 9 | `supabase db reset` from scratch | ✅ clean apply |

Recommended: encode 1–8 as SDK tests in `tests/integration/opening-balance-adjustment.test.ts`.

---

## 12. Acceptance criteria

- [ ] **AC1** — Migration `20260627090000_finance_create_opening_balance_adjustment.sql` added to the existing `@nafios/db` package.
- [ ] **AC2** — Table exists with the exact columns/types/nullability/defaults in §4 — **no `updated_at`** (has `adjusted_at`).
- [ ] **AC3** — `user_id` FK → `auth.users(id)` `CASCADE`; `ledger_id` FK → `monthly_ledger(id)` `CASCADE`.
- [ ] **AC4** — `idx_oba_ledger` exists; RLS enabled + `owner_all` policy with `(select auth.uid())`.
- [ ] **AC5** — **No enum, no CHECKs, no `moddatetime` trigger.**
- [ ] **AC6** — `supabase db reset` clean from scratch; `db push` to `staging`; `database.types.ts` regenerated + committed.
- [ ] **AC7** — Every §11 case behaves as specified.

---

## 13. Notes / decisions to confirm

1. **Append-only is domain-enforced, not DB-enforced.** The repository must only INSERT (never UPDATE/DELETE) here. Optional DB hardening: `REVOKE UPDATE, DELETE ON opening_balance_adjustment FROM authenticated;` (RLS already scopes by owner, but this would make append-only structural). Decide whether to add it.
2. **No value CHECKs.** Design specifies none. Optionally add `check (previous_value >= 0 and new_value >= 0)` to mirror the ledger's non-negative opening balance, and/or `check (new_value <> previous_value)` (a no-op edit shouldn't be logged). Decide.
3. **Audit scope (DB-design open #6).** Is this single audit table enough, or does the PA layer eventually want a unified `finance_audit_log` (kills, terminations, maxCapped edits)? MVP-minimal for now.
4. **Atomicity.** The opening-balance edit must write `monthly_ledger.opening_balance` **and** this row in one transaction (E4.3). Confirm the domain owns this.

*Provenance: `finance-db-design.md` (the table + §6 invariant map row "Opening Balance adjustments are logged"); behavior in `finance/specs/monthly-ledger.md` and domain §5.*

---

## Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 0.1 | 2026-06-27 | NafiOS Foundation | Initial standalone task for `opening_balance_adjustment` (append-only audit log): columns (no `updated_at`; `adjusted_at` timestamp), two `CASCADE` FKs, history index, RLS. No enum/CHECK/trigger. Flags append-only-as-domain-convention + optional DB hardening, and optional value CHECKs. |
