# EF1.2 — Design & create the `category` table

> - `M0`
> - `type:feature`
> - `module:finance`
> - `area:data`
> - `P0`
> - `size:S`
> - **Epic:** EF1 — Finance Data Foundation

> **This ticket is self-contained.** Everything needed to add the migration, create the table, secure it, and verify it is in this file. No other document is required. Stack: **Supabase Postgres**, schema managed by the **Supabase CLI** (raw SQL migrations), runtime data access via the **Supabase JS SDK** (`@supabase/supabase-js`). **No ORM / no Drizzle.**
>
> **Assumes EF1.1 is done:** the `@nafios/db` package and the Supabase migration system were bootstrapped by the `monthly_ledger` ticket (EF1.1). This ticket is **purely additive** — one new migration in that existing package. (If you are starting cold, do the one-time bootstrap from EF1.1 §7 first.)

---

## 1. What you're building

Create one Postgres table, `category`, plus its index, an `updated_at` auto-maintenance trigger, and its row-level-security policy. There is **no enum** for this table.

This ticket also **establishes a module-wide convention**: how `updated_at` stays current. `monthly_ledger` (EF1.1) had no `updated_at`; `category` is the **first table that carries one**, so the chosen mechanism here (a `moddatetime` trigger — §6) becomes the pattern every later table with `updated_at` reuses. See the decision flag in §13.

**What a category is (domain context):** A category is a **user-defined grouping label** for envelopes and templates — e.g. "Housing", "Transport", "Groceries", "Savings". It carries **no priority, budget, or payment semantics** — it is purely a label with a user-controlled sort position (`display_order`) and an optional UI `color` (domain §3). Later, every envelope and every template will belong to **exactly one** category (a NOT NULL FK on *those* tables — built in their own tickets, not here).

This is a **root table**: its only foreign key points at Supabase's built-in `auth.users`. It depends on no other app table, so it can be built and shipped on its own.

---

## 2. The rules this table must enforce (and why)

Business rules → DB mechanisms (defined in §5/§6). The "why" is here so the mechanisms make sense.

1. **A user only ever sees and writes their own categories.** Enforced in the database via row-level security, so a forgotten `WHERE user_id = …` in app code can never leak another user's categories.
2. **`updated_at` always reflects the last edit.** A category is editable (rename, recolor, reorder), so the row needs a last-modified stamp that **cannot be forgotten by app code**. → a `BEFORE UPDATE` trigger sets it on every update; `created_at` never changes.
3. **Categories sort by a user-controlled order.** Each user arranges their own category list. → `display_order` column (default `0`) + an index leading with `user_id` so the per-user, ordered list query is cheap.
4. **Deleting an account removes its categories.** → `user_id` FK `ON DELETE CASCADE`.

> **NOT this table's job** — do not encode these here; they live in later tickets / application code:
> - **Blocking deletion of a category that's still in use.** That guard is an `ON DELETE RESTRICT` FK that lives on the **child** tables (`template.category_id`, `envelope.category_id`), created in *their* tickets — not on `category`. The exact policy (RESTRICT vs reassign-to-default) is still an open design decision — see §3 and §13.
> - **Seeding default categories** for a new user (a seed/onboarding concern — E2.5 / E3), not table creation.
> - **Name uniqueness or non-empty validation.** No `UNIQUE(user_id, name)` and no non-empty CHECK are specified in the design today; duplicate or blank names are currently allowed at the DB. Flagged for a decision in §13 — do not invent it here.
> - **Any priority / budget / payment semantics.** Categories are pure grouping labels (domain §3). Do not add such columns.

---

## 3. Relationships (verified against the full DB design)

`category` is a **reference hub**: many envelopes and templates will point at it. Get its role right now so those later tables attach cleanly.

**Outbound FK — created in THIS migration:**

| Column | References | On delete | Why |
|---|---|---|---|
| `user_id` | `auth.users(id)` (Supabase-managed) | `CASCADE` | Ownership. Deleting an account removes all their finance data. |

**Inbound FKs — created by LATER tickets (do NOT create them here), but you must know `category.id` will be a foreign-key target:**

| Future table | Column | Null | On delete | Relationship |
|---|---|---|---|---|
| `template` | `category_id → category.id` | **NOT NULL** | **`RESTRICT`** (tentative) | every template has exactly one category |
| `envelope` | `category_id → category.id` | **NOT NULL** | **`RESTRICT`** (tentative) | every envelope has exactly one category |

**Implications for this ticket:**
- `id` must be a stable, single-column primary key (it is — `uuid` PK). Nothing else to do now.
- **The `RESTRICT` on the child FKs is what will make a category "un-deletable while in use."** It is created in the `template` / `envelope` tickets, **not here.** This ticket does not — and must not — encode that behavior.
- **Decision to lock before the `template`/`envelope` tickets (DB-design open question #1):** category-delete behavior is *RESTRICT* (block delete while referenced) **vs** *reassign-to-default* (move children to a fallback category, then delete). The design currently leans `RESTRICT`. This ticket is unaffected either way — but the call must be made before those child tables are built. Flagged in §13 so it isn't discovered late.
- No other table in the DB design references `category`.

---

## 4. Columns

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. Random UUID — opaque, doesn't leak row counts. `gen_random_uuid()` is built into Supabase Postgres (no extension). |
| `user_id` | `uuid` | NOT NULL | `auth.uid()` | Owner. FK → `auth.users(id)` `ON DELETE CASCADE`. `auth.uid()` reads the logged-in user's id from the request JWT, so app inserts fill it automatically. Drives RLS. (See the `service_role` note in §6.) |
| `name` | `varchar(80)` | NOT NULL | — | The grouping label, e.g. "Housing". A short human label; 80 chars is generous headroom. |
| `display_order` | `integer` | NOT NULL | `0` | The user's chosen sort position within their own category list. New rows default to `0`. |
| `color` | `varchar(32)` | NULL | — | Optional UI color (hex like `#3b82f6` or a design-token name). Purely presentational; NULL = no color set. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | When the category was created. Never changes. |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Last-modified stamp. Kept current by the trigger in §6, not by app code. |

**Implementation notes:**
- **Table name is singular** (`category`) by schema convention; columns are `snake_case`. (The SDK-generated TS types will surface them as-is — note the plural client key will read as the table name.)
- **`category` has `updated_at`; `monthly_ledger` did not** — by design (a category is edited in place and benefits from a last-modified stamp; the ledger's editable fields don't carry one). This asymmetry is intentional and matches the DBML.
- **No enum** is introduced by this table.
- When read through the Supabase JS SDK, `varchar`/`integer`/`timestamptz` map to `string`/`number`/`string` as usual; nothing money-related here.

---

## 5. Index (no enum, no CHECK constraints)

Use this **exact name** — later tickets and the verification tests reference it.

| Name | Kind | Definition | Rule (§2) |
|---|---|---|---|
| `idx_category_user_order` | INDEX | `(user_id, display_order)` | #1 RLS predicate + #3 per-user ordered listing |

- **No standalone `user_id` index** is needed: `idx_category_user_order` leads with `user_id`, so it covers RLS filtering and the "list my categories in order" query with one index.
- **No CHECK constraints** are specified for `category` in the DB design. (Name-non-empty and name-uniqueness are deliberately *not* added here — flagged for a decision in §13.)
- **No enum.**

---

## 6. `updated_at` trigger + Row-Level Security

### 6.1 `updated_at` auto-maintenance (module convention, established here)

`category` is the first table with an `updated_at` column, so this ticket sets the pattern. Use the Supabase-bundled **`moddatetime`** extension: a `BEFORE UPDATE` trigger that stamps `updated_at = now()` on every row update. This keeps the stamp correct **even for `service_role`/SQL writes** that bypass app code — consistent with this design's "the database is the backstop" philosophy (RLS, FKs, CHECKs all live at the DB).

- `create extension if not exists moddatetime` is **idempotent** — safe to include even though future tables also need it; only the first applied migration actually creates it.
- Each table gets its **own** trigger (`set_category_updated_at`) bound to its `updated_at` column.

### 6.2 Row-Level Security

Enable RLS and add one owner-isolation policy. Wrap `auth.uid()` in `(select …)` so Postgres evaluates it once per statement (fast), not per row.

- `USING` gates reads/updates/deletes to owned rows; `WITH CHECK` blocks inserting or reassigning a row to another user.
- `TO authenticated` scopes it to logged-in users; `anon` has no policy → denied.
- **`service_role` bypasses RLS** (migrations/seeds run this way). Because `user_id` defaults to `auth.uid()` — NULL when there's no logged-in user — a `service_role` insert that omits `user_id` will **fail the NOT NULL on purpose**. Seeds/jobs must set `user_id` explicitly.
- `auth.users` is **managed by Supabase** — reference it, never create or migrate it.

(Exact SQL is in the migration in §8.)

---

## 7. Adding the migration (additive — the package already exists)

The `@nafios/db` package and the Supabase CLI setup were created in EF1.1. This ticket only **adds a migration and a test file** — no `supabase init`, no new package, no new `package.json` scripts.

### 7.1 Files touched

```
packages/db/
├── supabase/
│   └── migrations/
│       └── 20260627020000_finance_create_category.sql   # NEW — this ticket
├── src/
│   └── database.types.ts                                 # REGENERATED (do not hand-edit)
└── tests/
    └── integration/
        └── category.test.ts                              # NEW — the §9 matrix as SDK tests
```

> Migration filename is **module-namespaced** (`..._finance_create_category.sql`) and **timestamp-ordered after** EF1.1's `..._finance_create_monthly_ledger.sql`. The two are independent root tables, so relative order doesn't matter for FKs — but keep timestamps monotonic.

### 7.2 Commands

```bash
# from packages/db/
supabase migration new finance_create_category   # creates the timestamped SQL file
# paste the SQL from §8 into that file, then:
supabase db reset                                 # rebuild local DB: ALL migrations + seed
bun run db:types                                  # regenerate src/database.types.ts for the SDK
bun test                                          # run the §9 integration tests
```

### 7.3 Standards / hard rules (unchanged from EF1.1)

- **Migrations are immutable once merged/applied.** Never edit an applied migration — add a new one. The rollback in §9 is for local iteration only.
- **`supabase db reset` must succeed from scratch** (clean DB → all migrations → seed) — the local equivalent of CI.
- **Regenerate `database.types.ts`** whenever the schema changes; commit it (mark generated, do not hand-edit).
- **Staging:** migrations are pushed directly to the `staging` Supabase project from local dev with `supabase db push` — there is **no CI/CD migration pipeline** in this epic. Run `bun run check` locally first; this migration must apply cleanly to `staging`.

---

## 8. The migration SQL (`20260627020000_finance_create_category.sql`)

```sql
-- updated_at auto-maintenance (module-wide convention; established by this migration).
-- moddatetime is a Supabase-bundled extension; this is idempotent across migrations.
create extension if not exists moddatetime schema extensions;

-- category: a user-defined grouping label for envelopes & templates.
-- No priority/budget/payment semantics (domain §3). No enum. No CHECKs.
create table category (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null default auth.uid()
                              references auth.users (id) on delete cascade,
  name          varchar(80) not null,
  display_order integer     not null default 0,
  color         varchar(32),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- per-user listing in display order (also serves the RLS user_id predicate)
create index idx_category_user_order on category (user_id, display_order);

-- keep updated_at current on every UPDATE (cannot be forgotten by app code)
create trigger set_category_updated_at
  before update on category
  for each row
  execute function extensions.moddatetime (updated_at);

-- row-level security: a user sees/writes only their own categories
alter table category enable row level security;

create policy owner_all on category
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

---

## 9. Rollback (local iteration only)

Applied migrations are immutable; this is for re-running locally before merge. Prefer `supabase db reset` to rebuild from scratch.

```sql
drop table if exists category;        -- drops its index, trigger & policy too
-- leave the moddatetime extension in place; later tables reuse it.
```

---

## 10. SDK type generation

After the migration applies, run `bun run db:types` (`supabase gen types typescript --local`). This refreshes `src/database.types.ts`, giving the Supabase JS SDK full typing for `category` rows — so every later ticket (and the `template`/`envelope` tickets that reference `category.id`) queries this table type-safely through `@supabase/supabase-js`. No hand-written types.

---

## 11. Verification matrix

Run after `supabase db reset`. RLS rows need two real users — reuse the two test users seeded into `auth.users` by EF1.1's `seed.sql` (inserted as the `postgres`/service role, which bypasses RLS), then impersonate in `psql`:

```sql
-- impersonate a user (so auth.uid() resolves to them)
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"00000000-0000-0000-0000-00000000000a"}';
-- reset to superuser between cases:
reset role;
```

| # | Action | Expected |
|---|---|---|
| 1 | Insert valid row (`name='Housing'`, `display_order=1`, `color='#3b82f6'`) | ✅ inserts |
| 2 | Insert with only `name='Groceries'` (omit `display_order`, `color`) | ✅ inserts; `display_order=0`, `color=NULL` |
| 3 | Insert with `name=NULL` | ❌ NOT NULL violation |
| 4 | Insert two categories with the **same** `(user_id, name)` | ✅ both (no uniqueness enforced — documents the §13 decision) |
| 5 | `UPDATE` a row's `name` (or `display_order`) | ✅ `updated_at` advances; `created_at` unchanged (trigger works) |
| 6 | As user A, `select` a category owned by user B | 0 rows (RLS) |
| 7 | As user A, `insert` with `user_id` = user B | ❌ RLS `WITH CHECK` |
| 8 | Delete the auth user; check their categories | gone (`ON DELETE CASCADE`) |
| 9 | `supabase db reset` from scratch (all migrations + seed) | ✅ clean apply |

Recommended: encode cases 1–8 as SDK-driven integration tests in `tests/integration/category.test.ts` using the two test users via the Supabase client, so `bun run check` enforces them.

---

## 12. Acceptance criteria

- [ ] **AC1** — One new migration `20260627020000_finance_create_category.sql` is added to the **existing** `@nafios/db` package (no new package, no re-bootstrap).
- [ ] **AC2** — `category` table exists with the exact columns, types, nullability, and defaults in §4 — including `updated_at` (and **no** enum, **no** extra/semantic columns).
- [ ] **AC3** — `idx_category_user_order` index exists on `(user_id, display_order)` with that exact name.
- [ ] **AC4** — `updated_at` is auto-maintained by the `set_category_updated_at` `BEFORE UPDATE` trigger (moddatetime); `created_at` is never changed by it.
- [ ] **AC5** — RLS is enabled and the `owner_all` policy exists, using the `(select auth.uid())` form (§6.2).
- [ ] **AC6** — `user_id` FK targets `auth.users(id)` with `ON DELETE CASCADE`; `auth.users` is referenced only, never created. **No inbound FKs** (template/envelope `category_id`) created here.
- [ ] **AC7** — `supabase db reset` applies cleanly from scratch locally, and `supabase db push` applies to `staging`.
- [ ] **AC8** — `src/database.types.ts` is regenerated for the SDK and committed (not hand-edited).
- [ ] **AC9** — Every row of the §11 verification matrix behaves as specified.
- [ ] **AC10** — No priority/budget/payment semantics, no uniqueness, no non-empty CHECK were added (§2 "NOT this table's job").

---

## 13. Notes / decisions to confirm before the next tables

1. **Category-delete behavior (DB-design open question #1).** Default leaning is `ON DELETE RESTRICT` on the child FKs (`template.category_id`, `envelope.category_id`) — a category can't be deleted while any template/envelope references it. Alternative: reassign-to-default on delete. **This ticket creates neither child FK, so it doesn't lock the choice — but the call must be made before the `template`/`envelope` tickets.**
2. **`updated_at` maintenance convention (DB-design open question #4).** This ticket **establishes** the convention: a `moddatetime` `BEFORE UPDATE` trigger (the old "Drizzle `$onUpdate`" option is moot — no ORM). Every later table with `updated_at` (`category` done, then `account`, `person`, `template`, `envelope`, `carry_over`, `finance_settings`) reuses the same extension + a per-table trigger. **Confirm this is the module-wide approach** before the next table so the pattern is applied consistently.
3. **Name uniqueness per user.** Not enforced today — `(user_id, name)` duplicates are allowed (matrix #4). Decide whether to add `UNIQUE(user_id, name)` (and whether case-insensitive) before category CRUD (E3.1).
4. **Name non-empty CHECK.** Not in the design. Optionally add `check (char_length(btrim(name)) >= 1)` to reject blank/whitespace names. Decide alongside #3.
5. **Default categories seeding.** Out of scope here; a new-user onboarding/seed concern (E2.5 / E3). Track separately.

*Provenance (not required reading): the physical model and its rationale (decisions D1–D13) live in the finance DB design doc and the DBML under `finance/planning/`; the category behavior is described in the finance specs under `finance/specs/` (domain §3).*

---

## Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 0.1 | 2026-06-27 | NafiOS Foundation | Initial standalone task for the `category` table: columns, index, `updated_at` trigger (establishes the module-wide moddatetime convention), RLS, migration SQL, verification matrix, acceptance criteria. Additive to the `@nafios/db` package bootstrapped in EF1.1. Flags the category-delete decision the future template/envelope tickets depend on. |
