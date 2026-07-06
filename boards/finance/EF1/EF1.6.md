# EF1.6 — Design & create the `envelope` table

> - `M0`
> - `type:feature`
> - `module:finance`
> - `area:data`
> - `P0`
> - `size:M`
> - **Epic:** EF1 — Finance Data Foundation

> **This ticket is self-contained.** Everything needed to add the migration, create the table, secure it, and verify it is in this file. No other document is required. Stack: **Supabase Postgres**, schema managed by the **Supabase CLI** (raw SQL migrations), runtime data access via the **Supabase JS SDK** (`@supabase/supabase-js`). **No ORM / no Drizzle.**
>
> **Assumes EF1.1–EF1.5 are done:** the `@nafios/db` package + migration system (EF1.1), the `moddatetime` convention (EF1.2), and the **`monthly_ledger` (EF1.1), `category` (EF1.2), `account` (EF1.3), `person` (EF1.4), `template` (EF1.5)** tables all exist. **This table has the most relationships in the schema** — those five must already be migrated (earlier timestamps). Purely additive — one new migration.

---

## 1. What you're building

Create one Postgres table, `envelope`, plus **two enums** (`envelope_status`, `obligation_kind`), **four CHECK constraints**, **five real foreign keys + two soft references (D9, no FK)**, four indexes, the `updated_at` trigger, and the RLS policy.

**What an envelope is (domain context):** An envelope is **one spending line within a month's ledger** — the working surface the user actually edits. Each envelope is an intended or actual payment: an `item`, an `amount`, a `category`, and a `status` in its lifecycle (`pending` → `paid` / `skipped` / `carried_over`). An envelope arises in one of three ways:

- **manual** — the user typed it in. `template_id` is NULL.
- **template-linked** — generated from a recurring template, or pulled from an adhoc one. `template_id` points (softly) at the template; `original_amount` records the template's default so the UI can show an *amendment* when `amount` differs.
- **carried-over** — created by carrying an unpaid line forward from a previous month. `carried_from_envelope_id` points (softly) back at the source envelope; `carry_over_reason` explains why.

The **ledger's metrics** (COL, Health Margin, ASM, Outstanding, Amendments) are **computed on read from these rows** (D11) — they are never stored. This table just holds the lines.

---

## 2. The rules this table must enforce (and why)

Business rules → DB mechanisms (defined in §5). The "why" is here so the mechanisms make sense.

1. **Money is never negative; `$0` is valid.** A `$0` envelope is a legitimate placeholder. → `ck_env_amount_nonneg` (`amount >= 0`).
2. **A paid timestamp exists exactly when paid.** `paid_at` is set iff `status = 'paid'`. → `ck_env_paid_at`.
3. **`original_amount` only makes sense for a template-linked line.** A manual line has no "original". → `ck_env_original_amount` (`original_amount` NULL unless `template_id` set).
4. **A carry-over reason, when given, is substantial.** ≥ 10 chars. → `ck_env_co_reason_len`. *(The "never emptied once set" rule is temporal → domain, not a CHECK.)*
5. **Every envelope belongs to exactly one category.** → `category_id NOT NULL` + FK → `category(id)` `RESTRICT`.
6. **An envelope belongs to exactly one ledger; deleting the ledger deletes its envelopes.** → `ledger_id NOT NULL` + FK → `monthly_ledger(id)` `CASCADE`.
7. **Optional payment-source / linked-person survive their target's deletion.** → FKs to `account`/`person` `SET NULL`.
8. **`updated_at` always reflects the last edit.** → the `moddatetime` `BEFORE UPDATE` trigger (EF1.2).
9. **A user only ever sees/writes their own envelopes.** → RLS owner-isolation policy.

> **NOT this table's job** — do not encode these here:
> - **Any derived metric** (COL, Health Margin, ASM, Outstanding count, Amendments) — computed on read from these rows (D11). **No columns.**
> - **`occurrencesRemaining`** — derived from the count of `paid` envelopes per template (D10); the `idx_envelope_template_status` index *serves* that count, but nothing is stored.
> - **Free-form status transitions / lifecycle gating** (any status → any status, settled-ledger immutability). Domain engine's job (§6 of the DB design); no triggers here.
> - **The carry-over panel** (kill reason, acted-on lock, history) — that's the `carry_over` table (EF1.7). This table only holds the `carry_over_reason` text and the soft `carried_from_envelope_id` back-pointer.
> - **Enforcing the soft references resolve** (D9) — `template_id` / `carried_from_envelope_id` may dangle; that's intentional (see §3).

---

## 3. Relationships (verified against the full DB design)

The most connected table in the schema: **five real FKs and two soft references**.

**Real FKs — created in THIS migration:**

| Column | References | Null | On delete | Why |
|---|---|---|---|---|
| `user_id` | `auth.users(id)` | NOT NULL | `CASCADE` | Ownership (denormalized; matches ledger owner). Drives RLS. |
| `ledger_id` | `monthly_ledger(id)` (EF1.1) | **NOT NULL** | **`CASCADE`** | The month this line belongs to; deleting the ledger removes its lines. |
| `category_id` | `category(id)` (EF1.2) | **NOT NULL** | **`RESTRICT`** | Every envelope has exactly one category. |
| `payment_source_id` | `account(id)` (EF1.3) | NULL | `SET NULL` | Optional payment source; survives the account's deletion. |
| `linked_person_id` | `person(id)` (EF1.4) | NULL | `SET NULL` | Optional linked person; survives the person's deletion. |

**Soft references (D9) — indexed `uuid` columns with NO FK constraint:**

| Column | Logically points at | Why no FK |
|---|---|---|
| `template_id` | `template(id)` (EF1.5) | A template can be **hard-deleted while this id is kept** as an orphaned historical reference (template spec §4/§6). A real FK can't honor that (`RESTRICT` blocks the delete; `SET NULL` erases the wanted id). |
| `carried_from_envelope_id` | `envelope(id)` (self) | Template-termination can hard-remove a source envelope while a downstream carried envelope still references it. Same orphan tolerance. |

> The ERD draws these as `[soft]` `Ref` lines for readability — **generate them WITHOUT a foreign-key constraint.** The domain layer already tolerates dangling ids.

**Inbound FK — created by a LATER ticket (do NOT create it here):**

| Future table | Column | On delete | Relationship |
|---|---|---|---|
| `carry_over` | `source_envelope_id → envelope.id` (UNIQUE) | `CASCADE` | the panel entry for an envelope marked carried-over |
| `carry_over` | `added_envelope_id → envelope.id` | `SET NULL` | the new envelope an "added" carry-over produced |

**Implications for this ticket:**
- **Cross-owner integrity hardening decision (DB-design open #7) lands HERE.** `user_id` is denormalized onto the envelope (D12) and stays consistent with the ledger's owner *by construction* (every insert stamps `auth.uid()`), but nothing at the DB *forces* `envelope.user_id = ledger.user_id`. Optional hardening: a **composite FK** `envelope(ledger_id, user_id) → monthly_ledger(id, user_id)`, which requires `UNIQUE(id, user_id)` on `monthly_ledger` (the line EF1.1 §13.1 left out). **Default: simple FK `ledger_id → monthly_ledger(id)`, trust the insert path.** Confirm before this lands — see §13.1.
- **Category-delete RESTRICT** must match the EF1.5 decision (consistency across both child tables) — see §13.2.

---

## 4. Columns

Grouped: core → template-link → carry-over → Phase 2 → timestamps.

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `user_id` | `uuid` | NOT NULL | `auth.uid()` | Owner (matches ledger owner). FK → `auth.users(id)` `CASCADE`. Drives RLS. |
| `ledger_id` | `uuid` | NOT NULL | — | FK → `monthly_ledger(id)` `CASCADE`. The owning month. |
| `category_id` | `uuid` | NOT NULL | — | FK → `category(id)` `RESTRICT`. |
| `item` | `varchar(160)` | NOT NULL | — | The line label, e.g. "Groceries — week 1". |
| `amount` | `numeric(12,2)` | NOT NULL | — | Current amount. `>= 0` (`$0` valid). |
| `original_amount` | `numeric(12,2)` | NULL | — | Template's default at generation; **only when `template_id` set**. NULL for manual lines. Diff vs `amount` = an amendment. |
| `status` | `envelope_status` | NOT NULL | `'pending'` | `pending` \| `paid` \| `skipped` \| `carried_over`. |
| `paid_at` | `timestamptz` | NULL | — | Set **iff** `status = 'paid'`. |
| `payment_source_id` | `uuid` | NULL | — | Optional. FK → `account(id)` `SET NULL`. |
| `remark` | `text` | NULL | — | Optional free note. |
| `linked_person_id` | `uuid` | NULL | — | Optional. FK → `person(id)` `SET NULL`. |
| `sort_order` | `integer` | NOT NULL | `0` | Position within the ledger's list. (NOT NULL default 0 — unlike `template.sort_order`.) |
| `template_id` | `uuid` | NULL | — | **Soft ref (D9), no FK.** NULL = manual; may be orphaned after the template is deleted. |
| `carried_from_envelope_id` | `uuid` | NULL | — | **Soft ref (D9), no FK.** Set ⟹ this line was carried over from that source envelope. |
| `carry_over_reason` | `text` | NULL | — | ≥ 10 chars when set (CHECK); "never emptied once set" is a domain rule (E7). |
| `obligation_kind` | `obligation_kind` | NULL | — | **Phase 2 reserved; always NULL in MVP** (domain §6.1). Enum created now so Phase 2 needs no enum migration; column is inert. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Created time. Never changes. |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Last-modified stamp, maintained by the §6 trigger. |

**Implementation notes:**
- **`amount` / `original_amount` are `numeric(12,2)`** — exact decimal; read as a **string** through the SDK, never JS-float math.
- **`obligation_kind` is created but inert.** No CHECK forces it NULL in MVP (faithful to the design) — see §13.4 for the optional `obligation_kind IS NULL` guard.

---

## 5. Enums, CHECK constraints & indexes

Use these **exact names** — later tickets and the verification tests reference them.

**Enums:**
- `envelope_status` — `pending`, `paid`, `skipped`, `carried_over`. **D4 naming seam:** the label is `carried_over` (no hyphen — Postgres identifiers forbid them); the domain literal is `'carried-over'`. The E2 mapping layer owns the translation.
- `obligation_kind` — `debt_repayment`, `recurring_service`, `tax_installment`, `utility`, `set_aside`, `family_support`, `insurance_premium`, `discretionary`. Phase 2 reserved.

**CHECK constraints:**

| Name | Definition | Rule (§2) |
|---|---|---|
| `ck_env_amount_nonneg` | `amount >= 0` | #1 |
| `ck_env_paid_at` | `(status = 'paid') = (paid_at IS NOT NULL)` | #2 |
| `ck_env_original_amount` | `original_amount IS NULL OR template_id IS NOT NULL` | #3 |
| `ck_env_co_reason_len` | `carry_over_reason IS NULL OR char_length(carry_over_reason) >= 10` | #4 |

**Indexes:**

| Name | Definition | Query it serves |
|---|---|---|
| `idx_envelope_ledger` | `(user_id, ledger_id)` | all envelopes for a ledger — the working surface (E11.1) |
| `idx_envelope_template_status` | `(user_id, template_id, status)` | paid-count for `occurrencesRemaining` (D10); outstanding carry-overs by template (E6.4) |
| `idx_envelope_person` | `(user_id, linked_person_id)` | annual outflow tied to a Person (E13.3) |
| `idx_envelope_category` | `(category_id)` | envelopes by category; supports the `RESTRICT` delete-check on `category` |

- The first three lead with `user_id`, so they also serve the RLS predicate.
- **No index on `carried_from_envelope_id`** — the design lists none (the forward link is tracked by `carry_over`). Flagged in §13.6.

---

## 6. `updated_at` trigger + Row-Level Security

### 6.1 `updated_at` auto-maintenance (reuse EF1.2 convention)

Reuses the module-wide pattern: the **`moddatetime`** extension + a per-table `BEFORE UPDATE` trigger (`set_envelope_updated_at`). `create extension if not exists moddatetime` is idempotent (created in EF1.2).

### 6.2 Row-Level Security

Enable RLS + one owner-isolation policy with the `(select auth.uid())` form (once per statement).

- `USING` gates reads/updates/deletes to owned rows; `WITH CHECK` blocks writing a row owned by another user.
- `TO authenticated`; `anon` denied. **`service_role` bypasses RLS** — seeds/jobs must set `user_id` explicitly (the `auth.uid()` default is NULL when headless → NOT NULL rejects it).
- `auth.users`, `monthly_ledger`, `category`, `account`, `person` are referenced, not created here. `template` is referenced **softly** (no FK).

(Exact SQL in §8.)

---

## 7. Adding the migration (additive — the package already exists)

Only **adds a migration and a test file**. Package (EF1.1), `moddatetime` (EF1.2), and the five parent tables (EF1.1–1.5) already exist.

### 7.1 Files touched

```
packages/db/
├── supabase/
│   └── migrations/
│       └── 20260627060000_finance_create_envelope.sql   # NEW — this ticket
├── src/
│   └── database.types.ts                                 # REGENERATED (do not hand-edit)
└── tests/
    └── integration/
        └── envelope.test.ts                              # NEW — the §11 matrix as SDK tests
```

> Timestamp-ordered **after** EF1.5. `envelope` references `monthly_ledger`/`category`/`account`/`person` (real FKs) — all earlier timestamps, so they exist. `template` is referenced softly (no FK), so its presence isn't even required for the migration to apply — but it's there anyway.

### 7.2 Commands

```bash
# from packages/db/
supabase migration new finance_create_envelope
# paste the SQL from §8, then:
supabase db reset
bun run db:types
bun test
```

### 7.3 Standards / hard rules (unchanged)

- **Migrations are immutable once merged/applied** — add a new one; §9 rollback is local-only.
- **`supabase db reset` must succeed from scratch.**
- **Regenerate `database.types.ts`** on any schema change; commit it.
- **Staging:** push directly to the `staging` Supabase project from local dev with `supabase db push` (no CI/CD pipeline in this epic). Run `bun run check` locally first; this migration must apply cleanly to `staging`.

---

## 8. The migration SQL (`20260627060000_finance_create_envelope.sql`)

```sql
-- updated_at auto-maintenance — reuses the module convention from EF1.2 (idempotent).
create extension if not exists moddatetime schema extensions;

-- envelope lifecycle states (D4 seam: label 'carried_over' <=> TS literal 'carried-over')
create type envelope_status as enum ('pending', 'paid', 'skipped', 'carried_over');

-- Phase 2 reserved classification — column stays NULL in MVP (domain §6.1).
-- Created now so Phase 2 needs no enum migration.
create type obligation_kind as enum (
  'debt_repayment', 'recurring_service', 'tax_installment', 'utility',
  'set_aside', 'family_support', 'insurance_premium', 'discretionary'
);

-- envelope: one spending line within a month's ledger (the working surface).
-- Derived metrics (COL/HM/ASM/Outstanding/Amendments) are NOT stored (D11).
create table envelope (
  id                       uuid            primary key default gen_random_uuid(),
  user_id                  uuid            not null default auth.uid()
                                            references auth.users (id) on delete cascade,
  ledger_id                uuid            not null
                                            references monthly_ledger (id) on delete cascade,
  category_id              uuid            not null
                                            references category (id) on delete restrict,
  item                     varchar(160)    not null,
  amount                   numeric(12,2)   not null,
  original_amount          numeric(12,2),
  status                   envelope_status not null default 'pending',
  paid_at                  timestamptz,
  payment_source_id        uuid            references account (id) on delete set null,
  remark                   text,
  linked_person_id         uuid            references person (id)  on delete set null,
  sort_order               integer         not null default 0,

  -- soft references (D9): plain uuid columns, NO FK constraint; may be orphaned
  template_id              uuid,            -- -> template.id  (NULL = manual line)
  carried_from_envelope_id uuid,            -- -> envelope.id  (set => carried-over origin)

  carry_over_reason        text,
  obligation_kind          obligation_kind, -- Phase 2 reserved; always NULL in MVP

  created_at               timestamptz     not null default now(),
  updated_at               timestamptz     not null default now(),

  constraint ck_env_amount_nonneg   check (amount >= 0),
  constraint ck_env_paid_at         check ((status = 'paid') = (paid_at is not null)),
  constraint ck_env_original_amount check (original_amount is null or template_id is not null),
  constraint ck_env_co_reason_len   check (carry_over_reason is null or char_length(carry_over_reason) >= 10)
);

-- all envelopes for a ledger (the working surface)
create index idx_envelope_ledger          on envelope (user_id, ledger_id);
-- paid-count for occurrencesRemaining (D10) + outstanding carry-overs by template
create index idx_envelope_template_status on envelope (user_id, template_id, status);
-- annual outflow tied to a person
create index idx_envelope_person          on envelope (user_id, linked_person_id);
-- envelopes by category (also supports the category RESTRICT delete-check)
create index idx_envelope_category        on envelope (category_id);

-- keep updated_at current on every UPDATE
create trigger set_envelope_updated_at
  before update on envelope
  for each row
  execute function extensions.moddatetime (updated_at);

-- row-level security: a user sees/writes only their own envelopes
alter table envelope enable row level security;

create policy owner_all on envelope
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

---

## 9. Rollback (local iteration only)

Applied migrations are immutable; this is for re-running locally before merge. Prefer `supabase db reset`.

```sql
drop table if exists envelope;          -- drops its indexes, trigger & policy too
drop type  if exists obligation_kind;
drop type  if exists envelope_status;
-- leave moddatetime + the parent tables in place.
```

---

## 10. SDK type generation

After the migration applies, run `bun run db:types`. This types `envelope` rows and both enums for the SDK. Note the soft-ref columns (`template_id`, `carried_from_envelope_id`) type as plain optional `uuid` strings — the SDK can't model the (absent) relationship, which is correct (D9).

---

## 11. Verification matrix

Run after `supabase db reset`. Setup:
1. RLS needs two real users — reuse the two test users seeded by EF1.1's `seed.sql`.
2. **Parent rows:** as the test user, insert a `monthly_ledger` (`<ledger>`), a `category` (`<cat>`), an `account` (`<acct>`), a `person` (`<person>`), and a `template` (`<tpl>`). Use their ids below.

```sql
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"00000000-0000-0000-0000-00000000000a"}';
reset role;   -- between cases
```

**Valid inserts**

| # | Action | Expected |
|---|---|---|
| 1 | Manual: `ledger_id=<ledger>, category_id=<cat>, item='Groceries', amount=120.00, status=pending` (template_id NULL) | ✅ inserts |
| 2 | Paid: `status=paid, paid_at=now()` | ✅ inserts |
| 3 | Template-linked: `template_id=<tpl>, original_amount=100.00, amount=120.00` (amendment) | ✅ inserts |
| 4 | `amount=0` | ✅ inserts (`$0` valid) |

**CHECKs**

| # | Action | Expected |
|---|---|---|
| 5 | `amount=-1` | ❌ `ck_env_amount_nonneg` |
| 6 | `status=paid, paid_at=NULL` | ❌ `ck_env_paid_at` |
| 7 | `status=pending, paid_at=now()` | ❌ `ck_env_paid_at` |
| 8 | `original_amount=100.00` with `template_id=NULL` | ❌ `ck_env_original_amount` |
| 9 | `carry_over_reason='too short'` (< 10 chars) | ❌ `ck_env_co_reason_len` |
| 10 | `carry_over_reason='ran out of budget this month'` (≥ 10) | ✅ inserts |

**Enum**

| # | Action | Expected |
|---|---|---|
| 11 | `status='cancelled'` (not a member) | ❌ invalid enum value |
| 12 | `status='carried_over'` (with `paid_at=NULL`) | ✅ inserts |

**Soft refs (D9 — dangling allowed, NO FK)**

| # | Action | Expected |
|---|---|---|
| 13 | Insert with `template_id=<random uuid, no such template>` | ✅ inserts (no FK — soft ref) |
| 14 | Insert with `carried_from_envelope_id=<random uuid>` | ✅ inserts (no FK — soft ref) |
| 15 | Delete the `<tpl>` template that envelope #3 references | ✅ template deleted; envelope #3 **survives** with the now-orphaned `template_id` (no cascade, no set-null) |

**Real FKs & NOT NULL**

| # | Action | Expected |
|---|---|---|
| 16 | `ledger_id=NULL` or `category_id=NULL` | ❌ NOT NULL |
| 17 | `ledger_id=<random uuid>` | ❌ FK violation (`monthly_ledger`) |
| 18 | Delete the `<ledger>` | ✅ its envelopes gone (`CASCADE`) |
| 19 | Delete the `<cat>` category while an envelope references it | ❌ FK `RESTRICT` |
| 20 | Delete the `<acct>` account referenced as `payment_source_id` | ✅ deleted; column becomes NULL (`SET NULL`) |
| 21 | Delete the `<person>` referenced as `linked_person_id` | ✅ deleted; column becomes NULL (`SET NULL`) |

**Phase 2, trigger, RLS, ownership**

| # | Action | Expected |
|---|---|---|
| 22 | Insert leaving `obligation_kind` unset | ✅ inserts; column NULL (MVP-inert) |
| 23 | `UPDATE` an envelope's `item` | ✅ `updated_at` advances; `created_at` unchanged |
| 24 | As user A, `select` an envelope owned by user B | 0 rows (RLS) |
| 25 | As user A, `insert` with `user_id` = user B | ❌ RLS `WITH CHECK` |
| 26 | Delete the auth user; check their envelopes | gone (`ON DELETE CASCADE`) |
| 27 | `supabase db reset` from scratch (all migrations + seed) | ✅ clean apply |

Recommended: encode cases 1–26 as SDK-driven integration tests in `tests/integration/envelope.test.ts`, seeding parents via the Supabase client, so `bun run check` enforces them. **Case 15 (orphan tolerance) is the key D9 regression guard — keep it.**

---

## 12. Acceptance criteria

- [ ] **AC1** — One new migration `20260627060000_finance_create_envelope.sql` added to the **existing** `@nafios/db` package.
- [ ] **AC2** — `envelope_status` and `obligation_kind` enums and the `envelope` table exist with the exact columns, types, nullability, and defaults in §4 (**no** derived-metric columns; `obligation_kind` present but inert).
- [ ] **AC3** — All **four** CHECK constraints from §5 exist with those exact names/semantics.
- [ ] **AC4** — The **five real FKs** exist with correct `ON DELETE` (`user_id`/`ledger_id`→CASCADE, `category_id`→**RESTRICT**, `payment_source_id`/`linked_person_id`→SET NULL). The **two soft refs** (`template_id`, `carried_from_envelope_id`) exist as plain `uuid` columns with **NO FK constraint** (D9).
- [ ] **AC5** — The four indexes (`idx_envelope_ledger`, `idx_envelope_template_status`, `idx_envelope_person`, `idx_envelope_category`) exist with those exact names/columns.
- [ ] **AC6** — `updated_at` auto-maintained by `set_envelope_updated_at` (moddatetime); `created_at` never changed by it.
- [ ] **AC7** — RLS enabled and `owner_all` policy exists using the `(select auth.uid())` form.
- [ ] **AC8** — `ledger_id` uses a **simple** FK (no composite `(ledger_id, user_id)`) unless §13.1 is overridden; **no inbound `carry_over` FKs** created here.
- [ ] **AC9** — `supabase db reset` applies cleanly from scratch; `supabase db push` applies to `staging`.
- [ ] **AC10** — `src/database.types.ts` regenerated and committed.
- [ ] **AC11** — Every row of the §11 verification matrix behaves as specified — **including case 15 (orphan tolerance, D9)**.

---

## 13. Notes / decisions to confirm before the next table

1. **Cross-owner integrity hardening (DB-design open #7) — decided HERE.** Default: **simple** FK `ledger_id → monthly_ledger(id)` `CASCADE`; trust the insert path to keep `envelope.user_id = ledger.user_id`. Optional hardening: composite FK `envelope(ledger_id, user_id) → monthly_ledger(id, user_id)`, which needs `UNIQUE(id, user_id)` added to `monthly_ledger` (the EF1.1 §13.1 line that was left out). **Adding it later means altering BOTH tables — decide now.**
2. **Category-delete RESTRICT — must match EF1.5.** `envelope.category_id → category(id) RESTRICT` mirrors `template.category_id`. If EF1.5 switched to reassign-to-default, mirror that here for consistency (EF1.2 §13.1).
3. **Soft refs (D9) — confirm orphan tolerance (DB-design open #2).** `template_id` and `carried_from_envelope_id` carry **no FK**; orphaned ids are accepted over `SET NULL`. This is the biggest integrity trade-off in the model — worth an explicit sign-off. Case 15 is its regression guard.
4. **`obligation_kind` MVP inertness.** Column + enum created now, always NULL in MVP, **no CHECK** forcing NULL (faithful to design). Optionally add `check (obligation_kind is null)` as an MVP safety net (drop it in Phase 2). Decide.
5. **`carry_over_reason` "never emptied" is domain, not DB.** Only the ≥10-char length is a CHECK; the never-shortened-once-set rule is temporal → domain/repo (E7).
6. **No index on `carried_from_envelope_id`.** The design lists none (the forward link lives in `carry_over`). Confirm no read path needs to find "envelopes carried *from* X" efficiently before EF1.7.
7. **`updated_at` convention reused** — 5th table on the EF1.2 `moddatetime` pattern.

*Provenance (not required reading): the physical model and its rationale (decisions D1–D13, esp. D9/D11/D4 seam) live in the finance DB design doc and the DBML under `finance/planning/`; envelope behavior is described in `finance/specs/monthly-ledger.md` and `template.md`.*

---

## Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 0.1 | 2026-06-27 | NafiOS Foundation | Initial standalone task for the `envelope` table (the working surface): `envelope_status` + `obligation_kind` (Phase 2) enums, full column set, four CHECKs, five real FKs + two soft refs (D9, no FK), four indexes, `updated_at` trigger, RLS, verification matrix (incl. the D9 orphan-tolerance guard), acceptance criteria. Lands the cross-owner-integrity-hardening decision (open #7) and mirrors the category-delete RESTRICT from EF1.5. |
