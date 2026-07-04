# EF1.1 — Design & create the `monthly_ledger` table

> - `M0`
> - `type:feature`
> - `module:finance`
> - `area:data`
> - `P0`
> - `size:S`
> - **Epic:** EF1 — Finance Data Foundation

> **This ticket is self-contained.** Everything needed to set up migrations, create the table, secure it, and verify it is in this file. No other document is required. Stack: **Supabase Postgres**, schema managed by the **Supabase CLI** (raw SQL migrations), runtime data access via the **Supabase JS SDK** (`@supabase/supabase-js`). **No ORM / no Drizzle.**

---

## 1. What you're building

Create one Postgres table, `monthly_ledger`, plus its enum, constraints, indexes, and row-level-security policy. Because this is the **first migration in the repo**, the ticket also bootstraps the Supabase migration system (one-time setup in §7).

**What a monthly ledger is (domain context):** Finance is a monthly cashflow app. A user works one **month** at a time. Each month is a "ledger" — a row in this table — recording: the month it covers, how much income the user has to spend (`opening_balance`), the spending ceiling they set for themselves (`max_capped`), and where the month is in its lifecycle (`status`). The line items (envelopes) and the calculated figures (committed total, headroom) are **other tables / computed at read time** — not part of this ticket. You are building only the header row for a month.

This is a **root table**: its only foreign key points at Supabase's built-in `auth.users`. It depends on no other app table, so it can be built and shipped on its own.

---

## 2. The rules this table must enforce (and why)

Business rules → DB constraints (defined in §5). The "why" is here so the constraints make sense.

1. **One ledger per month, per user.** A user can never have two ledgers for the same calendar month. → unique `(user_id, month)`.
2. **At most one "ongoing" ledger, per user.** A user has exactly one active working month; older months sit in `reconciling` or `settled`. → partial unique index on `(user_id) WHERE status = 'ongoing'`.
3. **A month is stored as its first day.** `2026-01` is stored as the date `2026-01-01`, which makes month ordering and math trivial. → CHECK that the day is always 1.
4. **The ceiling can't exceed 2× income.** `max_capped` may legitimately sit a bit above income (spending from savings), but more than **double** income is almost always a typo (misplaced decimal). Hard-blocked at the DB, no override. → CHECK `max_capped <= 2 * opening_balance`.
5. **No negative money.** Income and ceiling are both `>= 0` ($0 allowed). → CHECK.
6. **A settle timestamp exists exactly when the month is settled.** `settled_at` is set if and only if `status = 'settled'`. → CHECK.
7. **A user only ever sees and writes their own ledgers.** Enforced in the database via row-level security, so a forgotten `WHERE user_id = …` in app code can never leak another user's data.

> **NOT this table's job** — do not encode these; they live in later application/domain code:
> - Confirming with the user when `max_capped` exceeds income but is under 2× (a UI confirmation flow).
> - Auto-moving the previous month from `ongoing` to `reconciling` when a new month opens.
> - Blocking edits once a month is `settled` (Postgres can't "freeze" a row; app code enforces it).
> - Choosing which month a user may open, or auto-creating months.
> - Calculating any spending/headroom metrics — they are computed on read and **never stored**, so there are deliberately **no** columns for them.

---

## 3. Relationships (verified against the full DB design)

`monthly_ledger` is a hub. Get its key role right now so later tables attach cleanly.

**Outbound FK — created in THIS migration:**

| Column | References | On delete | Why |
|---|---|---|---|
| `user_id` | `auth.users(id)` (Supabase-managed) | `CASCADE` | Ownership. Deleting an account removes all their finance data. |

**Inbound FKs — created by LATER tickets (do NOT create them here), but you must know `monthly_ledger.id` will be a foreign-key target:**

| Future table | Column | On delete | Relationship |
|---|---|---|---|
| `envelope` | `ledger_id → monthly_ledger.id` | `CASCADE` | many envelopes per ledger |
| `ledger_settlement_summary` | `ledger_id → monthly_ledger.id` (also its PK) | `CASCADE` | **1:1**; row exists only for `settled` ledgers |
| `opening_balance_adjustment` | `ledger_id → monthly_ledger.id` | `CASCADE` | audit log of opening-balance edits |

**Implications for this ticket:**
- `id` must be a stable, single-column primary key (it is — `uuid` PK). Nothing else to do now.
- **Decision to lock before the `envelope` ticket (DB-design open question #7):** to let future child tables guarantee a child can't be re-owned to a different user, the design floats a composite FK `envelope(ledger_id, user_id) → monthly_ledger(id, user_id)`. That requires a `UNIQUE (id, user_id)` on **this** table. It is cheap to add (`id` is already unique). **Default for this ticket: do NOT add it** (trust the insert path, which stamps `user_id` from `auth.uid()`), per the design leaning "MVP-minimal." If the team wants the hardening, it is a one-line addition here — see §13. Flagged so it isn't discovered late.

No other table in the DB design references `monthly_ledger`. (`carry_over` references `template`/`envelope`, not the ledger.)

---

## 4. Columns

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. Random UUID — opaque, doesn't leak row counts. `gen_random_uuid()` is built into Supabase Postgres (no extension). |
| `user_id` | `uuid` | NOT NULL | `auth.uid()` | Owner. FK → `auth.users(id)` `ON DELETE CASCADE`. `auth.uid()` reads the logged-in user's id from the request JWT, so app inserts fill it automatically. Drives RLS. (See the `service_role` note in §6.) |
| `month` | `date` | NOT NULL | — | The month this ledger covers, pinned to the 1st (`2026-01` → `2026-01-01`). Unique per user. |
| `opening_balance` | `numeric(12,2)` | NOT NULL | — | Income the user has to allocate this month. `>= 0`. |
| `max_capped` | `numeric(12,2)` | NOT NULL | — | Self-imposed spending ceiling for the month. `>= 0` and `<= 2 * opening_balance`. |
| `status` | `ledger_status` | NOT NULL | `'ongoing'` | Lifecycle: `ongoing` (active) → `reconciling` (closing out) → `settled` (locked history). |
| `created_at` | `timestamptz` | NOT NULL | `now()` | When the ledger was created. Never changes. |
| `settled_at` | `timestamptz` | NULL | — | Set when settled; NULL otherwise. Tied to `status` by a CHECK. |

**Implementation notes:**
- **Money is `numeric(12,2)`** — never `float`/`real`, never Postgres `money`. Exact decimal arithmetic is required. `(12,2)` allows up to 9,999,999,999.99. When read through the Supabase JS SDK, `numeric` arrives as a **string** — keep it a string until a parsing layer handles it; never do money math in JS floats.
- **Table name is singular** (`monthly_ledger`) by schema convention; columns are `snake_case`. (The SDK-generated TS types will surface them as-is.)
- **No `updated_at` column** here (the ledger's editable fields change in place without a row-update stamp). Flagged for a quick confirm in §13, since some sibling tables carry one.

---

## 5. Enum, constraints & indexes

Use these **exact names** — later tickets and the verification tests reference them.

**Enum:** `ledger_status` with members `ongoing`, `reconciling`, `settled`. Used only by this table.

| Name | Kind | Definition | Rule (§2) |
|---|---|---|---|
| `ck_ledger_month_first` | CHECK | `extract(day from month) = 1` | #3 month as first-of-month |
| `uq_ledger_user_month` | UNIQUE `(user_id, month)` | — | #1 one ledger per month per user |
| `uq_one_ongoing_ledger` | partial UNIQUE INDEX | `(user_id) WHERE status = 'ongoing'` | #2 at most one `ongoing` per user |
| `ck_maxcapped_ceiling` | CHECK | `max_capped <= 2 * opening_balance` | #4 hard 2× ceiling |
| `ck_balances_nonneg` | CHECK | `opening_balance >= 0 AND max_capped >= 0` | #5 non-negative money |
| `ck_settled_at` | CHECK | `(status = 'settled') = (settled_at IS NOT NULL)` | #6 settle timestamp ↔ settled status |

No standalone `user_id` index is needed: `uq_ledger_user_month` leads with `user_id`, so it already covers RLS filtering and per-user lookups.

---

## 6. Row-Level Security

Enable RLS and add one owner-isolation policy. Wrap `auth.uid()` in `(select …)` so Postgres evaluates it once per statement (fast), not per row.

- `USING` gates reads/updates/deletes to owned rows; `WITH CHECK` blocks inserting or reassigning a row to another user.
- `TO authenticated` scopes it to logged-in users; `anon` has no policy → denied.
- **`service_role` bypasses RLS** (migrations/seeds run this way). Because `user_id` defaults to `auth.uid()` — NULL when there's no logged-in user — a `service_role` insert that omits `user_id` will **fail the NOT NULL on purpose**. Seeds/jobs must set `user_id` explicitly.
- `auth.users` is **managed by Supabase** — reference it, never create or migrate it.

(Exact policy SQL is in the migration in §8.)

---

## 7. Migration setup (one-time bootstrap — first migration in the repo)

Follows the monorepo conventions: a scoped workspace package, kebab-case files, wired into `bun run check`. Schema is owned by the Supabase CLI; runtime access uses the Supabase JS SDK.

### 7.1 Package placement

Create one shared database package (a single Supabase project backs the whole NafiOS suite, since `auth.users` is shared):

```
packages/db/                         # @nafios/db — single source of truth for the DB
├── CLAUDE.md                        # what this package is, gotchas (Supabase CLI, RLS, no ORM)
├── README.md
├── spec.md                          # 1-line: "Schema for NafiOS; migrations are the source of truth"
├── package.json                     # @nafios/db; scripts wrap the supabase CLI (below)
├── supabase/
│   ├── config.toml                  # created by `supabase init`
│   ├── migrations/
│   │   └── 20260627010000_finance_create_monthly_ledger.sql
│   └── seed.sql                     # local-dev seed (test users live here for RLS tests)
├── src/
│   ├── index.ts                     # barrel: exports the typed Supabase client (filled in later tickets)
│   └── database.types.ts            # GENERATED by `supabase gen types` — do not hand-edit
└── tests/
    └── integration/
        └── monthly-ledger.test.ts   # the §11 matrix as SDK-driven tests
```

> Migrations are **module-namespaced by filename** (`..._finance_create_monthly_ledger.sql`) for discoverability — they apply in global timestamp order. If the team prefers a different home (e.g. `services/db`), only the path changes; everything else stands.

### 7.2 `package.json` scripts (wrap the Supabase CLI)

```jsonc
{
  "name": "@nafios/db",
  "private": true,
  "scripts": {
    "db:new":   "supabase migration new",                                    // scaffold a new migration
    "db:reset": "supabase db reset",                                         // recreate local DB, apply ALL migrations + seed
    "db:push":  "supabase db push",                                          // apply pending migrations to the linked remote (staging)
    "db:types": "supabase gen types typescript --local > src/database.types.ts",
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  }
}
```

`typecheck` and `test` keys are required so the root `bun run check` (`bun --filter '*' typecheck && … test`) picks this package up.

### 7.3 First-time commands

```bash
# from packages/db/
supabase init                                  # creates supabase/config.toml (one time)
supabase migration new finance_create_monthly_ledger   # creates the timestamped SQL file
# paste the SQL from §8 into that file, then:
supabase db reset                              # apply locally (fresh DB) and run seed
bun run db:types                               # regenerate src/database.types.ts for the SDK
```

### 7.4 Standards / hard rules

- **Migrations are immutable once merged/applied.** Never edit an applied migration — add a new one. The rollback in §9 is for local iteration only.
- **`supabase db reset` must succeed from scratch** (clean DB → all migrations → seed) — this is the local equivalent of CI.
- **Regenerate `database.types.ts`** whenever the schema changes; commit it (mark generated, do not hand-edit).
- **Staging:** migrations are pushed directly to the `staging` Supabase project from local dev with `supabase db push` — there is **no CI/CD migration pipeline** in this epic. Run `bun run check` locally first; this ticket's migration must apply cleanly to `staging`.

---

## 8. The migration SQL (`20260627010000_finance_create_monthly_ledger.sql`)

```sql
-- ledger lifecycle states
create type ledger_status as enum ('ongoing', 'reconciling', 'settled');

-- monthly_ledger: one row = one calendar month of cashflow for one user
create table monthly_ledger (
  id              uuid          primary key default gen_random_uuid(),
  user_id         uuid          not null default auth.uid()
                                  references auth.users (id) on delete cascade,
  month           date          not null,
  opening_balance numeric(12,2) not null,
  max_capped      numeric(12,2) not null,
  status          ledger_status not null default 'ongoing',
  created_at      timestamptz   not null default now(),
  settled_at      timestamptz,

  constraint uq_ledger_user_month  unique (user_id, month),
  constraint ck_ledger_month_first check (extract(day from month) = 1),
  constraint ck_maxcapped_ceiling  check (max_capped <= 2 * opening_balance),
  constraint ck_balances_nonneg    check (opening_balance >= 0 and max_capped >= 0),
  constraint ck_settled_at         check ((status = 'settled') = (settled_at is not null))
);

-- at most one ongoing ledger per user
create unique index uq_one_ongoing_ledger
  on monthly_ledger (user_id) where status = 'ongoing';

-- row-level security: a user sees/writes only their own ledgers
alter table monthly_ledger enable row level security;

create policy owner_all on monthly_ledger
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

---

## 9. Rollback (local iteration only)

Applied migrations are immutable; this is for re-running locally before merge. Prefer `supabase db reset` to rebuild from scratch.

```sql
drop table if exists monthly_ledger;   -- drops its policy & indexes too
drop type  if exists ledger_status;
```

---

## 10. SDK type generation

After the migration applies, run `bun run db:types` (`supabase gen types typescript --local`). This produces `src/database.types.ts`, giving the Supabase JS SDK full typing for `monthly_ledger` rows and the `ledger_status` enum — so every later ticket queries this table type-safely through `@supabase/supabase-js`. No hand-written types.

---

## 11. Verification matrix

Run after `supabase db reset`. RLS rows need two real users — seed two into `auth.users` via `seed.sql` (as the `postgres`/service role, which bypasses RLS), then impersonate in `psql`:

```sql
-- impersonate a user (so auth.uid() resolves to them)
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"00000000-0000-0000-0000-00000000000a"}';
-- reset to superuser between cases:
reset role;
```

| # | Action | Expected |
|---|---|---|
| 1 | Insert valid row (`month=2026-01-01`, `opening=7152.35`, `max=6415.00`, `status=ongoing`) | ✅ inserts |
| 2 | Insert `month=2026-01-15` | ❌ `ck_ledger_month_first` |
| 3 | Insert second row, same `(user_id, 2026-01-01)` | ❌ `uq_ledger_user_month` |
| 4 | Insert a second `ongoing` row for the **same** user (different month) | ❌ `uq_one_ongoing_ledger` |
| 5 | `ongoing` for user A **and** `ongoing` for user B | ✅ both (per-user) |
| 6 | Same user: one `ongoing` + one `reconciling` + one `settled` | ✅ all (only `ongoing` is limited) |
| 7 | `max_capped=20000`, `opening_balance=7152.35` (> 2×) | ❌ `ck_maxcapped_ceiling` |
| 8 | `opening_balance=-1` (or `max_capped=-1`) | ❌ `ck_balances_nonneg` |
| 9 | `status=settled`, `settled_at=null` | ❌ `ck_settled_at` |
| 10 | `status=ongoing`, `settled_at=now()` | ❌ `ck_settled_at` |
| 11 | `status=settled`, `settled_at=now()` | ✅ inserts |
| 12 | As user A, `select` a row owned by user B | 0 rows (RLS) |
| 13 | As user A, `insert` with `user_id` = user B | ❌ RLS `WITH CHECK` |
| 14 | Delete the auth user; check their ledgers | gone (`ON DELETE CASCADE`) |
| 15 | `supabase db reset` from scratch (all migrations + seed) | ✅ clean apply |

Recommended: encode cases 1–14 as SDK-driven integration tests in `tests/integration/monthly-ledger.test.ts` using two test users via the Supabase client, so `bun run check` enforces them.

---

## 12. Acceptance criteria

- [ ] **AC1** — `@nafios/db` package exists with the Supabase CLI structure in §7.1, wired into `bun run check` (`typecheck` + `test`).
- [ ] **AC2** — `ledger_status` enum and `monthly_ledger` table exist with the exact columns, types, nullability, and defaults in §4.
- [ ] **AC3** — All six named constraints/indexes from §5 exist with those exact names.
- [ ] **AC4** — RLS is enabled and the `owner_all` policy exists, using the `(select auth.uid())` form (§6).
- [ ] **AC5** — `user_id` FK targets `auth.users(id)` with `ON DELETE CASCADE`; `auth.users` is referenced only, never created. No inbound FKs (envelope/summary/adjustment) created here.
- [ ] **AC6** — `supabase db reset` applies cleanly from scratch locally, and `supabase db push` applies to `staging`.
- [ ] **AC7** — `src/database.types.ts` is generated for the SDK and committed (not hand-edited).
- [ ] **AC8** — Every row of the §11 verification matrix behaves as specified.
- [ ] **AC9** — No metric, snapshot, or behavioral columns were added (§2 "NOT this table's job").

---

## 13. Notes / decisions to confirm before the next table

1. **Composite-key hardening (relationships §3).** Default here is **not** to add `unique (id, user_id)`. If the team wants future child tables (`envelope`, etc.) to use a composite FK that pins child ownership to the parent, add this line to the table now:
   ```sql
   constraint uq_ledger_id_user unique (id, user_id)
   ```
   Decide before the `envelope` ticket.
2. **`updated_at`?** This table has none (per design); some sibling tables do. Confirm the ledger needs no row-update stamp, or add `updated_at timestamptz not null default now()`. Decide before `envelope` so the pattern is consistent across tables.
3. **DB package home.** §7.1 puts the single Supabase project in `packages/db` (`@nafios/db`). Confirm this vs. an alternative (e.g. `services/db`) before the second migration lands.

*Provenance (not required reading): the physical model and its rationale (decisions D1–D13) live in the finance DB design doc and the DBML under `finance/planning/`; the ledger behavior is described in the finance specs under `finance/specs/`.*

---

## Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 0.2 | 2026-06-27 | NafiOS Foundation | Switched to Supabase-CLI SQL migrations + Supabase JS SDK (removed Drizzle). Added migration-system bootstrap (`@nafios/db` package, CLI scripts, type generation) per monorepo standards; added full Relationships section (inbound FKs + composite-key decision); removed cross-file links. |
| 0.1 | 2026-06-27 | NafiOS Foundation | Initial standalone task: columns, enum, constraints/indexes, RLS, migration SQL, verification matrix, acceptance criteria. |
