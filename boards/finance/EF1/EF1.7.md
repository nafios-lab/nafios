# EF1.7 — Design & create the `carry_over` table

> - `M0`
> - `type:feature`
> - `module:finance`
> - `area:data`
> - `P0`
> - `size:M`
> - **Epic:** EF1 — Finance Data Foundation

> **This ticket is self-contained.** Everything needed to add the migration, create the table, secure it, and verify it is in this file. Stack: **Supabase Postgres**, schema via the **Supabase CLI** (raw SQL migrations), runtime access via the **Supabase JS SDK**. **No ORM / no Drizzle.**
>
> **Assumes EF1.1–EF1.6 are done.** This table has **real FKs to both `template` (EF1.5) and `envelope` (EF1.6)** — both must already be migrated. Purely additive — one new migration.

---

## 1. What you're building

Create one Postgres table, `carry_over`, plus its enum (`carry_over_status`), **two CHECK constraints**, **four foreign keys**, a **unique constraint on `source_envelope_id`**, one index, and the RLS policy. **Note: `carry_over` has no `updated_at`** — so, unlike most tables, it gets **no `moddatetime` trigger** (see §6).

**What a carry-over entry is (domain context — D6):** When an envelope tied to a recurring template goes **unpaid at month end** and the user carries it forward, a row is added to that **template's carry-over panel**. Each `carry_over` row = one such entry. It tracks a small lifecycle:

- **`outstanding`** — the carried line is sitting on the panel, not yet acted on.
- **`added`** — the user pulled it into the new month; `added_envelope_id` points at the **new** envelope created.
- **`killed`** — the user dismissed it; `kill_reason` (mandatory) records why.

**Why this is a first-class table (D6), not derived from envelope state:** two facts can't be reconstructed from envelope rows alone — (a) the **kill action + mandatory kill reason** (audit), and (b) the **acted-on lock** that freezes the source envelope once added/killed. The panel's *display* fields (item, amount, reason, carried-from month) are read **through `source_envelope_id`**, never duplicated.

---

## 2. The rules this table must enforce (and why)

1. **A kill must say why; only a kill has a reason.** → `ck_co_kill_reason`: `(status = 'killed') = (kill_reason IS NOT NULL)`.
2. **An "added" entry points at exactly the new envelope; only "added" does.** → `ck_co_added_env`: `(status = 'added') = (added_envelope_id IS NOT NULL)`.
3. **One panel entry per source envelope, for its whole lifetime.** An acted-on source envelope is locked and can never spawn a second entry. → `UNIQUE(source_envelope_id)`.
4. **An entry belongs to one template and one source envelope; deleting either removes the entry.** → FKs `CASCADE` to `template` and `envelope`.
5. **A user only ever sees/writes their own entries.** → RLS owner-isolation policy.

> **NOT this table's job:**
> - **The acted-on lock itself** (freezing the *source envelope's* status once added/killed) — `envelope.status` is free-form; the freeze is a **domain guard** (E7), not a DB constraint here. This table's *existence* represents the lock; it doesn't enforce it on the envelope row.
> - **Hard-deleting the row on "revert before action"** — that's a domain operation (delete the `outstanding` row); the DB just permits the delete.
> - **Reading the display fields** — joined from `envelope` via `source_envelope_id` at read time; never copied here.

---

## 3. Relationships (verified against the full DB design)

**Real FKs — created in THIS migration (no soft refs here):**

| Column | References | Null | On delete | Why |
|---|---|---|---|---|
| `user_id` | `auth.users(id)` | NOT NULL | `CASCADE` | Ownership. Drives RLS. |
| `template_id` | `template(id)` (EF1.5) | **NOT NULL** | **`CASCADE`** | The panel owner; deleting the template clears its panel. |
| `source_envelope_id` | `envelope(id)` (EF1.6) | **NOT NULL, UNIQUE** | **`CASCADE`** | The envelope marked carried-over; one entry per source. |
| `added_envelope_id` | `envelope(id)` (EF1.6) | NULL | **`SET NULL`** ⚠️ | The new envelope an "added" entry produced. **See §13.1 — this SET NULL conflicts with `ck_co_added_env`.** |

**Implications for this ticket:**
- **⚠️ `added_envelope_id` `SET NULL` vs `ck_co_added_env` conflict.** If the **added** envelope is deleted (directly, or via its ledger's `CASCADE`), `SET NULL` fires → `added_envelope_id` becomes NULL while `status` is still `'added'` → **`ck_co_added_env` is violated and the delete is rejected.** That can block deleting the new month's ledger. This is a real tension between D6's history retention and the SET NULL. **Must be resolved — see §13.1.** This ticket implements the design as written (SET NULL + CHECK) and the matrix documents the behavior.
- **Lifecycle (D6):** `outstanding` rows are **hard-deleted** if the source reverts before action; `added`/`killed` rows are **retained as history**. `UNIQUE(source_envelope_id)` holds for the row's whole lifetime.
- No inbound FKs — nothing references `carry_over`.

---

## 4. Columns

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key. |
| `user_id` | `uuid` | NOT NULL | `auth.uid()` | Owner. FK → `auth.users(id)` `CASCADE`. Drives RLS. |
| `template_id` | `uuid` | NOT NULL | — | FK → `template(id)` `CASCADE`. The panel this entry belongs to. |
| `source_envelope_id` | `uuid` | NOT NULL | — | **UNIQUE.** FK → `envelope(id)` `CASCADE`. The carried-over envelope; display fields read through it. |
| `status` | `carry_over_status` | NOT NULL | `'outstanding'` | `outstanding` \| `added` \| `killed`. |
| `kill_reason` | `text` | NULL | — | Required **iff** `status = 'killed'` (CHECK). |
| `added_envelope_id` | `uuid` | NULL | — | Set **iff** `status = 'added'` (CHECK). FK → `envelope(id)` `SET NULL` ⚠️ (§13.1). |
| `created_at` | `timestamptz` | NOT NULL | `now()` | When the entry was created. |
| `resolved_at` | `timestamptz` | NULL | — | Set when `status` leaves `outstanding` (domain-set; no CHECK — see §13.2). |

**Implementation notes:**
- **No `updated_at`** on this table — the row is created once and transitions status at most once (to `added`/`killed`, stamping `resolved_at`). So **no `moddatetime` trigger** (like `monthly_ledger`).
- The new envelope (`added_envelope_id`) also points **back** at the source via its own `carried_from_envelope_id` (soft ref, EF1.6) — the two are consistent by construction.

---

## 5. Enum, constraints & index

**Enum:** `carry_over_status` — `outstanding`, `added`, `killed`.

| Name | Kind | Definition | Rule (§2) |
|---|---|---|---|
| `ck_co_kill_reason` | CHECK | `(status = 'killed') = (kill_reason IS NOT NULL)` | #1 |
| `ck_co_added_env` | CHECK | `(status = 'added') = (added_envelope_id IS NOT NULL)` | #2 |
| `uq_carryover_source` | UNIQUE | `(source_envelope_id)` | #3 one entry per source |
| `idx_carryover_template_status` | INDEX | `(user_id, template_id, status)` | a template's outstanding-CO panel (E7.2); also serves RLS |

---

## 6. Trigger + Row-Level Security

- **No `updated_at` trigger** — this table has no `updated_at` column (§4).
- **RLS:** enable + one owner-isolation `owner_all` policy with the `(select auth.uid())` form (`USING` + `WITH CHECK`), `TO authenticated`. `service_role` bypasses RLS (seeds set `user_id` explicitly). `auth.users`, `template`, `envelope` are referenced, not created.

(Exact SQL in §8.)

---

## 7. Adding the migration (additive)

Adds `supabase/migrations/20260627070000_finance_create_carry_over.sql` and `tests/integration/carry-over.test.ts`; regenerates `src/database.types.ts`. Timestamp-ordered **after** EF1.6 (needs `template` + `envelope`). Commands: `supabase migration new finance_create_carry_over` → paste §8 → `supabase db reset` → `bun run db:types` → `bun test`. Hard rules (immutable migrations, `db reset` clean from scratch, regenerate+commit types, direct `db push` to `staging` from local dev — no CI/CD pipeline) are unchanged from EF1.1 §7.

---

## 8. The migration SQL (`20260627070000_finance_create_carry_over.sql`)

```sql
-- carry-over panel entry lifecycle
create type carry_over_status as enum ('outstanding', 'added', 'killed');

-- carry_over: one entry on a template's carry-over panel (D6). No updated_at.
create table carry_over (
  id                 uuid              primary key default gen_random_uuid(),
  user_id            uuid              not null default auth.uid()
                                         references auth.users (id) on delete cascade,
  template_id        uuid              not null
                                         references template (id) on delete cascade,
  source_envelope_id uuid              not null
                                         references envelope (id) on delete cascade,
  status             carry_over_status not null default 'outstanding',
  kill_reason        text,
  added_envelope_id  uuid              references envelope (id) on delete set null,  -- ⚠ see EF1.7 §13.1
  created_at         timestamptz       not null default now(),
  resolved_at        timestamptz,

  constraint uq_carryover_source unique (source_envelope_id),
  constraint ck_co_kill_reason   check ((status = 'killed') = (kill_reason is not null)),
  constraint ck_co_added_env     check ((status = 'added')  = (added_envelope_id is not null))
);

-- a template's panel, filtered by status (also serves the RLS user_id predicate)
create index idx_carryover_template_status on carry_over (user_id, template_id, status);

-- row-level security: a user sees/writes only their own carry-over entries
alter table carry_over enable row level security;

create policy owner_all on carry_over
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

---

## 9. Rollback (local iteration only)

```sql
drop table if exists carry_over;          -- drops its index & policy too
drop type  if exists carry_over_status;
```

---

## 10. SDK type generation

Run `bun run db:types` after applying. Types `carry_over` rows + the `carry_over_status` enum for the SDK. The display fields are NOT on this row — the repository joins `envelope` via `source_envelope_id`.

---

## 11. Verification matrix

Setup: reuse EF1.1's two seed users. As the test user, insert a recurring `template` (`<tpl>`), a source `envelope` marked carried-over (`<srcEnv>`), and a second envelope to play the "added" role (`<newEnv>`).

```sql
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"00000000-0000-0000-0000-00000000000a"}';
reset role;   -- between cases
```

| # | Action | Expected |
|---|---|---|
| 1 | `template_id=<tpl>, source_envelope_id=<srcEnv>, status=outstanding` | ✅ inserts |
| 2 | `status=added, added_envelope_id=<newEnv>` (different source) | ✅ inserts |
| 3 | `status=killed, kill_reason='no longer relevant this year'` | ✅ inserts |
| 4 | `status=killed, kill_reason=NULL` | ❌ `ck_co_kill_reason` |
| 5 | `status=outstanding, kill_reason='x...'` (reason without kill) | ❌ `ck_co_kill_reason` |
| 6 | `status=added, added_envelope_id=NULL` | ❌ `ck_co_added_env` |
| 7 | `status=outstanding, added_envelope_id=<newEnv>` | ❌ `ck_co_added_env` |
| 8 | Second row with the **same** `source_envelope_id` | ❌ `uq_carryover_source` |
| 9 | `status='resolved'` (not a member) | ❌ invalid enum value |
| 10 | `template_id=<random>` / `source_envelope_id=<random>` | ❌ FK violation |
| 11 | Delete the `<tpl>` template | ✅ its `carry_over` rows cascade-deleted |
| 12 | Delete the `<srcEnv>` source envelope | ✅ the entry cascade-deleted |
| 13 | ⚠️ Delete the `<newEnv>` while the row has `status='added'` | **❌ `ck_co_added_env`** — `SET NULL` collides with the CHECK (documents §13.1) |
| 14 | As user A, `select`/`insert` a row owned by user B | 0 rows / ❌ RLS `WITH CHECK` |
| 15 | Delete the auth user; check their entries | gone (`CASCADE`) |
| 16 | `supabase db reset` from scratch | ✅ clean apply |

Recommended: encode 1–15 as SDK tests in `tests/integration/carry-over.test.ts`. **Case 13 is the §13.1 regression marker — keep it until that decision is resolved.**

---

## 12. Acceptance criteria

- [ ] **AC1** — Migration `20260627070000_finance_create_carry_over.sql` added to the existing `@nafios/db` package.
- [ ] **AC2** — `carry_over_status` enum and `carry_over` table exist with the exact columns/types/defaults in §4 (**no `updated_at`**).
- [ ] **AC3** — Both CHECKs (`ck_co_kill_reason`, `ck_co_added_env`) and `uq_carryover_source` exist with those exact names.
- [ ] **AC4** — Four FKs exist with correct `ON DELETE` (`user_id`/`template_id`/`source_envelope_id`→CASCADE, `added_envelope_id`→SET NULL).
- [ ] **AC5** — `idx_carryover_template_status` exists; RLS enabled + `owner_all` policy with `(select auth.uid())`.
- [ ] **AC6** — **No `moddatetime` trigger** (no `updated_at`).
- [ ] **AC7** — `supabase db reset` clean from scratch; `db push` to `staging`; `database.types.ts` regenerated + committed.
- [ ] **AC8** — Every §11 case behaves as specified, **including case 13** (the documented SET-NULL/CHECK conflict).

---

## 13. Notes / decisions to confirm

1. **⚠️ `added_envelope_id` `SET NULL` conflicts with `ck_co_added_env` — MUST resolve.** Deleting the added envelope (or its ledger, via cascade) sets `added_envelope_id=NULL` while `status='added'`, violating the CHECK and blocking the delete. Options: **(a)** make `added_envelope_id` a **soft ref (D9-style, no FK)** so the history pointer may dangle — *recommended*, consistent with `envelope.carried_from_envelope_id*; **(b)** `ON DELETE CASCADE` (deleting the added envelope deletes the history row — loses history); **(c)** relax `ck_co_added_env` to enforce presence only at write time (needs a trigger). This ticket ships the design-as-written (a); flag for the design owner. Fold the decision back into `finance-db-design.md` D6/§4.
2. **`resolved_at` has no CHECK.** The design sets it "when status leaves outstanding" but specifies no constraint. Optionally add `check ((status = 'outstanding') = (resolved_at is null))`. Decide.
3. **Acted-on lock is domain-enforced**, not a DB constraint (E7). Confirm the domain layer freezes the source envelope's status once a `carry_over` row is `added`/`killed`.
4. **`carry_over` has no `updated_at`** by design — confirm no consumer expects a general row-update stamp (it has `created_at` + `resolved_at` only).

*Provenance: D6 + §4 constraints in `finance-db-design.md`; carry-over behavior in `finance/specs/monthly-ledger.md` §4 and `template.md` §6.*

---

## Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 0.1 | 2026-06-27 | NafiOS Foundation | Initial standalone task for the `carry_over` table (D6 first-class panel): `carry_over_status` enum, columns (no `updated_at`), two status-conditional CHECKs, `UNIQUE(source_envelope_id)`, four FKs, panel index, RLS, verification matrix, acceptance criteria. Flags the `added_envelope_id` SET-NULL vs `ck_co_added_env` conflict as a must-resolve design decision (§13.1). |
