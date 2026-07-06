# EF1.5 — Design & create the `template` table

> - `M0`
> - `type:feature`
> - `module:finance`
> - `area:data`
> - `P0`
> - `size:M`
> - **Epic:** EF1 — Finance Data Foundation

> **This ticket is self-contained.** Everything needed to add the migration, create the table, secure it, and verify it is in this file. No other document is required. Stack: **Supabase Postgres**, schema managed by the **Supabase CLI** (raw SQL migrations), runtime data access via the **Supabase JS SDK** (`@supabase/supabase-js`). **No ORM / no Drizzle.**
>
> **Assumes EF1.1–EF1.4 are done:** the `@nafios/db` package + migration system (EF1.1), the `moddatetime` `updated_at` convention (EF1.2), and the **`category`, `account`, `person` tables (EF1.2–EF1.4)** all exist. **This is the first table with cross-table FKs** — those three tables must already be migrated (they have earlier timestamps, so they are). Purely additive — one new migration.

---

## 1. What you're building

Create one Postgres table, `template`, plus **two enums** (`template_type`, `recurring_template_status`), **five CHECK constraints**, **four foreign keys**, three indexes, the `updated_at` trigger, and the RLS policy. This is the most intricate table in the Finance schema — read §2 and §5 carefully.

**What a template is (domain context):** A template is a **reusable definition of a spending line**. There are two kinds, held in **one table** discriminated by `type` (design decision **D5**):

- **`recurring`** — auto-generates an envelope each month it's due. It has a **cursor** (`next_due_month`), an optional **`end_month`** (NULL = runs indefinitely), a **lifecycle `status`** (`active` → `pending_reconciliation` → `completed`, or `terminated` if ended early), and a `termination_reason` (required only when terminated).
- **`adhoc`** — a **library item the user manually pulls** into a ledger when they want it. It has `archived` (soft-hide from the library), `last_used_month`, and `usage_count`.

Both kinds share an **identity** (`item`, `category_id`, `sort_order`) and a set of **defaults** (`default_amount`, `default_remark`, `default_payment_source_id`, `default_linked_person_id`) that seed the envelope created from them.

**Why one table (D5):** the shared shape is identical, and keeping it one table means the future `envelope.template_id` reference has a **single** target (not a polymorphic FK). The recurring-only and adhoc-only columns are **nullable**, and CHECK constraints enforce that each row carries exactly the right set for its `type`. The domain layer reconstitutes the discriminated union (E1.2).

---

## 2. The rules this table must enforce (and why)

Business rules → DB mechanisms (defined in §5). The "why" is here so the mechanisms make sense.

1. **A row's columns must match its `type` (D5).** A `recurring` row carries recurring fields (`next_due_month`, `status`) and **must not** carry adhoc fields (`archived`, `usage_count`); an `adhoc` row is the mirror image. → two shape CHECKs (`ck_tpl_recurring_shape`, `ck_tpl_adhoc_shape`).
2. **A terminated recurring template must say why.** → `ck_tpl_termination_reason`: `termination_reason` present iff `status = 'terminated'` is reached.
3. **A template can't end before it starts.** `end_month` (when set) must be ≥ `next_due_month`. → `ck_tpl_end_after_due`.
4. **All month columns are stored as first-of-month (D3).** `next_due_month`, `end_month`, `last_used_month` pinned to day 1. → `ck_tpl_months_first`.
5. **Every template belongs to exactly one category.** → `category_id NOT NULL` + FK → `category(id)` `ON DELETE RESTRICT` (see §3 — this is where the category-delete decision is implemented).
6. **Optional payment-source / linked-person defaults survive their target's deletion.** → FKs to `account`/`person` with `ON DELETE SET NULL`.
7. **`updated_at` always reflects the last edit.** → the `moddatetime` `BEFORE UPDATE` trigger from EF1.2.
8. **A user only ever sees/writes their own templates.** → RLS owner-isolation policy.
9. **Deleting the auth user removes their templates.** → `user_id` FK `ON DELETE CASCADE`.

> **NOT this table's job** — do not encode these here; they live in later application/domain code:
> - **`type` immutability.** `type` must never change after creation (Decision 7.5), but this is a **domain/repo convention, NOT a DB trigger** (invariant map: "documented, not a DB trigger"). Do **not** add an update trigger that blocks `type` changes.
> - **`occurrencesRemaining` (D10).** Derived on read from `end_month`, the current month, and the count of `paid` envelopes for the template. **There is deliberately no column** for it.
> - **Auto-generating envelopes** from recurring templates at ledger creation, **advancing the `next_due_month` cursor**, flipping `status`, **incrementing `usage_count`** / stamping `last_used_month` on an adhoc pull. All of that is the ledger-creation / template engine (E6.x, E2.4) — behavior, not storage.
> - **The soft back-reference from envelopes (D9).** `envelope.template_id` will point here **without a DB FK**, so a template can be hard-deleted leaving an orphaned id on old envelopes. That tolerance lives on the `envelope` side (EF1.6) — nothing to do here.

---

## 3. Relationships (verified against the full DB design)

`template` is a **hub with four outbound FKs** — the first table to depend on the EF1.2–EF1.4 reference tables.

**Outbound FKs — created in THIS migration:**

| Column | References | Null | On delete | Why |
|---|---|---|---|---|
| `user_id` | `auth.users(id)` (Supabase-managed) | NOT NULL | `CASCADE` | Ownership. Deleting an account removes all their finance data. |
| `category_id` | `category(id)` (EF1.2) | **NOT NULL** | **`RESTRICT`** | Every template has exactly one category; a category can't be deleted while a template references it. |
| `default_payment_source_id` | `account(id)` (EF1.3) | NULL | `SET NULL` | Optional default payment source; survives the account's deletion. |
| `default_linked_person_id` | `person(id)` (EF1.4) | NULL | `SET NULL` | Optional default linked person; survives the person's deletion. |

**Inbound references — created by LATER tickets (do NOT create them here):**

| Future table | Column | Kind | On delete | Relationship |
|---|---|---|---|---|
| `envelope` | `template_id → template.id` | **SOFT ref (D9) — NO FK** | — (orphan tolerated) | an envelope generated from / pulled from this template |
| `carry_over` | `template_id → template.id` | **real FK** | `CASCADE` | the carry-over panel belongs to this (recurring) template |

**Implications for this ticket:**
- **This is where the category-delete decision (EF1.2 §13.1) gets baked in.** The current design lean is `ON DELETE RESTRICT`, so this migration creates `category_id … on delete restrict`. **Confirm RESTRICT vs reassign-to-default before this ticket lands** — the same choice will repeat on `envelope.category_id` (EF1.6). If the team picks reassign-to-default, this FK changes (and the reassignment becomes domain logic). See §13.1.
- `envelope.template_id` is a **soft reference (D9)** — no inbound FK is created here or in EF1.6; the domain tolerates orphaned ids. `carry_over.template_id` **is** a real `CASCADE` FK, created in EF1.7.
- `id` is a stable single-column `uuid` PK — a valid target for both the soft and the real inbound references.

---

## 4. Columns

Grouped: shared identity/defaults → recurring-only → adhoc-only → timestamps.

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. Opaque random UUID. |
| `user_id` | `uuid` | NOT NULL | `auth.uid()` | Owner. FK → `auth.users(id)` `CASCADE`. Drives RLS. |
| `type` | `template_type` | NOT NULL | — | `recurring` \| `adhoc`. **Immutable after creation** (domain-enforced, §2). No default — set on create. |
| `item` | `varchar(160)` | NOT NULL | — | The line label, e.g. "Rent", "Netflix". |
| `category_id` | `uuid` | NOT NULL | — | FK → `category(id)` `RESTRICT`. Every template has one category. |
| `sort_order` | `integer` | NULL | — | Optional manual ordering. **Nullable, no default** (unlike `category.display_order`). |
| `default_amount` | `numeric(12,2)` | NOT NULL | — | The amount seeded into the envelope created from this template. |
| `default_remark` | `text` | NULL | — | Optional default note. |
| `default_payment_source_id` | `uuid` | NULL | — | Optional. FK → `account(id)` `SET NULL`. |
| `default_linked_person_id` | `uuid` | NULL | — | Optional. FK → `person(id)` `SET NULL`. |
| `next_due_month` | `date` | NULL | — | **Recurring-only.** First-of-month cursor; the next month an envelope is due. NULL for adhoc. |
| `end_month` | `date` | NULL | — | **Recurring-only.** First-of-month; NULL = indefinite. When set, must be ≥ `next_due_month`. |
| `status` | `recurring_template_status` | NULL | — | **Recurring-only.** `active` \| `pending_reconciliation` \| `completed` \| `terminated`. NULL for adhoc. |
| `termination_reason` | `text` | NULL | — | **Recurring-only.** Required iff `status = 'terminated'`. |
| `archived` | `boolean` | NULL | — | **Adhoc-only.** `false` on a live adhoc template, `true` when hidden from the library. NULL for recurring. |
| `last_used_month` | `date` | NULL | — | **Adhoc-only.** First-of-month; the last month this adhoc was pulled. NULL until first used. |
| `usage_count` | `integer` | NULL | — | **Adhoc-only.** How many times pulled; `0` on create. NULL for recurring. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Created time. Never changes. |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Last-modified stamp, maintained by the §6 trigger. |

**Implementation notes:**
- **No conditional column DEFAULTs.** `archived`, `usage_count`, `status`, `next_due_month` have **no** `DEFAULT` — a column default would fire for the *wrong* `type` and break the shape CHECKs (e.g. defaulting `archived = false` would make recurring rows fail `ck_tpl_recurring_shape`, which requires `archived IS NULL`). The **insert path supplies type-appropriate values**: recurring → set `next_due_month`/`status`, leave adhoc cols NULL; adhoc → set `archived=false`/`usage_count=0`, leave recurring cols NULL. (Repository concern, E6.x.)
- **`default_amount` is `numeric(12,2)`** — exact decimal; read as a **string** through the SDK, never JS-float math.
- **`item` is `varchar(160)`** (longer than the label tables — templates can be descriptive).

---

## 5. Enums, CHECK constraints & indexes

Use these **exact names** — later tickets and the verification tests reference them.

**Enums:**
- `template_type` — `recurring`, `adhoc`.
- `recurring_template_status` — `active`, `pending_reconciliation`, `completed`, `terminated`.

**CHECK constraints (the teeth behind D5):**

| Name | Definition (plain English) | Rule (§2) |
|---|---|---|
| `ck_tpl_months_first` | `next_due_month`, `end_month`, `last_used_month` are each first-of-month when present | #4 / D3 |
| `ck_tpl_recurring_shape` | if `type='recurring'`: `next_due_month` **and** `status` present; `archived` **and** `usage_count` NULL | #1 / D5 |
| `ck_tpl_adhoc_shape` | if `type='adhoc'`: `archived` **and** `usage_count` present; `next_due_month`, `end_month`, `status`, `termination_reason` all NULL | #1 / D5 |
| `ck_tpl_termination_reason` | `status = 'terminated'` ⟹ `termination_reason` present | #2 |
| `ck_tpl_end_after_due` | both set ⟹ `end_month >= next_due_month` | #3 |

**Indexes:**

| Name | Definition | Query it serves |
|---|---|---|
| `idx_template_generation` | `(user_id, type, status, next_due_month)` | "recurring `active` due `<= :month`" at ledger creation (E6.1, E2.4) |
| `idx_adhoc_library` | `(user_id, type, archived, last_used_month)` | flat adhoc library, most-recently-used first (E6.6) |
| `idx_template_category` | `(category_id)` | templates by category; supports the `RESTRICT` delete-check on `category` |

- The first two indexes lead with `user_id`, so they also serve the RLS predicate; no separate `user_id` index is needed.

---

## 6. `updated_at` trigger + Row-Level Security

### 6.1 `updated_at` auto-maintenance (reuse EF1.2 convention)

Reuses the module-wide pattern: the **`moddatetime`** extension + a per-table `BEFORE UPDATE` trigger (`set_template_updated_at`) stamping `updated_at = now()`. `create extension if not exists moddatetime` is idempotent (already created in EF1.2).

### 6.2 Row-Level Security

Enable RLS and add one owner-isolation policy with the `(select auth.uid())` form (evaluated once per statement, not per row).

- `USING` gates reads/updates/deletes to owned rows; `WITH CHECK` blocks writing a row owned by another user.
- `TO authenticated`; `anon` has no policy → denied.
- **`service_role` bypasses RLS** (migrations/seeds). `user_id` defaults to `auth.uid()` (NULL when headless), so a `service_role` insert omitting `user_id` **fails NOT NULL on purpose** — seeds/jobs must set it explicitly.
- `auth.users`, `category`, `account`, `person` are referenced, not created here.

(Exact SQL in §8.)

---

## 7. Adding the migration (additive — the package already exists)

This ticket only **adds a migration and a test file**. The `@nafios/db` package (EF1.1), `moddatetime` (EF1.2), and the `category`/`account`/`person` tables (EF1.2–1.4) already exist.

### 7.1 Files touched

```
packages/db/
├── supabase/
│   └── migrations/
│       └── 20260627050000_finance_create_template.sql   # NEW — this ticket
├── src/
│   └── database.types.ts                                 # REGENERATED (do not hand-edit)
└── tests/
    └── integration/
        └── template.test.ts                              # NEW — the §11 matrix as SDK tests
```

> Timestamp-ordered **after** EF1.4. Because `template` references `category`/`account`/`person`, those migrations (earlier timestamps) must already have applied — they do, in order.

### 7.2 Commands

```bash
# from packages/db/
supabase migration new finance_create_template
# paste the SQL from §8, then:
supabase db reset      # rebuild local DB: ALL migrations + seed
bun run db:types       # regenerate src/database.types.ts
bun test               # run the §11 integration tests
```

### 7.3 Standards / hard rules (unchanged)

- **Migrations are immutable once merged/applied** — add a new one; the §9 rollback is for local iteration only.
- **`supabase db reset` must succeed from scratch** (clean DB → all migrations → seed).
- **Regenerate `database.types.ts`** on any schema change; commit it (generated, do not hand-edit).
- **Staging:** push directly to the `staging` Supabase project from local dev with `supabase db push` (no CI/CD pipeline in this epic). Run `bun run check` locally first; this migration must apply cleanly to `staging`.

---

## 8. The migration SQL (`20260627050000_finance_create_template.sql`)

```sql
-- updated_at auto-maintenance — reuses the module convention from EF1.2 (idempotent).
create extension if not exists moddatetime schema extensions;

-- template discriminator + recurring lifecycle
create type template_type             as enum ('recurring', 'adhoc');
create type recurring_template_status as enum ('active', 'pending_reconciliation', 'completed', 'terminated');

-- template: ONE discriminated table for both recurring & adhoc (D5).
-- recurring-only and adhoc-only columns are nullable; type-shape enforced by CHECKs below.
create table template (
  id                        uuid          primary key default gen_random_uuid(),
  user_id                   uuid          not null default auth.uid()
                                            references auth.users (id) on delete cascade,
  type                      template_type not null,            -- immutable after creation (domain-enforced)
  item                      varchar(160)  not null,
  category_id               uuid          not null
                                            references category (id) on delete restrict,
  sort_order                integer,
  default_amount            numeric(12,2) not null,
  default_remark            text,
  default_payment_source_id uuid          references account (id) on delete set null,
  default_linked_person_id  uuid          references person  (id) on delete set null,

  -- recurring-only (NULL for adhoc)
  next_due_month            date,
  end_month                 date,
  status                    recurring_template_status,
  termination_reason        text,

  -- adhoc-only (NULL for recurring)
  archived                  boolean,
  last_used_month           date,
  usage_count               integer,

  created_at                timestamptz   not null default now(),
  updated_at                timestamptz   not null default now(),

  -- D3: month columns pinned to first-of-month when present
  constraint ck_tpl_months_first check (
        (next_due_month  is null or extract(day from next_due_month)  = 1)
    and (end_month       is null or extract(day from end_month)       = 1)
    and (last_used_month is null or extract(day from last_used_month) = 1) ),

  -- D5: recurring rows carry recurring fields, not adhoc fields
  constraint ck_tpl_recurring_shape check (
    type <> 'recurring' or (next_due_month is not null and status is not null
                            and archived is null and usage_count is null) ),

  -- D5: adhoc rows carry adhoc fields, not recurring fields
  constraint ck_tpl_adhoc_shape check (
    type <> 'adhoc' or (archived is not null and usage_count is not null
                        and next_due_month is null and end_month is null
                        and status is null and termination_reason is null) ),

  -- termination reason required iff terminated
  constraint ck_tpl_termination_reason check (
    status is distinct from 'terminated' or termination_reason is not null ),

  -- end_month not before next_due_month when both set
  constraint ck_tpl_end_after_due check (
    end_month is null or next_due_month is null or end_month >= next_due_month )
);

-- recurring generation scan: "recurring active due <= :month" at ledger creation
create index idx_template_generation on template (user_id, type, status, next_due_month);
-- adhoc library: flat list, most-recently-used first
create index idx_adhoc_library on template (user_id, type, archived, last_used_month);
-- templates by category (also supports the category RESTRICT delete-check)
create index idx_template_category on template (category_id);

-- keep updated_at current on every UPDATE
create trigger set_template_updated_at
  before update on template
  for each row
  execute function extensions.moddatetime (updated_at);

-- row-level security: a user sees/writes only their own templates
alter table template enable row level security;

create policy owner_all on template
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

---

## 9. Rollback (local iteration only)

Applied migrations are immutable; this is for re-running locally before merge. Prefer `supabase db reset`.

```sql
drop table if exists template;                 -- drops its indexes, trigger & policy too
drop type  if exists recurring_template_status;
drop type  if exists template_type;
-- leave the moddatetime extension and the category/account/person tables in place.
```

---

## 10. SDK type generation

After the migration applies, run `bun run db:types`. This types `template` rows and both enums for the SDK. Note the TS layer reconstitutes the **discriminated union** from the nullable columns (E1.2) — the generated row type is the flat shape with optionals; the domain mapping narrows by `type`.

---

## 11. Verification matrix

Run after `supabase db reset`. Two things first:
1. RLS rows need two real users — reuse the two test users seeded by EF1.1's `seed.sql`.
2. **Cross-table FKs need parent rows.** As the test user (or service-role with explicit `user_id`), first insert a `category`, an `account`, and a `person` owned by that user; use their ids below as `<cat>`, `<acct>`, `<person>`.

```sql
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"00000000-0000-0000-0000-00000000000a"}';
reset role;   -- between cases
```

**Valid inserts**

| # | Action | Expected |
|---|---|---|
| 1 | RECURRING: `type=recurring, item='Rent', category_id=<cat>, default_amount=2500.00, next_due_month=2026-07-01, status=active` (adhoc cols NULL) | ✅ inserts |
| 2 | RECURRING with `end_month=2026-12-01` (≥ next_due) and `default_payment_source_id=<acct>` | ✅ inserts |
| 3 | ADHOC: `type=adhoc, item='Gift', category_id=<cat>, default_amount=50.00, archived=false, usage_count=0` (recurring cols NULL) | ✅ inserts |

**Type-shape CHECKs (D5)**

| # | Action | Expected |
|---|---|---|
| 4 | RECURRING with `next_due_month=NULL` | ❌ `ck_tpl_recurring_shape` |
| 5 | RECURRING with `status=NULL` | ❌ `ck_tpl_recurring_shape` |
| 6 | RECURRING with `archived=false` set | ❌ `ck_tpl_recurring_shape` |
| 7 | RECURRING with `usage_count=0` set | ❌ `ck_tpl_recurring_shape` |
| 8 | ADHOC with `archived=NULL` | ❌ `ck_tpl_adhoc_shape` |
| 9 | ADHOC with `usage_count=NULL` | ❌ `ck_tpl_adhoc_shape` |
| 10 | ADHOC with `next_due_month` or `status` or `end_month` set | ❌ `ck_tpl_adhoc_shape` |

**Other CHECKs**

| # | Action | Expected |
|---|---|---|
| 11 | RECURRING `status=terminated, termination_reason=NULL` | ❌ `ck_tpl_termination_reason` |
| 12 | RECURRING `status=terminated, termination_reason='moved out'` | ✅ inserts |
| 13 | RECURRING `next_due_month=2026-07-01, end_month=2026-06-01` | ❌ `ck_tpl_end_after_due` |
| 14 | RECURRING `next_due_month=2026-07-01, end_month=2026-07-01` (equal) | ✅ inserts |
| 15 | RECURRING `next_due_month=2026-07-15` (not day 1) | ❌ `ck_tpl_months_first` |

**FKs & NOT NULL**

| # | Action | Expected |
|---|---|---|
| 16 | Insert with `category_id=NULL` | ❌ NOT NULL |
| 17 | Insert with `category_id=<random uuid>` (no such category) | ❌ FK violation |
| 18 | Insert with `item=NULL` or `default_amount=NULL` | ❌ NOT NULL |
| 19 | Delete the `<cat>` category while a template references it | ❌ FK `RESTRICT` (verifies the category-delete guard) |
| 20 | Delete the `<acct>` account referenced by template #2 | ✅ account deleted; template's `default_payment_source_id` becomes NULL (`SET NULL`) |
| 21 | Delete the `<person>` referenced as a default linked person | ✅ deleted; `default_linked_person_id` becomes NULL |

**Trigger, RLS, ownership**

| # | Action | Expected |
|---|---|---|
| 22 | `UPDATE` a template's `item` | ✅ `updated_at` advances; `created_at` unchanged |
| 23 | As user A, `select` a template owned by user B | 0 rows (RLS) |
| 24 | As user A, `insert` with `user_id` = user B | ❌ RLS `WITH CHECK` |
| 25 | Delete the auth user; check their templates | gone (`ON DELETE CASCADE`) |
| 26 | `supabase db reset` from scratch (all migrations + seed) | ✅ clean apply |

Recommended: encode cases 1–25 as SDK-driven integration tests in `tests/integration/template.test.ts`, seeding parent category/account/person via the Supabase client, so `bun run check` enforces them.

---

## 12. Acceptance criteria

- [ ] **AC1** — One new migration `20260627050000_finance_create_template.sql` added to the **existing** `@nafios/db` package.
- [ ] **AC2** — `template_type` and `recurring_template_status` enums and the `template` table exist with the exact columns, types, nullability, and defaults in §4 (**no** conditional column defaults; **no** `occurrences_remaining` column).
- [ ] **AC3** — All **five** CHECK constraints from §5 exist with those exact names and semantics.
- [ ] **AC4** — All **four** FKs exist with the correct `ON DELETE` actions: `user_id`→CASCADE, `category_id`→**RESTRICT** (NOT NULL), `default_payment_source_id`/`default_linked_person_id`→SET NULL.
- [ ] **AC5** — The three indexes (`idx_template_generation`, `idx_adhoc_library`, `idx_template_category`) exist with those exact names/columns.
- [ ] **AC6** — `updated_at` is auto-maintained by `set_template_updated_at` (moddatetime); `created_at` never changed by it.
- [ ] **AC7** — RLS enabled and `owner_all` policy exists using the `(select auth.uid())` form.
- [ ] **AC8** — No DB enforcement of `type` immutability (domain concern); **no inbound FK** from `envelope` (soft ref, D9); `carry_over` FK not created here.
- [ ] **AC9** — `supabase db reset` applies cleanly from scratch; `supabase db push` applies to `staging`.
- [ ] **AC10** — `src/database.types.ts` regenerated and committed.
- [ ] **AC11** — Every row of the §11 verification matrix behaves as specified.

---

## 13. Notes / decisions to confirm before the next tables

1. **Category-delete decision is implemented HERE (EF1.2 §13.1 → resolved).** This migration creates `category_id … on delete restrict`. **Confirm `RESTRICT` (vs reassign-to-default) before merging this ticket** — and apply the same choice to `envelope.category_id` (EF1.6). If reassign-to-default is chosen, this FK changes and reassignment becomes domain logic.
2. **`type` immutability is intentionally NOT enforced at the DB** (domain/repo convention, E2.2/E6.7). If DB-level enforcement is ever wanted, it would be a `BEFORE UPDATE` trigger rejecting a changed `type` — deliberately omitted here. Confirm the domain layer owns it.
3. **`occurrencesRemaining` is derived, not stored (D10)** — no column. Confirm no consumer expects one on the row.
4. **No conditional column defaults (§4).** `archived`/`usage_count`/`status`/`next_due_month` have no DEFAULT (a default would break the shape CHECKs). The repository's insert path must set type-correct values. Confirm this is owned in E6.x.
5. **`last_used_month` not pinned to NULL for recurring (latent looseness).** `ck_tpl_recurring_shape` forces `archived`/`usage_count` NULL but **does not** force `last_used_month IS NULL`, so a recurring row could carry a stray `last_used_month`. Decide whether to tighten the recurring shape CHECK to add `last_used_month IS NULL`. *(Design observation — worth a quick call before this lands.)*
6. **`default_amount` non-negativity not enforced.** Unlike `envelope.amount` (`ck_env_amount_nonneg`, EF1.6), the design specifies no `>= 0` CHECK on `template.default_amount`. Optionally add `check (default_amount >= 0)`. Decide.
7. **`updated_at` convention reused** — 4th table on the EF1.2 `moddatetime` pattern.

*Provenance (not required reading): the physical model and its rationale (decisions D1–D13, esp. D5/D9/D10) live in the finance DB design doc and the DBML under `finance/planning/`; template behavior is described in `finance/specs/template.md`.*

---

## Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 0.1 | 2026-06-27 | NafiOS Foundation | Initial standalone task for the `template` table (D5 single discriminated table): `template_type` + `recurring_template_status` enums, full column set, five type-shape/termination/end-after-due/first-of-month CHECKs, four FKs (category RESTRICT, account/person SET NULL, user CASCADE), three indexes, `updated_at` trigger, RLS, verification matrix, acceptance criteria. First cross-table-FK ticket; implements the category-delete RESTRICT decision; flags two latent design looseness items (recurring `last_used_month`, `default_amount` sign). |
