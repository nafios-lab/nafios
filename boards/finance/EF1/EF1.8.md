# EF1.8 — Design & create the `ledger_settlement_summary` table

> - `M0`
> - `type:feature`
> - `module:finance`
> - `area:data`
> - `P0`
> - `size:S`
> - **Epic:** EF1 — Finance Data Foundation

> **This ticket is self-contained.** Everything needed to add the migration, create the table, secure it, and verify it is in this file. Stack: **Supabase Postgres**, schema via the **Supabase CLI** (raw SQL migrations), runtime access via the **Supabase JS SDK**. **No ORM / no Drizzle.**
>
> **Assumes EF1.1 is done** (the `@nafios/db` package + `monthly_ledger`). This table's **only app FK is to `monthly_ledger`** — it does not depend on EF1.2–EF1.7. Purely additive — one new migration.

---

## 1. What you're building

Create one Postgres table, `ledger_settlement_summary`, plus its FKs, one index, and the RLS policy. **No enum. No CHECK constraints. No `updated_at` (and so no trigger). No `id` column — the PK *is* `ledger_id`.**

**What this table is (domain context — D7):** Live ledgers compute their metrics on the fly (COL, Health Margin, ASM — D11) and store nothing. **At settlement**, the spec freezes a **snapshot**. This table holds exactly that snapshot, **1:1 with a settled ledger**:

- the frozen metrics: `col`, `health_margin`, `asm_contribution`;
- **snapshotted copies** of `opening_balance` and `max_capped` (so the row is a fully self-contained historical record, immune to later edits/formula changes);
- the envelope tallies: `total_envelopes`, `paid_count`, `skipped_count`, `carried_over_count`;
- `settled_at`.

**The row's existence *is* the "settled" signal.** A live (`ongoing`/`reconciling`) ledger has **no** row here; the annual/history view (E13.2) renders settled months straight from this snapshot.

---

## 2. The rules this table must enforce (and why)

1. **Exactly one snapshot per ledger.** → `ledger_id` is both **PK** and the FK to `monthly_ledger(id)` — 1:1 by construction.
2. **Deleting the ledger removes its snapshot.** → `ledger_id` FK `CASCADE`.
3. **A user only ever sees/writes their own snapshots.** → RLS owner-isolation policy.

> **NOT this table's job:**
> - **Computing the metrics/tallies** — the settlement engine (E5/E13) computes and writes them once. This table just stores the result.
> - **Enforcing immutability** — a settled ledger is read-only by **domain guard** (E5.1/E8.2); Postgres has no "frozen row" primitive. Don't add triggers.
> - **Guaranteeing "row exists iff `monthly_ledger.status='settled'`"** — that cross-table invariant is **domain-owned** (the settlement transaction writes the row and flips the status together); there is no DB constraint linking them (see §13.1).

---

## 3. Relationships (verified against the full DB design)

**FKs — created in THIS migration:**

| Column | References | Null | On delete | Why |
|---|---|---|---|---|
| `ledger_id` (**PK**) | `monthly_ledger(id)` (EF1.1) | NOT NULL | `CASCADE` | 1:1 with the settled ledger; PK = FK enforces one-row-per-ledger. |
| `user_id` | `auth.users(id)` | NOT NULL | `CASCADE` | Ownership. Drives RLS. |

No inbound FKs — nothing references this table.

---

## 4. Columns

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `ledger_id` | `uuid` | NOT NULL | — | **Primary key** *and* FK → `monthly_ledger(id)` `CASCADE`. No separate `id`. |
| `user_id` | `uuid` | NOT NULL | `auth.uid()` | Owner. FK → `auth.users(id)` `CASCADE`. Drives RLS. |
| `col` | `numeric(12,2)` | NOT NULL | — | Frozen Cost-of-Living (Σ amount of pending+paid at settlement). |
| `health_margin` | `numeric(12,2)` | NOT NULL | — | Frozen `max_capped − col`. **May be negative** (overspend) — no sign CHECK. |
| `asm_contribution` | `numeric(12,2)` | NOT NULL | — | Frozen `opening_balance − col`. **May be negative** — no sign CHECK. |
| `opening_balance` | `numeric(12,2)` | NOT NULL | — | Snapshotted copy (self-contained record). |
| `max_capped` | `numeric(12,2)` | NOT NULL | — | Snapshotted copy. |
| `total_envelopes` | `integer` | NOT NULL | — | Count at settlement. |
| `paid_count` | `integer` | NOT NULL | — | Count of `paid` envelopes. |
| `skipped_count` | `integer` | NOT NULL | — | Count of `skipped` envelopes. |
| `carried_over_count` | `integer` | NOT NULL | — | Count of `carried_over` envelopes. |
| `settled_at` | `timestamptz` | NOT NULL | — | When the ledger was settled. **No `created_at`/`updated_at`** — `settled_at` is the row's timestamp. |

**Implementation notes:**
- **No `id`, no `created_at`, no `updated_at`.** This is an immutable snapshot; `ledger_id` is the identity and `settled_at` the timestamp. Hence **no `moddatetime` trigger**.
- All money columns `numeric(12,2)` — read as **strings** through the SDK.
- `health_margin`/`asm_contribution` are deliberately unconstrained in sign (overspending is real).

---

## 5. Enum, constraints & index

- **No enum. No CHECK constraints** (per the DB design §4 — none specified for this table). Optional count-consistency hardening is flagged in §13.2.

| Name | Kind | Definition | Query it serves |
|---|---|---|---|
| `idx_settlement_user` | INDEX | `(user_id)` | per-user annual/history listing (E13.2); also serves RLS |

---

## 6. Trigger + Row-Level Security

- **No `updated_at` trigger** (no `updated_at` column).
- **RLS:** enable + one `owner_all` policy with the `(select auth.uid())` form, `TO authenticated`. `service_role` bypasses RLS (the settlement writer/seed sets `user_id` explicitly). `auth.users` and `monthly_ledger` are referenced, not created.

(Exact SQL in §8.)

---

## 7. Adding the migration (additive)

Adds `supabase/migrations/20260627080000_finance_create_ledger_settlement_summary.sql` + `tests/integration/ledger-settlement-summary.test.ts`; regenerates `database.types.ts`. Only needs `monthly_ledger` (EF1.1) to exist. Commands and hard rules as in EF1.1 §7 (`db reset` clean from scratch, regenerate+commit types, direct `db push` to `staging` from local dev — no CI/CD pipeline).

---

## 8. The migration SQL (`20260627080000_finance_create_ledger_settlement_summary.sql`)

```sql
-- ledger_settlement_summary: frozen snapshot, 1:1 with a SETTLED ledger (D7).
-- Existence of a row = the ledger is settled. No id/created_at/updated_at.
create table ledger_settlement_summary (
  ledger_id          uuid          primary key
                                     references monthly_ledger (id) on delete cascade,
  user_id            uuid          not null default auth.uid()
                                     references auth.users (id) on delete cascade,
  col                numeric(12,2) not null,
  health_margin      numeric(12,2) not null,   -- may be negative
  asm_contribution   numeric(12,2) not null,   -- may be negative
  opening_balance    numeric(12,2) not null,   -- snapshotted copy
  max_capped         numeric(12,2) not null,   -- snapshotted copy
  total_envelopes    integer       not null,
  paid_count         integer       not null,
  skipped_count      integer       not null,
  carried_over_count integer       not null,
  settled_at         timestamptz   not null
);

-- per-user annual/history listing (also serves the RLS user_id predicate)
create index idx_settlement_user on ledger_settlement_summary (user_id);

-- row-level security: a user sees/writes only their own snapshots
alter table ledger_settlement_summary enable row level security;

create policy owner_all on ledger_settlement_summary
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

---

## 9. Rollback (local iteration only)

```sql
drop table if exists ledger_settlement_summary;   -- drops its index & policy too
```

---

## 10. SDK type generation

Run `bun run db:types` after applying. Types the snapshot row for the SDK so the history view (E13.2) reads typed columns directly — the reason a typed table beats a `jsonb` blob (D7).

---

## 11. Verification matrix

Setup: reuse EF1.1's two seed users. As the test user, insert a `monthly_ledger` (`<ledger>`, e.g. `status=settled, settled_at=now()`).

```sql
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"00000000-0000-0000-0000-00000000000a"}';
reset role;
```

| # | Action | Expected |
|---|---|---|
| 1 | Insert snapshot for `<ledger>` (all NOT NULL cols set; `health_margin=250.00`) | ✅ inserts |
| 2 | Insert a **second** row for the same `<ledger>` | ❌ PK (`ledger_id`) violation — 1:1 holds |
| 3 | Insert with `ledger_id=<random uuid>` | ❌ FK violation (`monthly_ledger`) |
| 4 | Insert with `health_margin=-300.00` (overspend) | ✅ inserts (sign unconstrained) |
| 5 | Insert with any NOT NULL metric/count omitted | ❌ NOT NULL |
| 6 | Delete the `<ledger>` | ✅ its snapshot cascade-deleted |
| 7 | As user A, `select`/`insert` a snapshot owned by user B | 0 rows / ❌ RLS `WITH CHECK` |
| 8 | Delete the auth user; check their snapshots | gone (`CASCADE`) |
| 9 | `supabase db reset` from scratch | ✅ clean apply |

Recommended: encode 1–8 as SDK tests in `tests/integration/ledger-settlement-summary.test.ts`.

---

## 12. Acceptance criteria

- [ ] **AC1** — Migration `20260627080000_finance_create_ledger_settlement_summary.sql` added to the existing `@nafios/db` package.
- [ ] **AC2** — Table exists with the exact columns/types/nullability in §4 — `ledger_id` is the **PK** (no separate `id`); **no `created_at`/`updated_at`**.
- [ ] **AC3** — `ledger_id` is PK **and** FK → `monthly_ledger(id)` `CASCADE` (1:1); `user_id` FK → `auth.users(id)` `CASCADE`.
- [ ] **AC4** — `idx_settlement_user` exists; RLS enabled + `owner_all` policy with `(select auth.uid())`.
- [ ] **AC5** — **No enum, no CHECKs, no `moddatetime` trigger.**
- [ ] **AC6** — `supabase db reset` clean from scratch; `db push` to `staging`; `database.types.ts` regenerated + committed.
- [ ] **AC7** — Every §11 case behaves as specified.

---

## 13. Notes / decisions to confirm

1. **"Row exists iff ledger settled" is domain-owned, not DB-enforced.** The settlement transaction must write this row and set `monthly_ledger.status='settled'` (+ `settled_at`) atomically. No DB constraint links them. Confirm the settlement engine (E5) owns this; consider doing both writes in one transaction.
2. **No count-consistency CHECKs.** The design specifies none. Optionally add `check (paid_count + skipped_count + carried_over_count <= total_envelopes)` and `check (col >= 0 and total_envelopes >= 0 and paid_count >= 0 …)`. Decide — note `health_margin`/`asm_contribution` must stay sign-unconstrained.
3. **Snapshot shape (D7).** Typed table chosen over `jsonb`; revisit only if the snapshot shape proves volatile (DB-design open #3).
4. **`settled_at` duplicated here and on `monthly_ledger`.** Intentional (self-contained record). Confirm the settlement writer sets both to the same instant.

*Provenance: D7 + D11 in `finance-db-design.md`; settlement behavior in `finance/specs/monthly-ledger.md` §4 ("On settlement").*

---

## Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 0.1 | 2026-06-27 | NafiOS Foundation | Initial standalone task for `ledger_settlement_summary` (D7 1:1 snapshot): `ledger_id` as PK+FK, frozen metric/snapshot/tally columns, `user_id` FK, history index, RLS. No enum/CHECK/`updated_at`/trigger. Flags the domain-owned "row exists iff settled" invariant and optional count-consistency CHECKs. |
