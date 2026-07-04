# EF1.4 — Design & create the `person` table

> - `M0`
> - `type:feature`
> - `module:finance`
> - `area:data`
> - `P0`
> - `size:S`
> - **Epic:** EF1 — Finance Data Foundation

> **This ticket is self-contained.** Everything needed to add the migration, create the table, secure it, and verify it is in this file. No other document is required. Stack: **Supabase Postgres**, schema managed by the **Supabase CLI** (raw SQL migrations), runtime data access via the **Supabase JS SDK** (`@supabase/supabase-js`). **No ORM / no Drizzle.**
>
> **Assumes EF1.1–EF1.3 are done:** the `@nafios/db` package + migration system (EF1.1) and the `moddatetime` `updated_at` convention (EF1.2) already exist. This ticket is **purely additive** — one new migration.

---

## 1. What you're building

Create one Postgres table, `person`, plus its enum (`person_relationship`), an `updated_at` trigger (reusing the EF1.2 convention), an index, and its row-level-security policy.

**What a person is (domain context):** A person is **someone the user links spending to** — for tracking outflow tied to a relationship. E.g. money spent "for my child", "to my parent", "for my spouse". Later, an envelope (and a template's default) can optionally name a `linked_person_id`, which feeds the **annual outflow-per-person view** (domain §4; report ticket E13.3). This table just defines the pickable list of people; it carries a display name and a relationship type and nothing more.

This is a **root table**: its only foreign key points at Supabase's built-in `auth.users`. It depends on no other app table.

**`person` is the near-twin of `account` (EF1.3)** — same shape (root table, one enum, `SET NULL` inbound FKs, `updated_at` via the shared trigger). The only real differences:
- the enum is `person_relationship` (`spouse` / `parent` / `child` / `other`) instead of `account_type`;
- `name` is `varchar(120)` (full human names) instead of `varchar(80)`.

Everything else is identical to EF1.3 by design.

---

## 2. The rules this table must enforce (and why)

1. **A user only ever sees and writes their own people.** Enforced via row-level security.
2. **`relationship` is one of a fixed set.** `spouse`, `parent`, `child`, or `other`. → native Postgres `ENUM` (`person_relationship`) rejects invalid values at the DB boundary.
3. **`updated_at` always reflects the last edit.** A person is editable (rename, change relationship). → the `moddatetime` `BEFORE UPDATE` trigger from EF1.2; `created_at` never changes.
4. **Deleting an account (the auth user) removes its people.** → `user_id` FK `ON DELETE CASCADE`.

> **NOT this table's job** — do not encode these here:
> - **Any contact details** (email, phone, address) — out of scope at MVP; a person is a label + relationship only.
> - **Any spending totals / aggregates per person.** The annual outflow-per-person figure is **computed on read** from envelopes (E13.3) — never stored here.
> - **Blocking deletion of a person that's in use.** Not needed — the child FKs are `SET NULL` (deleting a person clears `linked_person_id` on templates/envelopes). See §3.
> - **Name uniqueness or non-empty validation.** No `UNIQUE(user_id, name)` and no non-empty CHECK are specified; flagged for a decision in §13.

---

## 3. Relationships (verified against the full DB design)

**Outbound FK — created in THIS migration:**

| Column | References | On delete | Why |
|---|---|---|---|
| `user_id` | `auth.users(id)` (Supabase-managed) | `CASCADE` | Ownership. Deleting an account removes all their finance data. |

**Inbound FKs — created by LATER tickets (do NOT create them here), but you must know `person.id` will be a foreign-key target:**

| Future table | Column | Null | On delete | Relationship |
|---|---|---|---|---|
| `template` | `default_linked_person_id → person.id` | NULL | **`SET NULL`** | a template's default linked person (optional) |
| `envelope` | `linked_person_id → person.id` | NULL | **`SET NULL`** | the person an envelope's spend is tied to (optional) |

**Implications for this ticket:**
- `id` must be a stable, single-column primary key (it is — `uuid` PK).
- **Deleting a person is unconditionally allowed** — the child FKs are `SET NULL`, so removing a person simply clears `linked_person_id` / `default_linked_person_id`. **No category-style "RESTRICT vs reassign" decision here** (same as `account`).
- `person.id` will be a **query target** for the annual outflow-per-person report — but the supporting index (`idx_envelope_person` on `(user_id, linked_person_id)`) lives on the **`envelope`** table (EF1.6), not here.
- Those child FKs are created in the `template` / `envelope` tickets, **not here.** No other table references `person`.

---

## 4. Columns

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. Opaque random UUID. |
| `user_id` | `uuid` | NOT NULL | `auth.uid()` | Owner. FK → `auth.users(id)` `ON DELETE CASCADE`. Filled from the request JWT. Drives RLS. (See `service_role` note in §6.) |
| `name` | `varchar(120)` | NOT NULL | — | The person's display name, e.g. "Aisha". `120` — wider than other label tables since full human names run long. |
| `relationship` | `person_relationship` | NOT NULL | — | `spouse` \| `parent` \| `child` \| `other`. No default — the user picks one on create. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | When the person was created. Never changes. |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Last-modified stamp. Kept current by the trigger in §6, not by app code. |

**Implementation notes:**
- **Table name is singular** (`person`); columns are `snake_case`.
- **`relationship` has no default** (like `account.type`) — the user chooses; app/UI must supply it on insert.
- **`name` is `varchar(120)`** — note the deliberate width difference from `account`/`category` (`80`).

---

## 5. Enum, index (no CHECK constraints)

Use these **exact names** — later tickets and the verification tests reference them.

**Enum:** `person_relationship` with members `spouse`, `parent`, `child`, `other`.

| Name | Kind | Definition | Rule (§2) |
|---|---|---|---|
| `idx_person_user` | INDEX | `(user_id)` | #1 RLS predicate + per-user listing |

- `idx_person_user` *is* the `user_id` index — no separate one needed.
- **No CHECK constraints** are specified; the enum enforces valid `relationship`. (Name-non-empty / uniqueness flagged in §13.)
- `'other'` is the catch-all for MVP. Adding members later is an online `ALTER TYPE person_relationship ADD VALUE …` (§13.4).

---

## 6. `updated_at` trigger + Row-Level Security

### 6.1 `updated_at` auto-maintenance (reuse EF1.2 convention)

`person` carries `updated_at`, so it reuses the module-wide pattern: the **`moddatetime`** extension + a per-table `BEFORE UPDATE` trigger stamping `updated_at = now()`.

- `create extension if not exists moddatetime` is **idempotent** — the extension already exists from EF1.2.
- This table gets its **own** trigger, `set_person_updated_at`, bound to its `updated_at` column.

### 6.2 Row-Level Security

Enable RLS and add one owner-isolation policy. Wrap `auth.uid()` in `(select …)` so Postgres evaluates it once per statement, not per row.

- `USING` gates reads/updates/deletes to owned rows; `WITH CHECK` blocks inserting or reassigning a row to another user.
- `TO authenticated` scopes it to logged-in users; `anon` has no policy → denied.
- **`service_role` bypasses RLS** (migrations/seeds). Because `user_id` defaults to `auth.uid()` — NULL with no logged-in user — a `service_role` insert that omits `user_id` will **fail the NOT NULL on purpose**. Seeds/jobs must set `user_id` explicitly.
- `auth.users` is **managed by Supabase** — reference it, never create or migrate it.

(Exact SQL is in the migration in §8.)

---

## 7. Adding the migration (additive — the package already exists)

The `@nafios/db` package, the Supabase CLI setup (EF1.1), and the `moddatetime` extension (EF1.2) already exist. This ticket only **adds a migration and a test file**.

### 7.1 Files touched

```
packages/db/
├── supabase/
│   └── migrations/
│       └── 20260627040000_finance_create_person.sql   # NEW — this ticket
├── src/
│   └── database.types.ts                               # REGENERATED (do not hand-edit)
└── tests/
    └── integration/
        └── person.test.ts                              # NEW — the §11 matrix as SDK tests
```

> Migration filename is module-namespaced and **timestamp-ordered after** EF1.3's account migration. `person` is an independent root table, so relative order doesn't matter for FKs — but keep timestamps monotonic.

### 7.2 Commands

```bash
# from packages/db/
supabase migration new finance_create_person   # creates the timestamped SQL file
# paste the SQL from §8 into that file, then:
supabase db reset                               # rebuild local DB: ALL migrations + seed
bun run db:types                                # regenerate src/database.types.ts for the SDK
bun test                                        # run the §11 integration tests
```

### 7.3 Standards / hard rules (unchanged)

- **Migrations are immutable once merged/applied.** Add a new one; never edit an applied migration. The §9 rollback is for local iteration only.
- **`supabase db reset` must succeed from scratch** (clean DB → all migrations → seed).
- **Regenerate `database.types.ts`** whenever the schema changes; commit it (generated, do not hand-edit).
- **Staging:** push directly to the `staging` Supabase project from local dev with `supabase db push` (no CI/CD pipeline in this epic). Run `bun run check` locally first; this migration must apply cleanly to `staging`.

---

## 8. The migration SQL (`20260627040000_finance_create_person.sql`)

```sql
-- updated_at auto-maintenance — reuses the module convention from EF1.2 (idempotent).
create extension if not exists moddatetime schema extensions;

-- relationship kinds for a linked person
create type person_relationship as enum ('spouse', 'parent', 'child', 'other');

-- person: someone the user links spending to (label + relationship only).
create table person (
  id           uuid                primary key default gen_random_uuid(),
  user_id      uuid                not null default auth.uid()
                                     references auth.users (id) on delete cascade,
  name         varchar(120)        not null,
  relationship person_relationship not null,
  created_at   timestamptz         not null default now(),
  updated_at   timestamptz         not null default now()
);

-- per-user listing (also serves the RLS user_id predicate)
create index idx_person_user on person (user_id);

-- keep updated_at current on every UPDATE (cannot be forgotten by app code)
create trigger set_person_updated_at
  before update on person
  for each row
  execute function extensions.moddatetime (updated_at);

-- row-level security: a user sees/writes only their own people
alter table person enable row level security;

create policy owner_all on person
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

---

## 9. Rollback (local iteration only)

Applied migrations are immutable; this is for re-running locally before merge. Prefer `supabase db reset`.

```sql
drop table if exists person;            -- drops its index, trigger & policy too
drop type  if exists person_relationship;
-- leave the moddatetime extension in place; other tables reuse it.
```

---

## 10. SDK type generation

After the migration applies, run `bun run db:types` (`supabase gen types typescript --local`). This refreshes `src/database.types.ts`, typing `person` rows and the `person_relationship` enum for the Supabase JS SDK — so the later `template`/`envelope` tickets reference `person.id` type-safely. No hand-written types.

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
| 1 | Insert valid row (`name='Aisha'`, `relationship='child'`) | ✅ inserts |
| 2 | Insert `relationship='spouse'` / `'parent'` / `'other'` | ✅ all insert |
| 3 | Insert `relationship='sibling'` (not an enum member) | ❌ invalid enum value |
| 4 | Insert with `name=NULL` | ❌ NOT NULL violation |
| 5 | Insert with `relationship=NULL` (omitted, no default) | ❌ NOT NULL violation |
| 6 | Insert `name` of 121 chars | ❌ value too long for `varchar(120)` |
| 7 | Insert two people with the **same** `(user_id, name)` | ✅ both (no uniqueness — documents the §13 decision) |
| 8 | `UPDATE` a row's `name` (or `relationship`) | ✅ `updated_at` advances; `created_at` unchanged (trigger works) |
| 9 | As user A, `select` a person owned by user B | 0 rows (RLS) |
| 10 | As user A, `insert` with `user_id` = user B | ❌ RLS `WITH CHECK` |
| 11 | Delete the auth user; check their people | gone (`ON DELETE CASCADE`) |
| 12 | `supabase db reset` from scratch (all migrations + seed) | ✅ clean apply |

Recommended: encode cases 1–11 as SDK-driven integration tests in `tests/integration/person.test.ts` using the two test users, so `bun run check` enforces them.

---

## 12. Acceptance criteria

- [ ] **AC1** — One new migration `20260627040000_finance_create_person.sql` is added to the **existing** `@nafios/db` package (no new package, no re-bootstrap).
- [ ] **AC2** — `person_relationship` enum (`spouse`, `parent`, `child`, `other`) and `person` table exist with the exact columns, types, nullability, and defaults in §4 (`name` is `varchar(120)`; `relationship` has **no** default; **no** contact/aggregate columns).
- [ ] **AC3** — `idx_person_user` index exists on `(user_id)` with that exact name.
- [ ] **AC4** — `updated_at` is auto-maintained by the `set_person_updated_at` `BEFORE UPDATE` trigger (moddatetime), reusing the EF1.2 convention; `created_at` is never changed by it.
- [ ] **AC5** — RLS is enabled and the `owner_all` policy exists, using the `(select auth.uid())` form (§6.2).
- [ ] **AC6** — `user_id` FK targets `auth.users(id)` with `ON DELETE CASCADE`; `auth.users` is referenced only, never created. **No inbound FKs** (template/envelope linked-person) created here.
- [ ] **AC7** — `supabase db reset` applies cleanly from scratch locally, and `supabase db push` applies to `staging`.
- [ ] **AC8** — `src/database.types.ts` is regenerated for the SDK and committed (not hand-edited).
- [ ] **AC9** — Every row of the §11 verification matrix behaves as specified.
- [ ] **AC10** — No contact details, per-person aggregates, uniqueness, or non-empty CHECK were added (§2 "NOT this table's job").

---

## 13. Notes / decisions to confirm before the next tables

1. **No category-style delete decision (same as `account`).** Person-delete is unconditionally allowed; the child FKs (`template.default_linked_person_id`, `envelope.linked_person_id`) are `SET NULL`, created in their own tickets. Nothing to decide here.
2. **`updated_at` convention reused.** This is the **third** table on the EF1.2 `moddatetime` pattern (after `category`, `account`). Keep applying it identically.
3. **Name uniqueness per user.** Not enforced today — `(user_id, name)` duplicates allowed (matrix #7). Decide whether to add `UNIQUE(user_id, name)` before person CRUD (E3.x). (Likely *not* wanted here — two different people can legitimately share a name.)
4. **`person_relationship` extensibility.** `spouse` / `parent` / `child` / `other` cover MVP, with `other` as the catch-all (e.g. sibling, friend). Adding a member later is an online `ALTER TYPE … ADD VALUE …` (members can only be added). Confirm the MVP set is sufficient.
5. **Per-person spending is derived, never stored.** The annual outflow-per-person figure (E13.3) is computed on read from envelopes; the supporting index lives on `envelope` (EF1.6). No aggregate column on `person`.

*Provenance (not required reading): the physical model and its rationale (decisions D1–D13) live in the finance DB design doc and the DBML under `finance/planning/`; person behavior is described in the finance specs under `finance/specs/` (domain §4).*

---

## Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 0.1 | 2026-06-27 | NafiOS Foundation | Initial standalone task for the `person` table: `person_relationship` enum, columns (`name varchar(120)`), index, `updated_at` trigger (reuses the EF1.2 moddatetime convention), RLS, migration SQL, verification matrix, acceptance criteria. Near-twin of EF1.3 (`account`); SET-NULL inbound FKs, no delete decision. |
