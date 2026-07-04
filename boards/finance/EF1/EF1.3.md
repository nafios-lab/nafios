# EF1.3 — Design & create the `account` table

> - `M0`
> - `type:feature`
> - `module:finance`
> - `area:data`
> - `P0`
> - `size:S`
> - **Epic:** EF1 — Finance Data Foundation

> **This ticket is self-contained.** Everything needed to add the migration, create the table, secure it, and verify it is in this file. No other document is required. Stack: **Supabase Postgres**, schema managed by the **Supabase CLI** (raw SQL migrations), runtime data access via the **Supabase JS SDK** (`@supabase/supabase-js`). **No ORM / no Drizzle.**
>
> **Assumes EF1.1–EF1.2 are done:** the `@nafios/db` package + migration system (EF1.1) and the module-wide `updated_at` trigger convention (EF1.2, `moddatetime`) already exist. This ticket is **purely additive** — one new migration that reuses both.

---

## 1. What you're building

Create one Postgres table, `account`, plus its enum (`account_type`), an `updated_at` auto-maintenance trigger (reusing the EF1.2 convention), an index, and its row-level-security policy.

**What an account is (domain context):** An account is a **source of funds** — where money is paid *from*. E.g. "DBS Savings" (bank), "Cash wallet" (cash), "GrabPay" (other). It is a **label only — there is no balance, no transaction history, and no reconciliation at MVP** (domain §4). Later, envelopes and templates will optionally point at an account as their *payment source*; this table just defines the pickable list.

This is a **root table**: its only foreign key points at Supabase's built-in `auth.users`. It depends on no other app table, so it can be built and shipped on its own.

**How `account` differs from `category` (EF1.2):**
- It **has an enum** (`account_type`) — `category` had none. (First enum since `ledger_status` in EF1.1.)
- Its inbound FKs are **optional `SET NULL`**, not NOT-NULL `RESTRICT` — so **deleting an account is always allowed**; there is *no* "can't delete while in use" decision pending here (contrast §13.1).
- It has **no `display_order`** — accounts list by `(user_id)` alone.

---

## 2. The rules this table must enforce (and why)

Business rules → DB mechanisms (defined in §5/§6). The "why" is here so the mechanisms make sense.

1. **A user only ever sees and writes their own accounts.** Enforced via row-level security, so a forgotten `WHERE user_id = …` can never leak another user's accounts.
2. **`type` is one of a fixed set.** An account is `bank`, `cash`, or `other` — nothing else. → a native Postgres `ENUM` (`account_type`) rejects invalid values at the DB boundary.
3. **`updated_at` always reflects the last edit.** An account is editable (rename, change type). → the `moddatetime` `BEFORE UPDATE` trigger established in EF1.2 sets it on every update; `created_at` never changes.
4. **Deleting an account (the auth user) removes its finance accounts.** → `user_id` FK `ON DELETE CASCADE`.

> **NOT this table's job** — do not encode these here:
> - **Any balance, opening amount, or running total.** Accounts are labels only at MVP (domain §4). Do not add a `balance` column.
> - **Any transaction / ledger-of-movements per account.** Out of scope entirely.
> - **Blocking deletion of an account that's in use.** Not needed — the child FKs are `SET NULL` (deleting an account simply clears the reference on templates/envelopes). See §3.
> - **Name uniqueness or non-empty validation.** No `UNIQUE(user_id, name)` and no non-empty CHECK are specified; duplicate/blank names are currently allowed at the DB. Flagged for a decision in §13.

---

## 3. Relationships (verified against the full DB design)

`account` is an **optional reference**: templates and envelopes *may* point at one as their payment source.

**Outbound FK — created in THIS migration:**

| Column | References | On delete | Why |
|---|---|---|---|
| `user_id` | `auth.users(id)` (Supabase-managed) | `CASCADE` | Ownership. Deleting an account removes all their finance data. |

**Inbound FKs — created by LATER tickets (do NOT create them here), but you must know `account.id` will be a foreign-key target:**

| Future table | Column | Null | On delete | Relationship |
|---|---|---|---|---|
| `template` | `default_payment_source_id → account.id` | NULL | **`SET NULL`** | a template's default payment source (optional) |
| `envelope` | `payment_source_id → account.id` | NULL | **`SET NULL`** | an envelope's payment source (optional) |

**Implications for this ticket:**
- `id` must be a stable, single-column primary key (it is — `uuid` PK). Nothing else to do now.
- **Deleting an account is unconditionally allowed.** Because the child FKs are `SET NULL`, removing an account simply clears `payment_source_id` / `default_payment_source_id` on any template/envelope that referenced it. **There is no category-style "RESTRICT vs reassign" decision to make** — that contrast with EF1.2 is intentional.
- Those child FKs are created in the `template` / `envelope` tickets, **not here.**
- No other table in the DB design references `account`.

---

## 4. Columns

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. Opaque random UUID. `gen_random_uuid()` is built into Supabase Postgres. |
| `user_id` | `uuid` | NOT NULL | `auth.uid()` | Owner. FK → `auth.users(id)` `ON DELETE CASCADE`. Filled automatically from the request JWT. Drives RLS. (See `service_role` note in §6.) |
| `name` | `varchar(80)` | NOT NULL | — | The account label, e.g. "DBS Savings". |
| `type` | `account_type` | NOT NULL | — | `bank` \| `cash` \| `other`. No default — the user picks one on create. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | When the account was created. Never changes. |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Last-modified stamp. Kept current by the trigger in §6, not by app code. |

**Implementation notes:**
- **Table name is singular** (`account`); columns are `snake_case`.
- **`type` has no default** (unlike `ledger_status` which defaulted to `'ongoing'`). There's no sensible default source-of-funds — the user chooses. App/UI must supply `type` on insert.
- **No balance column** — by design (domain §4). Do not add one.
- The SDK maps `account_type` to a TS union type once `database.types.ts` is regenerated (§10).

---

## 5. Enum, index (no CHECK constraints)

Use these **exact names** — later tickets and the verification tests reference them.

**Enum:** `account_type` with members `bank`, `cash`, `other`. Used by this table (and, later, soft via the payment-source FKs).

| Name | Kind | Definition | Rule (§2) |
|---|---|---|---|
| `idx_account_user` | INDEX | `(user_id)` | #1 RLS predicate + per-user listing |

- **No standalone extra `user_id` index** beyond `idx_account_user` — it *is* the `user_id` index.
- **No CHECK constraints** are specified for `account` in the DB design; the enum enforces valid `type`. (Name-non-empty / uniqueness flagged in §13.)
- `'other'` is the deliberate catch-all for MVP. Adding members later is an online `ALTER TYPE account_type ADD VALUE …` (§13.4).

---

## 6. `updated_at` trigger + Row-Level Security

### 6.1 `updated_at` auto-maintenance (reuse EF1.2 convention)

`account` carries `updated_at`, so it reuses the module-wide pattern set in EF1.2: the Supabase-bundled **`moddatetime`** extension + a per-table `BEFORE UPDATE` trigger that stamps `updated_at = now()`.

- `create extension if not exists moddatetime` is **idempotent** — harmless to include again; the extension already exists from EF1.2.
- This table gets its **own** trigger, `set_account_updated_at`, bound to its `updated_at` column.

### 6.2 Row-Level Security

Enable RLS and add one owner-isolation policy. Wrap `auth.uid()` in `(select …)` so Postgres evaluates it once per statement (fast), not per row.

- `USING` gates reads/updates/deletes to owned rows; `WITH CHECK` blocks inserting or reassigning a row to another user.
- `TO authenticated` scopes it to logged-in users; `anon` has no policy → denied.
- **`service_role` bypasses RLS** (migrations/seeds run this way). Because `user_id` defaults to `auth.uid()` — NULL when there's no logged-in user — a `service_role` insert that omits `user_id` will **fail the NOT NULL on purpose**. Seeds/jobs must set `user_id` explicitly.
- `auth.users` is **managed by Supabase** — reference it, never create or migrate it.

(Exact SQL is in the migration in §8.)

---

## 7. Adding the migration (additive — the package already exists)

The `@nafios/db` package, the Supabase CLI setup (EF1.1), and the `moddatetime` extension (EF1.2) already exist. This ticket only **adds a migration and a test file** — no `supabase init`, no new package, no new scripts.

### 7.1 Files touched

```
packages/db/
├── supabase/
│   └── migrations/
│       └── 20260627030000_finance_create_account.sql   # NEW — this ticket
├── src/
│   └── database.types.ts                                # REGENERATED (do not hand-edit)
└── tests/
    └── integration/
        └── account.test.ts                              # NEW — the §11 matrix as SDK tests
```

> Migration filename is module-namespaced and **timestamp-ordered after** EF1.2's category migration. `account` is an independent root table, so relative order doesn't matter for FKs — but keep timestamps monotonic.

### 7.2 Commands

```bash
# from packages/db/
supabase migration new finance_create_account   # creates the timestamped SQL file
# paste the SQL from §8 into that file, then:
supabase db reset                                # rebuild local DB: ALL migrations + seed
bun run db:types                                 # regenerate src/database.types.ts for the SDK
bun test                                         # run the §11 integration tests
```

### 7.3 Standards / hard rules (unchanged)

- **Migrations are immutable once merged/applied.** Never edit an applied migration — add a new one. The §9 rollback is for local iteration only.
- **`supabase db reset` must succeed from scratch** (clean DB → all migrations → seed) — the local equivalent of CI.
- **Regenerate `database.types.ts`** whenever the schema changes; commit it (generated, do not hand-edit).
- **Staging:** migrations are pushed directly to the `staging` Supabase project from local dev with `supabase db push` — there is **no CI/CD migration pipeline** in this epic. Run `bun run check` locally first; this migration must apply cleanly to `staging`.

---

## 8. The migration SQL (`20260627030000_finance_create_account.sql`)

```sql
-- updated_at auto-maintenance — reuses the module convention from EF1.2 (idempotent).
create extension if not exists moddatetime schema extensions;

-- account source-of-funds kinds
create type account_type as enum ('bank', 'cash', 'other');

-- account: a source of funds (label only — no balance tracking at MVP, domain §4).
create table account (
  id         uuid         primary key default gen_random_uuid(),
  user_id    uuid         not null default auth.uid()
                            references auth.users (id) on delete cascade,
  name       varchar(80)  not null,
  type       account_type not null,
  created_at timestamptz  not null default now(),
  updated_at timestamptz  not null default now()
);

-- per-user listing (also serves the RLS user_id predicate)
create index idx_account_user on account (user_id);

-- keep updated_at current on every UPDATE (cannot be forgotten by app code)
create trigger set_account_updated_at
  before update on account
  for each row
  execute function extensions.moddatetime (updated_at);

-- row-level security: a user sees/writes only their own accounts
alter table account enable row level security;

create policy owner_all on account
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

---

## 9. Rollback (local iteration only)

Applied migrations are immutable; this is for re-running locally before merge. Prefer `supabase db reset`.

```sql
drop table if exists account;          -- drops its index, trigger & policy too
drop type  if exists account_type;
-- leave the moddatetime extension in place; other tables reuse it.
```

---

## 10. SDK type generation

After the migration applies, run `bun run db:types` (`supabase gen types typescript --local`). This refreshes `src/database.types.ts`, typing `account` rows and the `account_type` enum for the Supabase JS SDK — so the later `template`/`envelope` tickets reference `account.id` type-safely. No hand-written types.

---

## 11. Verification matrix

Run after `supabase db reset`. RLS rows need two real users — reuse the two test users seeded by EF1.1's `seed.sql`, then impersonate in `psql`:

```sql
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"00000000-0000-0000-0000-00000000000a"}';
reset role;   -- between cases
```

| # | Action | Expected |
|---|---|---|
| 1 | Insert valid row (`name='DBS Savings'`, `type='bank'`) | ✅ inserts |
| 2 | Insert `type='cash'`; insert `type='other'` | ✅ both insert |
| 3 | Insert `type='credit'` (not an enum member) | ❌ invalid enum value |
| 4 | Insert with `name=NULL` | ❌ NOT NULL violation |
| 5 | Insert with `type=NULL` (omitted, no default) | ❌ NOT NULL violation |
| 6 | Insert two accounts with the **same** `(user_id, name)` | ✅ both (no uniqueness — documents the §13 decision) |
| 7 | `UPDATE` a row's `name` (or `type`) | ✅ `updated_at` advances; `created_at` unchanged (trigger works) |
| 8 | As user A, `select` an account owned by user B | 0 rows (RLS) |
| 9 | As user A, `insert` with `user_id` = user B | ❌ RLS `WITH CHECK` |
| 10 | Delete the auth user; check their accounts | gone (`ON DELETE CASCADE`) |
| 11 | `supabase db reset` from scratch (all migrations + seed) | ✅ clean apply |

Recommended: encode cases 1–10 as SDK-driven integration tests in `tests/integration/account.test.ts` using the two test users, so `bun run check` enforces them.

---

## 12. Acceptance criteria

- [ ] **AC1** — One new migration `20260627030000_finance_create_account.sql` is added to the **existing** `@nafios/db` package (no new package, no re-bootstrap).
- [ ] **AC2** — `account_type` enum (`bank`, `cash`, `other`) and `account` table exist with the exact columns, types, nullability, and defaults in §4 (`type` has **no** default; **no** balance/extra columns).
- [ ] **AC3** — `idx_account_user` index exists on `(user_id)` with that exact name.
- [ ] **AC4** — `updated_at` is auto-maintained by the `set_account_updated_at` `BEFORE UPDATE` trigger (moddatetime), reusing the EF1.2 convention; `created_at` is never changed by it.
- [ ] **AC5** — RLS is enabled and the `owner_all` policy exists, using the `(select auth.uid())` form (§6.2).
- [ ] **AC6** — `user_id` FK targets `auth.users(id)` with `ON DELETE CASCADE`; `auth.users` is referenced only, never created. **No inbound FKs** (template/envelope payment-source) created here.
- [ ] **AC7** — `supabase db reset` applies cleanly from scratch locally, and `supabase db push` applies to `staging`.
- [ ] **AC8** — `src/database.types.ts` is regenerated for the SDK and committed (not hand-edited).
- [ ] **AC9** — Every row of the §11 verification matrix behaves as specified.
- [ ] **AC10** — No balance, transaction, uniqueness, or non-empty CHECK was added (§2 "NOT this table's job").

---

## 13. Notes / decisions to confirm before the next tables

1. **No category-style delete decision (contrast EF1.2).** Account-delete is unconditionally allowed; the child FKs (`template.default_payment_source_id`, `envelope.payment_source_id`) are `SET NULL`, created in their own tickets. Nothing to decide here — recorded so the asymmetry with `category` (RESTRICT) is explicit.
2. **`updated_at` convention reused.** This is the **second** table on the EF1.2 `moddatetime` pattern. Keep applying it identically (`account` done; next `person`, then `template`, `envelope`, `carry_over`, `finance_settings`).
3. **Name uniqueness per user.** Not enforced today — `(user_id, name)` duplicates allowed (matrix #6). Decide whether to add `UNIQUE(user_id, name)` before account CRUD (E3.x).
4. **`account_type` extensibility.** `bank` / `cash` / `other` cover MVP, with `other` as the catch-all. Adding a member later is an online `ALTER TYPE account_type ADD VALUE …` (members can only be added, never removed). Confirm the MVP set is sufficient.
5. **Balance tracking is out of scope.** If account balances are ever wanted, that's a new spec + columns/table, not a tweak here (domain §4).

*Provenance (not required reading): the physical model and its rationale (decisions D1–D13) live in the finance DB design doc and the DBML under `finance/planning/`; account behavior is described in the finance specs under `finance/specs/` (domain §4).*

---

## Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 0.1 | 2026-06-27 | NafiOS Foundation | Initial standalone task for the `account` table: `account_type` enum, columns, index, `updated_at` trigger (reuses the EF1.2 moddatetime convention), RLS, migration SQL, verification matrix, acceptance criteria. Additive to `@nafios/db`. Notes the SET-NULL inbound FKs (no category-style delete decision). |
