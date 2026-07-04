# EF1.10 — Design & create the `finance_settings` table

> - `M0`
> - `type:feature`
> - `module:finance`
> - `area:data`
> - `P0`
> - `size:S`
> - **Epic:** EF1 — Finance Data Foundation

> **This ticket is self-contained.** Everything needed to add the migration, create the table, secure it, and verify it is in this file. Stack: **Supabase Postgres**, schema via the **Supabase CLI** (raw SQL migrations), runtime access via the **Supabase JS SDK**. **No ORM / no Drizzle.**
>
> **Assumes EF1.1–EF1.2 are done** (the `@nafios/db` package + the `moddatetime` `updated_at` convention). This is a **standalone root table** — its only FK is to `auth.users`; it depends on no other app table. **This is the final table — it completes the 10-table Finance schema.** Purely additive — one new migration.

---

## 1. What you're building

Create one Postgres table, `finance_settings`, plus **two enums** (`max_capped_mode`, `max_capped_behavior`), **one CHECK constraint**, a **`UNIQUE(user_id)` singleton key**, the `updated_at` trigger, and the RLS policy.

**What this table is (domain context — D8):** Three config entities — **`DefaultOpeningBalance`**, **`MaxCappedPolicy`**, **`LedgerCreationWindow`** — collapse into **one settings row per user**. They're always read/written together at ledger-creation time, so one row beats three. `UNIQUE(user_id)` is the **singleton key**: with ownership (D12), the user *is* the singleton — exactly one settings row per owner. (This replaces the earlier "singleton boolean" trick.)

- **`default_opening_balance`** — the income figure pre-filled when opening a new month (optional).
- **`max_capped_mode` + `max_capped_value` + `max_capped_behavior`** — the user's spending-ceiling policy: a hard amount or a percentage of opening; and whether exceeding it just warns or blocks adds.
- **`lead_days`** — how many days before month start a ledger may be created (the creation window), clamped `1..7`.

---

## 2. The rules this table must enforce (and why)

1. **Exactly one settings row per user.** → `UNIQUE(user_id)` (D8). With RLS, this *is* the singleton.
2. **`lead_days` is within the allowed window.** 1–7 days. → `ck_lead_days` (`lead_days BETWEEN 1 AND 7`).
3. **Policy mode / behavior are fixed sets.** → enums `max_capped_mode`, `max_capped_behavior`.
4. **`updated_at` always reflects the last edit.** → the `moddatetime` `BEFORE UPDATE` trigger (EF1.2).
5. **Deleting the account removes its settings.** → `user_id` FK `CASCADE`.
6. **A user only ever sees/writes their own settings row.** → RLS owner-isolation policy.

> **NOT this table's job:**
> - **Applying these settings** when a ledger is created — that's the ledger-creation engine (E4.x): it reads this row to pre-fill `opening_balance`, compute the `max_capped` ceiling, and gate the creation window. This table only *stores* the config.
> - **The maxCapped 2× ceiling / amber-zone confirmation** — those live on `monthly_ledger` (CHECK) and in the domain (E4.3), not here.
> - **Seeding a default settings row** for a new user — an onboarding/seed concern (E2.5/E3); CRUD (E3.4/E3.5) patches columns of the one row.

---

## 3. Relationships (verified against the full DB design)

**FK — created in THIS migration:**

| Column | References | Null | On delete | Why |
|---|---|---|---|---|
| `user_id` | `auth.users(id)` | NOT NULL, **UNIQUE** | `CASCADE` | Ownership **and** the singleton key (one row per user). |

No inbound FKs — nothing references this table. It is an independent island.

---

## 4. Columns

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `user_id` | `uuid` | NOT NULL | `auth.uid()` | Owner **and singleton key** — `UNIQUE`. FK → `auth.users(id)` `CASCADE`. Drives RLS. |
| `default_opening_balance` | `numeric(12,2)` | NULL | — | `DefaultOpeningBalance` — pre-fill for a new month's income. Optional (NULL = none set). |
| `max_capped_mode` | `max_capped_mode` | NOT NULL | `'hard_amount'` | `hard_amount` \| `percentage_of_opening`. |
| `max_capped_value` | `numeric(12,2)` | NULL | — | The ceiling value: an amount (hard) or a percentage (of opening). Optional. |
| `max_capped_behavior` | `max_capped_behavior` | NOT NULL | `'warn_only'` | `warn_only` \| `block_add` — what happens when the ceiling is exceeded. |
| `lead_days` | `integer` | NOT NULL | `7` | `LedgerCreationWindow` — days before month start a ledger may open. `1..7` (CHECK). |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Created time. |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Last-modified stamp, maintained by the §6 trigger. |

**Implementation notes:**
- **`UNIQUE(user_id)` is the heart of D8** — it guarantees the one-row-per-user invariant at the DB; CRUD upserts/patches that single row.
- `default_opening_balance` and `max_capped_value` are **nullable** (a user may not have configured a policy yet); `max_capped_mode`/`max_capped_behavior` have sensible defaults so the row is always usable.
- Money columns `numeric(12,2)` — read as **strings** through the SDK.

---

## 5. Enums, constraint & index

**Enums:**
- `max_capped_mode` — `hard_amount`, `percentage_of_opening`.
- `max_capped_behavior` — `warn_only`, `block_add`.

| Name | Kind | Definition | Rule (§2) |
|---|---|---|---|
| `ck_lead_days` | CHECK | `lead_days BETWEEN 1 AND 7` | #2 creation window |
| `uq_finance_settings_user` | UNIQUE | `(user_id)` | #1 one settings row per user (D8) |

- **No separate `user_id` index** — `uq_finance_settings_user` already provides it (covers RLS + lookup).

---

## 6. `updated_at` trigger + Row-Level Security

### 6.1 `updated_at` auto-maintenance (reuse EF1.2 convention)

Reuses the module-wide pattern: the **`moddatetime`** extension + a per-table `BEFORE UPDATE` trigger (`set_finance_settings_updated_at`). `create extension if not exists moddatetime` is idempotent.

### 6.2 Row-Level Security

Enable RLS + one `owner_all` policy with the `(select auth.uid())` form, `TO authenticated`. `USING` + `WITH CHECK` gate to owned rows. `service_role` bypasses RLS (seeds set `user_id` explicitly). `auth.users` is referenced, not created.

(Exact SQL in §8.)

---

## 7. Adding the migration (additive)

Adds `supabase/migrations/20260627100000_finance_create_finance_settings.sql` + `tests/integration/finance-settings.test.ts`; regenerates `database.types.ts`. Standalone root table — needs only the package + `moddatetime` (EF1.1–1.2). Commands and hard rules as in EF1.1 §7 (`db reset` clean from scratch, regenerate+commit types, direct `db push` to `staging` from local dev — no CI/CD pipeline).

---

## 8. The migration SQL (`20260627100000_finance_create_finance_settings.sql`)

```sql
-- updated_at auto-maintenance — reuses the module convention from EF1.2 (idempotent).
create extension if not exists moddatetime schema extensions;

-- maxCapped policy enums
create type max_capped_mode     as enum ('hard_amount', 'percentage_of_opening');
create type max_capped_behavior as enum ('warn_only', 'block_add');

-- finance_settings: one config row per user (D8). UNIQUE(user_id) is the singleton key.
create table finance_settings (
  id                      uuid                primary key default gen_random_uuid(),
  user_id                 uuid                not null default auth.uid()
                                                references auth.users (id) on delete cascade,
  default_opening_balance numeric(12,2),
  max_capped_mode         max_capped_mode     not null default 'hard_amount',
  max_capped_value        numeric(12,2),
  max_capped_behavior     max_capped_behavior not null default 'warn_only',
  lead_days               integer             not null default 7,
  created_at              timestamptz         not null default now(),
  updated_at              timestamptz         not null default now(),

  constraint uq_finance_settings_user unique (user_id),
  constraint ck_lead_days             check (lead_days between 1 and 7)
);

-- keep updated_at current on every UPDATE
create trigger set_finance_settings_updated_at
  before update on finance_settings
  for each row
  execute function extensions.moddatetime (updated_at);

-- row-level security: a user sees/writes only their own settings row
alter table finance_settings enable row level security;

create policy owner_all on finance_settings
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

---

## 9. Rollback (local iteration only)

```sql
drop table if exists finance_settings;        -- drops its unique index, trigger & policy too
drop type  if exists max_capped_behavior;
drop type  if exists max_capped_mode;
-- leave the moddatetime extension in place.
```

---

## 10. SDK type generation

Run `bun run db:types` after applying. Types `finance_settings` rows + both enums for the SDK so the ledger-creation engine (E4.x) and config CRUD (E3.4/E3.5) read/patch the one row type-safely.

---

## 11. Verification matrix

Setup: reuse EF1.1's two seed users.

```sql
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"00000000-0000-0000-0000-00000000000a"}';
reset role;
```

| # | Action | Expected |
|---|---|---|
| 1 | Insert minimal row (just `user_id` via `auth.uid()`) | ✅ inserts; `max_capped_mode='hard_amount'`, `max_capped_behavior='warn_only'`, `lead_days=7` |
| 2 | Insert full row (`default_opening_balance=5000.00, max_capped_mode='percentage_of_opening', max_capped_value=90.00, max_capped_behavior='block_add', lead_days=3`) for a **second** user | ✅ inserts |
| 3 | Insert a **second** row for the **same** user | ❌ `uq_finance_settings_user` (singleton) |
| 4 | Insert with `lead_days=0` or `lead_days=8` | ❌ `ck_lead_days` |
| 5 | Insert with `max_capped_mode='soft'` (not a member) | ❌ invalid enum value |
| 6 | `UPDATE` the row's `lead_days` | ✅ `updated_at` advances; `created_at` unchanged (trigger) |
| 7 | As user A, `select`/`insert` a settings row owned by user B | 0 rows / ❌ RLS `WITH CHECK` |
| 8 | Delete the auth user; check their settings | gone (`CASCADE`) |
| 9 | `supabase db reset` from scratch | ✅ clean apply |

Recommended: encode 1–8 as SDK tests in `tests/integration/finance-settings.test.ts`.

---

## 12. Acceptance criteria

- [ ] **AC1** — Migration `20260627100000_finance_create_finance_settings.sql` added to the existing `@nafios/db` package.
- [ ] **AC2** — `max_capped_mode` and `max_capped_behavior` enums and the `finance_settings` table exist with the exact columns/types/nullability/defaults in §4.
- [ ] **AC3** — `uq_finance_settings_user` (UNIQUE on `user_id`) and `ck_lead_days` (1..7) exist with those exact names.
- [ ] **AC4** — `user_id` FK → `auth.users(id)` `CASCADE`; `updated_at` maintained by `set_finance_settings_updated_at` (moddatetime); `created_at` never changed by it.
- [ ] **AC5** — RLS enabled + `owner_all` policy with `(select auth.uid())`.
- [ ] **AC6** — `supabase db reset` clean from scratch; `db push` to `staging`; `database.types.ts` regenerated + committed.
- [ ] **AC7** — Every §11 case behaves as specified.
- [ ] **AC8** — **Schema complete:** with this migration, all 10 Finance tables and their enums exist; a full `supabase db reset` builds the entire Finance schema from scratch.

---

## 13. Notes / decisions to confirm

1. **Singleton via `UNIQUE(user_id)` (D8).** Confirmed approach (replaces the old `singleton boolean`). CRUD should **upsert** on `user_id` so a user always ends with exactly one row.
2. **`max_capped_value` not conditionally required.** It's nullable regardless of `max_capped_mode`. Optionally add a CHECK requiring it when a policy is "active", or a range check per mode (e.g. percentage `0..100`). The design specifies none — decide before config CRUD (E3.4/E3.5).
3. **`default_opening_balance` / `max_capped_value` non-negativity.** No CHECK specified. Optionally add `>= 0`. Decide.
4. **Default-row creation.** This ticket creates no row; whether a new user gets a seeded default settings row (or the app lazily upserts on first ledger creation) is an onboarding decision (E2.5/E3).
5. **`updated_at` convention reused** — 6th and final table on the EF1.2 `moddatetime` pattern.

> **EF1 schema status after this ticket:** all 10 tables done — `monthly_ledger` (EF1.1), `category` (EF1.2), `account` (EF1.3), `person` (EF1.4), `template` (EF1.5), `envelope` (EF1.6), `carry_over` (EF1.7), `ledger_settlement_summary` (EF1.8), `opening_balance_adjustment` (EF1.9), `finance_settings` (EF1.10). Remaining EF1 epic deliverables (per `EF1.md`) are **non-table**: pushing the migrations directly to `staging` from local dev (`supabase db push` — no CI/CD pipeline), the seed script (E2.5), and the ERD/DBML docs.

*Provenance: D8 + the `ck_lead_days` constraint in `finance-db-design.md` §4; config behavior in `finance/specs/` (domain config entities).*

---

## Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 0.1 | 2026-06-27 | NafiOS Foundation | Initial standalone task for `finance_settings` (D8 one-row-per-user config): `max_capped_mode` + `max_capped_behavior` enums, columns (DefaultOpeningBalance / MaxCappedPolicy / LedgerCreationWindow), `ck_lead_days` (1..7), `UNIQUE(user_id)` singleton key, `updated_at` trigger, RLS. Final table — completes the 10-table Finance schema. |
