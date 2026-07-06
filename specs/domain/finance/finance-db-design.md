# NafiOS Finance — Database Design (Postgres)

> **Status:** 🟡 Brainstorm / Iteration 1 — *reference material, not a spec.* Lives beside the finance specs in `specs/domain/finance/`; promote decisions into the governing specs once settled.
> **Scope:** Physical data model for the Finance MVP. Backs epic **E2** (data persistence layer) and is the storage counterpart to **EF1.2** (entity & enum types).
> **Stack:** **Supabase Postgres** (with Row Level Security), Drizzle ORM, Bun monorepo. DBML used for the visual model.
> **Source of truth (behavior):** [`finance-domain-spec.md`](./finance-domain-spec.md), [`monthly-ledger.md`](./monthly-ledger.md), [`template.md`](./template.md).
> **Last updated:** 2026-06-26

---

## 0. How to read this doc

1. **§1 Principles** — global Postgres conventions.
2. **§2 Key decisions** — the 13 modeling forks, each with rationale + the alternative we rejected. *This is the part to argue with during iteration.*
3. **§3 DBML** — the full visual model (paste into [dbdiagram.io](https://dbdiagram.io) to render the ERD).
4. **§4 Constraints DBML can't express** — CHECKs, partial unique indexes, generated columns (raw Postgres SQL).
5. **§5 Indexes** — and the queries that justify them.
6. **§6 Invariant → enforcement map** — every spec invariant, and where it's guarded.
7. **§7 Open questions** — for the next iteration.
8. **§8 Auth, ownership & RLS** — the Supabase row-isolation model (D12/D13).

Decision IDs (`D1`…`D13`) are referenced throughout and from the DBML notes.

---

## 1. Postgres conventions

| Concern | Choice |
|---|---|
| **Naming** | `snake_case` tables and columns (singular table names: `monthly_ledger`, `envelope`). Matches Drizzle + SQL idiom; the TS layer maps to camelCase. |
| **Primary keys** | `uuid`, default `gen_random_uuid()` (see **D1**). |
| **Money** | `numeric(12,2)` — never `float`/`real`, never the `money` type (locale-dependent). (**D2**) |
| **Month** | `date` normalized to the **first day of the month**, with a CHECK enforcing day = 1. (**D3**) |
| **Timestamps** | `timestamptz` (UTC). `created_at`/`updated_at` default `now()`. |
| **Enums** | Native Postgres `ENUM` types. (**D4**) |
| **Booleans/ints** | `boolean`, `integer`. |
| **Soft vs hard FK** | Ownership edges = real FKs with explicit `ON DELETE`. Historical back-references = soft (un-enforced) per **D9**. |
| **Ownership** | Every table carries `user_id uuid NOT NULL DEFAULT auth.uid()` → `auth.users(id) ON DELETE CASCADE`. (**D12**) |
| **Access control** | Row Level Security **enabled on every table**; owner-isolation policy `user_id = (select auth.uid())`. Migrations/seeds run as `service_role` (bypasses RLS). (**D13**) |

---

## 2. Key design decisions

### D1 — Primary keys: `uuid` (v7-preferred), `gen_random_uuid()` default
UUID PKs across all tables. Rationale: NafiOS is a multi-app suite with an AI/PA layer and a likely future sync/offline story — opaque, non-guessable, client-generatable ids age better than serial integers, and they don't leak row counts over the API. `gen_random_uuid()` is built into Postgres 13+ (no extension). If insert-locality becomes a measured problem, switch the default to a UUIDv7 generator (time-ordered) without changing the column type.
**Rejected:** `bigint generated always as identity` — simpler/smaller, but exposes sequence ordering and complicates the eventual multi-device/PA-write story.

### D2 — Money as `numeric(12,2)`
All amounts (`opening_balance`, `max_capped`, `amount`, `original_amount`, `default_amount`, policy `value`, snapshot metrics) are `numeric(12,2)`. Exact decimal arithmetic is mandatory — the spec pins the Jan 2027 figures *"to the cent"* (E14.2). `12,2` allows up to 9,999,999,999.99. **Never compute COL/ASM in floating point.**
**Rejected:** integer cents — works, but `numeric` keeps the schema readable and Drizzle/Postgres handle the precision natively.

### D3 — Month as first-of-month `date`
`month`, `next_due_month`, `end_month`, `last_used_month` stored as `date` pinned to day 1 (e.g. `2026-01-01` ⇔ `2026-01`), guarded by `CHECK (extract(day from col) = 1)`.
Rationale: native ordering (`<`, `<=`, `max`), trivial cursor advance (`next_due_month + interval '1 month'`), and clean range queries for "templates due `<= ledger.month`". The TS layer presents `'YYYY-MM'` (E1.2 `Month`); the repository maps both ways.
**Rejected:** `char(7)`/`text` `'YYYY-MM'` — lexical ordering happens to work but date math doesn't, and it invites malformed values. **Rejected:** `int` (`year*12+month`) — compact and orderable but unreadable in psql and awkward for humans debugging.

### D4 — Native Postgres `ENUM` types
One `CREATE TYPE … AS ENUM` per closed set (`ledger_status`, `envelope_status`, `template_type`, `recurring_template_status`, `account_type`, `person_relationship`, `max_capped_mode`, `max_capped_behavior`, `obligation_kind`, `carry_over_status`). Drizzle's `pgEnum` maps directly.
Rationale: storage-efficient, self-documenting, rejects invalid values at the DB boundary. These sets are stable; the one foreseeable growth (`obligation_kind` in Phase 2) only ever *adds* members (`ALTER TYPE … ADD VALUE`, which is online).
**Naming seam:** the `'carried-over'` domain literal becomes the `carried_over` enum label (Postgres identifiers forbid hyphens). The E2 mapping layer owns the translation — flagged in E1.2 §3.
**Rejected:** `text` + `CHECK (col in (…))` — easier to mutate but loses the named-type self-documentation and is more error-prone across tables.

### D5 — `template`: one table, discriminated by `type`
Both template types live in **one `template` table** (backlog E2.2), with recurring-only and adhoc-only columns nullable. Type-presence is enforced by CHECK constraints (§4). Rationale: shared shape (identity + defaults) is identical; one table keeps the `templateId` FK target singular and matches the unified domain entity (Decision 7.9). The domain layer reconstitutes the discriminated union (E1.2 §6).
**Rejected:** two tables (`recurring_template` + `adhoc_template`) — would force `envelope.template_id` to reference two tables (polymorphic FK — ugly in Postgres) or carry two nullable FKs. Single table wins.

### D6 — Carry-over panel as a first-class table (`carry_over`)
The template-centric carry-over panel is modeled as its own table, **not** derived purely from envelope state. Each row = one carry-over entry on a template's panel: `template_id`, `source_envelope_id` (UNIQUE), `status` (`outstanding`/`added`/`killed`), `kill_reason`, `added_envelope_id`.
Rationale: two facts are **not** derivable from envelope rows alone — (a) the **kill action + mandatory kill reason** (audit), and (b) the **acted-on lock** that freezes the source envelope's status once added/killed (ledger §4 "Acted-on locking"). The panel's *display* fields (item, amount, reason, carried-from month) are read through `source_envelope_id`, so they're never duplicated. "Added" links forward to the new envelope via `added_envelope_id`; the new envelope also points back via `carried_from_envelope_id` (the two are consistent by construction).
Lifecycle: on **revert before action** → row hard-deleted (panel entry disappears). On **add/kill** → row retained as history (template §6 "carry-over history"). `UNIQUE(source_envelope_id)` holds for the row's whole lifetime because an acted-on source envelope is locked and can never spawn a second entry.
**Rejected:** deriving the panel from `envelope WHERE status='carried-over'` — can't store kill reason, can't represent the lock, can't keep history after a template's fresh envelopes churn.

### D7 — Settlement summary as a 1:1 table (`ledger_settlement_summary`)
Derived metrics are computed-on-read everywhere **except** at settlement, where the spec freezes a snapshot (ledger §4 "On settlement"). Store that snapshot in a 1:1 table keyed by `ledger_id`: `col`, `health_margin`, `asm_contribution`, `paid_count`, `skipped_count`, `carried_over_count`, `total_envelopes` (plus a copy of `opening_balance`/`max_capped` for a fully self-contained historical record).
Rationale: the annual/history view (E13.2) renders settled months *from this snapshot* — typed columns keep that grid query simple and fast, and the row's existence cleanly signals "settled". Live ledgers compute metrics on the fly and have **no** row here.
**Rejected:** a `jsonb` column on `monthly_ledger` — flexible but un-typed and clumsy to aggregate across the year. **Rejected:** storing nothing and recomputing settled metrics on read — breaks immutability the moment envelope-amount edit rules or formulas ever change; a settled month must be frozen truth.

### D8 — Config as a `finance_settings` table, **one row per user**
The three config entities (`DefaultOpeningBalance`, `MaxCappedPolicy`, `LedgerCreationWindow`) collapse into **one `finance_settings` row per user** with columns for each. Rationale: they are always read/written together at ledger-creation time; splitting into three one-row-per-user tables is needless. `UNIQUE(user_id)` guarantees exactly one settings row per owner (this replaces the earlier `singleton boolean` trick — with ownership (D12), `user_id` *is* the singleton key).
**Rejected:** three tables (literal backlog E2.3 reading) — more migrations, more joins, no benefit. CRUD for E3.4/E3.5 still maps cleanly: they patch different columns of the one row.

### D9 — `template_id` and `carried_from_envelope_id` are **soft references**
The spec repeatedly mandates that hard-deleting a template **leaves the envelope's `templateId` intact as an orphaned historical reference**, "handled gracefully" (template §4, §6). A standard FK can't honor this: `RESTRICT` blocks the allowed delete, `SET NULL` erases the id the spec wants kept. Therefore `envelope.template_id` is an **indexed `uuid` column with no enforced FK** (a soft/logical reference). `carried_from_envelope_id` is likewise soft, because template-termination can hard-remove a source envelope while a downstream carried envelope still references it.
**Trade-off & alternative:** this sacrifices DB-level referential integrity on those two columns; the domain layer must tolerate dangling ids (it already must, per spec). If a team prefers strict integrity over literal spec fidelity, the alternative is FK `ON DELETE SET NULL` on both — accept losing the orphaned id. **Recommendation: soft reference**, to honor the spec as written. *(In the DBML below these appear as `Ref` lines for ERD readability, annotated `[soft]`; generate them WITHOUT a foreign-key constraint.)*

### D10 — `occurrences_remaining` is derived, not stored
Per template §3 ("derivation is an implementation decision") and Decision 7.14 (paid-only decrement). Compute on read: it's a function of `end_month`, the current month, and `count(envelope WHERE template_id = t AND status='paid')`. **Not** a column.
Rationale: a stored counter drifts the instant an envelope's status flips (and statuses are free-form, any→any). Deriving it makes drift structurally impossible — same philosophy as the on-read derived metrics.
**Rejected:** a maintained `occurrences_remaining` column — needs a trigger or app-side recompute on every envelope status change across every ledger; fragile.

### D11 — Live derived metrics are never stored
COL, Health Margin, ASM Contribution, Outstanding, Amendments are computed on read for `ongoing`/`reconciling` ledgers (ledger §5). No columns, no triggers. The only persisted metrics are the D7 settlement snapshot.

### D12 — Ownership via `user_id → auth.users(id)`, on every table
Because we deploy on **Supabase Postgres with RLS** (D13), ownership must be a first-class column the database can filter on, not an implicit "single user" assumption. **Every table** carries:

```sql
user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE
```

- `auth.uid()` is the Supabase helper that reads the authenticated user's id from the request JWT — so app-context inserts populate `user_id` automatically; the column is still overridable for `service_role` operations.
- `NOT NULL` is a safety net: a `service_role` insert with no auth context yields `auth.uid() = NULL` and **fails**, forcing explicit ownership in headless paths (seeds, jobs).
- `ON DELETE CASCADE` from `auth.users` means deleting an account cleans up all their finance data.

**Ownership is denormalized onto child tables** (`envelope`, `carry_over`, `ledger_settlement_summary`, `opening_balance_adjustment`) too — not just the roots. Rationale: RLS policies on child tables then read a local `user_id` column instead of a join/subquery to the parent, which is the [Supabase-recommended pattern](https://supabase.com/docs/guides/database/postgres/row-level-security) for fast, index-friendly policies. Cross-row consistency (child `user_id` = parent `user_id`) holds by construction because every insert stamps `auth.uid()`; the composite-FK hardening option is noted in §7.

**Uniqueness becomes per-user:** `UNIQUE(user_id, month)` on `monthly_ledger`, the one-ongoing partial index partitions by `user_id`, and `finance_settings` is `UNIQUE(user_id)` (D8). See §4.

> This supersedes the earlier "single-user, no `user_id`" stance. Household/joint mode (domain §6.4) is still Phase 2 — that's about *sharing one user's ledgers with another*, a separate concern layered on top of this per-user ownership.
**Rejected:** keeping ownership implicit and enforcing isolation only in app code — defeats RLS, and one missed `WHERE user_id =` leaks another user's finances. With RLS, the database is the backstop.

### D13 — Row Level Security enabled on every table; owner-isolation policy
RLS is **enabled and forced** on all finance tables. The baseline is one owner-isolation policy per table:

```sql
ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_all ON <t>
  FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
```

- `auth.uid()` is **wrapped in `(select …)`** — Postgres caches it as an initplan per statement instead of re-evaluating per row; this is the documented Supabase performance pattern and pairs with the `user_id` indexes (§5).
- `USING` gates reads/deletes/updates to owned rows; `WITH CHECK` blocks writing a row owned by someone else (e.g. can't insert/`UPDATE` `user_id` to another user).
- The app connects as the `authenticated` role so policies apply. **Migrations and seeds run as `service_role`, which bypasses RLS** — so seeding default categories etc. must set `user_id` explicitly.
- The soft-reference columns (D9) are unaffected: RLS filters on `user_id`, independent of whether `template_id` resolves.

Full policy SQL in **§8**.
**Rejected:** RLS off + app-layer scoping — see D12 rejection. **Rejected:** a single permissive policy for all roles — `service_role` already bypasses RLS, so policies should target `authenticated` and stay strict.

---

## 3. DBML model

> 📄 **The model lives in [`finance-schema.dbml`](./finance-schema.dbml)** — the single source of truth for the schema. Paste it into [dbdiagram.io](https://dbdiagram.io) to render the ERD.
>
> 10 tables (`category`, `account`, `person`, `template`, `monthly_ledger`, `envelope`, `carry_over`, `ledger_settlement_summary`, `finance_settings`, `opening_balance_adjustment`) and 10 enums. `Ref` lines commented `[soft]` are for ERD readability only — per **D9** they are generated WITHOUT a DB foreign-key constraint. CHECKs and the partial unique index that DBML can't express are in §4 below.

---

## 4. Constraints DBML can't express (raw Postgres)

These are the teeth behind the invariants. Apply as migration SQL (Drizzle supports raw SQL in migrations).

```sql
-- D3: month columns pinned to first-of-month
ALTER TABLE monthly_ledger ADD CONSTRAINT ck_ledger_month_first
  CHECK (extract(day from month) = 1);
ALTER TABLE template ADD CONSTRAINT ck_tpl_months_first
  CHECK ( (next_due_month IS NULL OR extract(day from next_due_month) = 1)
      AND (end_month       IS NULL OR extract(day from end_month)      = 1)
      AND (last_used_month IS NULL OR extract(day from last_used_month)= 1) );

-- Invariant: one ledger per month, PER USER (D12)
ALTER TABLE monthly_ledger ADD CONSTRAINT uq_ledger_user_month UNIQUE (user_id, month);
-- Invariant: at most ONE ongoing ledger PER USER (partial unique index)
CREATE UNIQUE INDEX uq_one_ongoing_ledger
  ON monthly_ledger (user_id) WHERE status = 'ongoing';

-- Invariant: maxCapped hard ceiling (2× opening) + non-negative money
ALTER TABLE monthly_ledger ADD CONSTRAINT ck_maxcapped_ceiling
  CHECK (max_capped <= 2 * opening_balance);
ALTER TABLE monthly_ledger ADD CONSTRAINT ck_balances_nonneg
  CHECK (opening_balance >= 0 AND max_capped >= 0);

-- ledger: settled_at present iff settled
ALTER TABLE monthly_ledger ADD CONSTRAINT ck_settled_at
  CHECK ((status = 'settled') = (settled_at IS NOT NULL));

-- envelope: amount non-negative ($0 allowed)
ALTER TABLE envelope ADD CONSTRAINT ck_env_amount_nonneg CHECK (amount >= 0);
-- envelope: paid_at present iff paid
ALTER TABLE envelope ADD CONSTRAINT ck_env_paid_at
  CHECK ((status = 'paid') = (paid_at IS NOT NULL));
-- envelope: carry-over reason >= 10 chars when present
ALTER TABLE envelope ADD CONSTRAINT ck_env_co_reason_len
  CHECK (carry_over_reason IS NULL OR char_length(carry_over_reason) >= 10);
-- envelope: original_amount only for template-linked
ALTER TABLE envelope ADD CONSTRAINT ck_env_original_amount
  CHECK (original_amount IS NULL OR template_id IS NOT NULL);

-- template: type-specific field presence (D5)
ALTER TABLE template ADD CONSTRAINT ck_tpl_recurring_shape CHECK (
  type <> 'recurring' OR (next_due_month IS NOT NULL AND status IS NOT NULL
                          AND archived IS NULL AND usage_count IS NULL) );
ALTER TABLE template ADD CONSTRAINT ck_tpl_adhoc_shape CHECK (
  type <> 'adhoc' OR (archived IS NOT NULL AND usage_count IS NOT NULL
                      AND next_due_month IS NULL AND end_month IS NULL
                      AND status IS NULL AND termination_reason IS NULL) );
-- template: termination reason required iff terminated
ALTER TABLE template ADD CONSTRAINT ck_tpl_termination_reason CHECK (
  status IS DISTINCT FROM 'terminated' OR termination_reason IS NOT NULL );
-- template: end_month not before next_due_month when both set
ALTER TABLE template ADD CONSTRAINT ck_tpl_end_after_due CHECK (
  end_month IS NULL OR next_due_month IS NULL OR end_month >= next_due_month );

-- carry_over: kill_reason required iff killed; added_envelope_id present iff added
ALTER TABLE carry_over ADD CONSTRAINT ck_co_kill_reason CHECK (
  (status = 'killed') = (kill_reason IS NOT NULL) );
ALTER TABLE carry_over ADD CONSTRAINT ck_co_added_env CHECK (
  (status = 'added') = (added_envelope_id IS NOT NULL) );

-- finance_settings: lead_days clamp 1..7 (D8); one row per user via UNIQUE(user_id)
ALTER TABLE finance_settings ADD CONSTRAINT ck_lead_days CHECK (lead_days BETWEEN 1 AND 7);
-- (UNIQUE(user_id) in the DBML guarantees one settings row per user — D8/D12)
```

> **RLS enable + owner-isolation policies** for all tables are in **§8** — apply them in the same migration set.

> **Note on "≥10 chars, never emptied":** the *length* is a CHECK; the *never-shortened-once-set* rule is temporal and belongs in the domain/repository layer (E7), not a column constraint.

---

## 5. Indexes & the queries they serve

All access is RLS-filtered on `user_id` (D13), so the hot-path indexes **lead with `user_id`** — that lets one index serve both the RLS predicate and the query.

| Index | Query it serves | Spec/epic |
|---|---|---|
| `uq_ledger_user_month (user_id, month)` unique | one ledger per month per user; month lookup | ledger §1; E2.1 |
| `uq_one_ongoing_ledger (user_id) WHERE status='ongoing'` | at most one `ongoing` per user | ledger §3; E14.1 |
| `idx_template_generation (user_id, type, status, next_due_month)` | "recurring `active` due `<= :month`" at ledger creation | template §4; E6.1, E2.4 |
| `idx_adhoc_library (user_id, type, archived, last_used_month)` | flat adhoc library, most-recently-used first | template §8; E6.6 |
| `idx_envelope_ledger (user_id, ledger_id)` | all envelopes for a ledger (the working surface) | ledger §1; E11.1 |
| `idx_envelope_template_status (user_id, template_id, status)` | paid-count for `occurrencesRemaining` (D10); outstanding COs | template §3; E6.4 |
| `idx_envelope_person (user_id, linked_person_id)` | annual outflow tied to a Person | domain §4; E13.3 |
| `idx_carryover_template_status (user_id, template_id, status)` | a template's outstanding-CO panel | template §6; E7.2 |
| `(user_id)` on `account`, `person`, `ledger_settlement_summary`, `opening_balance_adjustment` | RLS predicate + per-user listing | D13 |

---

## 6. Invariant → enforcement map

| Invariant (domain §5 / ledger §6) | Enforced where |
|---|---|
| Row isolation — a user only ever sees/writes their own data | **RLS** owner-isolation policy on every table (DB, D13) + `user_id` FK to `auth.users` (D12) |
| One ledger per financial month | `uq_ledger_user_month (user_id, month)` UNIQUE (DB) |
| At most one `ongoing` ledger | `uq_one_ongoing_ledger` partial unique index, per user (DB) |
| `maxCapped ≤ 2 × openingBalance` | `ck_maxcapped_ceiling` CHECK (DB) + domain guard (E4.3) |
| Amber-zone (`maxCapped > opening`) confirmation | **Domain only** (E4.3) — a confirmation flow, not a constraint |
| Every envelope belongs to exactly one category | `envelope.category_id NOT NULL` + FK (DB) |
| `COL = Σ amount where status ∈ {pending, paid}` | **Computed on read** (D11; E4.4) — never stored |
| `Health Margin = maxCapped − COL` | Computed on read (E4.4) |
| `ASM Contribution = openingBalance − COL` | Computed on read (E4.4) |
| Settled ledger is read-only / immutable | **Domain guard** (E5.1, E8.2) — app rejects writes; DB has no "frozen row" primitive |
| Opening Balance adjustments are logged | `opening_balance_adjustment` table (DB) + domain (E4.3) |
| No auto-creation; bounded creation window | **Domain only** (E4.1, E4.6) — a behavior, not storable |
| `carryOverReason` ≥ 10 chars | `ck_env_co_reason_len` CHECK (DB); "never emptied" in domain (E7) |
| `paidAt` set iff `paid` | `ck_env_paid_at` CHECK (DB) + side-effect logic (E5.3) |
| `occurrencesRemaining` paid-only | Derived (D10; E6.4) — structurally drift-free |
| Template `type` immutable | **Domain/repo convention** (E2.2, E6.7) — documented, not a DB trigger |

**Takeaway:** the DB enforces the *structural* invariants (uniqueness, ceilings, presence, value sets); the domain engine owns the *behavioral* ones (lifecycle gating, immutability, no-auto-creation, free-form transitions). This split is intentional — don't push lifecycle rules into triggers.

---

## 7. Open questions / next iteration

1. **Category delete behavior** (E3.1 leaves it open) — current model uses FK `RESTRICT` (block delete while envelopes/templates reference it). Alternative: reassign-to-default on delete. **Decide before E3.**
2. **Strict vs soft `template_id` FK (D9)** — confirm we accept dangling orphaned ids over `ON DELETE SET NULL`. Biggest integrity trade-off in the model; worth an explicit sign-off.
3. **Settlement snapshot: table (D7) vs `jsonb`** — typed table recommended; revisit if the snapshot shape proves volatile.
4. **`updated_at` maintenance** — DB trigger vs Drizzle `$onUpdate`. Lean Drizzle-side for portability; confirm.
5. **`carry_over` vs envelope-derived panel (D6)** — sanity-check the first-class table against the E7 implementation once that engine is built; collapse it if the kill-reason/lock turn out to live elsewhere.
6. **Audit scope** — is `opening_balance_adjustment` enough, or do we want a general `finance_audit_log` (kills, terminations, maxCapped edits)? MVP-minimal for now; revisit if PA-layer needs a unified history feed.
7. **Cross-owner integrity hardening (D12)** — denormalized `user_id` on children stays consistent by construction (every insert stamps `auth.uid()`), but nothing *forces* `envelope.user_id = ledger.user_id` at the DB. Optional hardening: composite FK `envelope (ledger_id, user_id) → monthly_ledger (id, user_id)` (needs `UNIQUE(id, user_id)` on the parent). Worth it, or trust the insert path? **Decide before E2.**
8. **`auth.uid()` under `service_role`** — confirm seeds/jobs always set `user_id` explicitly (the `NOT NULL` default will otherwise reject the row — intended, but the seed script must comply, E2.5).
9. **PA-layer access** — when the NafiOS PA writes finance data on the user's behalf, does it act as the user (user-scoped JWT, RLS applies) or via `service_role` (bypasses RLS, must self-scope)? Likely the former; confirm when the PA integration is specced (domain §6.5).

---

## 8. Auth, ownership & RLS (Supabase)

Ownership (D12) + RLS (D13) together guarantee the database **physically cannot** return one user's finances to another — even if an app-layer `WHERE user_id =` is forgotten. This section is the migration recipe.

### 8.1 Ownership column (every table)

```sql
-- Applied to: category, account, person, template, monthly_ledger, envelope,
--             carry_over, ledger_settlement_summary, finance_settings, opening_balance_adjustment
ALTER TABLE <t>
  ADD COLUMN user_id uuid NOT NULL DEFAULT auth.uid()
    REFERENCES auth.users (id) ON DELETE CASCADE;
CREATE INDEX idx_<t>_user ON <t> (user_id);   -- where not already the lead column of a composite index
```

> `auth.users` is **managed by Supabase Auth** — do not create or migrate it. The DBML stub (`Table auth.users { id }`) exists only so the ERD renders the ownership edges; **strip that table from generated migration SQL.**

### 8.2 Enable RLS + owner-isolation policy (every table)

```sql
ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;

CREATE POLICY owner_all ON <t>
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
```

- One `FOR ALL` policy covers select/insert/update/delete. Split into per-command policies later only if a table needs asymmetric rules.
- `TO authenticated` scopes the policy to logged-in users; `anon` gets nothing (no policy → deny).
- `(select auth.uid())` (subquery form) is evaluated **once per statement** (initplan), not per row — the documented Supabase performance pattern. Pair with the `user_id` indexes (§5).
- `service_role` **bypasses RLS entirely** — used by migrations, the seed script (E2.5), and any trusted backend job. Those paths must set `user_id` explicitly (§7.8).

### 8.3 What RLS does *not* do

RLS is row-visibility only. It does **not** enforce the behavioral invariants — settled-immutability, the creation window, free-form status transitions, the maxCapped amber-zone confirmation. Those remain the domain engine's job (§6). RLS is the *isolation* backstop; the domain engine is the *correctness* backstop.

---

## Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 0.2 | 2026-06-26 | NafiOS Foundation | **Ownership & RLS for Supabase.** Reworked D12 from "single-user, no `user_id`" to ownership on every table (`user_id → auth.users(id)`, `DEFAULT auth.uid()`, `ON DELETE CASCADE`), denormalized onto child tables for fast RLS. Added D13 (RLS enabled + owner-isolation policy). Made uniqueness per-user (`UNIQUE(user_id, month)`; one-ongoing partial index per user; `finance_settings` `UNIQUE(user_id)`, dropping the `singleton` column). New §8 (migration recipe), updated §1 conventions, §4 constraints, §5 indexes (lead with `user_id`), §6 invariant map (+ row-isolation), §7 open questions. Schema bumped to D1–D13. |
| 0.1 | 2026-06-26 | NafiOS Foundation | Initial DB design brainstorm. Postgres conventions; decisions D1–D12; full DBML model (10 tables, 10 enums); CHECK/partial-index constraint appendix; index→query and invariant→enforcement maps; open questions. Storage counterpart to E1.2. |
