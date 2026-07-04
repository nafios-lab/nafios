# EF1.11 — Composite-key ownership hardening (cross-table)

> - `M0`
> - `type:feature`
> - `module:finance`
> - `area:data`
> - `P1`
> - `size:S`
> - **Epic:** EF1 — Finance Data Foundation

> **This ticket is self-contained.** Everything needed to add the ownership-pinning keys and verify them is in this file. Stack: **Supabase Postgres**, schema via the **Supabase CLI** (raw SQL migrations), runtime access via the **Supabase JS SDK**. **No ORM / no Drizzle.**
>
> **This is a cross-table hardening ticket, not a new table.** It resolves DB-design **open question #7** and **overrides EF1.1 §13.1's "default: do NOT add"**. It touches the 6 owner-rooted parent tables and the hard FKs that point at them. **It does not add, remove, or rename any column other than constraints/indexes.**

---

## 1. What you're building

Defense-in-depth for ownership integrity. Today every row carries a denormalized `user_id` (D12) and RLS isolates per user (D13), and cross-row consistency (`child.user_id = parent.user_id`) holds **by construction** because every insert stamps `auth.uid()`. Nothing at the DB *forces* it, though — a bug in the insert path (or a `service_role` job) could attach a child to a parent owned by a different user.

This ticket makes that **structurally impossible**:

1. Add a `UNIQUE (id, user_id)` key to each parent table that is a hard FK target.
2. Convert each hard child→parent FK from single-column (`child_fk → parent.id`) to composite (`(child_fk, user_id) → parent.(id, user_id)`).

With a composite FK, a child row can only reference a parent that shares its `user_id` — the DB rejects cross-owner links outright.

> **Scope note — soft references are excluded.** Per **D9**, `envelope.template_id` and `envelope.carried_from_envelope_id` are *soft references* (no FK at all, dangling ids tolerated). They get **no** composite key here. Only the **hard** FKs below are hardened.

---

## 2. Where this applies

### 2.1 Parent tables — add `UNIQUE (id, user_id)`

`id` is already the PK (unique), so this is a cheap, additive unique key that exists only to serve as a composite-FK target.

| Parent table | Ticket | Add |
|---|---|---|
| `monthly_ledger` | EF1.1 | `constraint uq_ledger_id_user unique (id, user_id)` |
| `category` | EF1.2 | `constraint uq_category_id_user unique (id, user_id)` |
| `account` | EF1.3 | `constraint uq_account_id_user unique (id, user_id)` |
| `person` | EF1.4 | `constraint uq_person_id_user unique (id, user_id)` |
| `template` | EF1.5 | `constraint uq_template_id_user unique (id, user_id)` *(only if a hard FK targets it — see note)* |
| `envelope` | EF1.6 | `constraint uq_envelope_id_user unique (id, user_id)` |

> **`template` note:** templates are referenced **only** by `envelope.template_id`, which is a **soft** reference (D9) — so `template` has **no inbound hard FK** and strictly does **not** need `uq_template_id_user`. Add it only if a future hard FK is introduced. **Default for this ticket: skip it.**

### 2.2 Child hard FKs — convert to composite

| Child table | Ticket | FK column | Currently → | Harden to |
|---|---|---|---|---|
| `envelope` | EF1.6 | `ledger_id` (NOT NULL) | `monthly_ledger(id)` | `(ledger_id, user_id) → monthly_ledger(id, user_id)` |
| `envelope` | EF1.6 | `category_id` (NOT NULL) | `category(id)` | `(category_id, user_id) → category(id, user_id)` |
| `envelope` | EF1.6 | `account_id` (NULL) | `account(id)` | `(account_id, user_id) → account(id, user_id)` |
| `envelope` | EF1.6 | `linked_person_id` (NULL) | `person(id)` | `(linked_person_id, user_id) → person(id, user_id)` |
| `carry_over` | EF1.7 | `envelope_id` | `envelope(id)` | `(envelope_id, user_id) → envelope(id, user_id)` |
| `ledger_settlement_summary` | EF1.8 | `ledger_id` (also PK) | `monthly_ledger(id)` | `(ledger_id, user_id) → monthly_ledger(id, user_id)` |
| `opening_balance_adjustment` | EF1.9 | `ledger_id` | `monthly_ledger(id)` | `(ledger_id, user_id) → monthly_ledger(id, user_id)` |

> **Nullable composite FKs behave correctly.** Postgres `MATCH SIMPLE` (the default) skips the FK check when **any** column of the FK is NULL. So for `account_id`/`linked_person_id` (nullable) the composite FK enforces ownership when a link exists and is simply inert when the link is absent — exactly the desired behavior. Keep the existing `ON DELETE` action on each FK (e.g. envelope→ledger `CASCADE`); only the column list and target change.

---

## 3. How to apply

**EF1 is still in spec form (no migrations applied yet), so prefer folding these into the table migrations directly** — this keeps each table's migration the single source of truth and avoids an `ALTER` migration. This ticket is the **spec of record** for the change.

- **Parent tickets (EF1.1–1.6):** add the `uq_<table>_id_user` line to the table's `create table` constraint block (§5 of each ticket), and add it to that ticket's §5 constraint table + acceptance criteria.
- **Child tickets (EF1.6–1.9):** write the FK as composite from the start, e.g.

  ```sql
  -- envelope (EF1.6): composite FKs pin every hard link to the owner
  constraint fk_envelope_ledger
    foreign key (ledger_id, user_id)
    references monthly_ledger (id, user_id) on delete cascade,
  constraint fk_envelope_category
    foreign key (category_id, user_id)
    references category (id, user_id) on delete restrict,
  constraint fk_envelope_account
    foreign key (account_id, user_id)
    references account (id, user_id) on delete set null,
  constraint fk_envelope_person
    foreign key (linked_person_id, user_id)
    references person (id, user_id) on delete set null,
  ```

**If a table migration has already been pushed to `staging`** (immutable — EF1.1 §7.4), do **not** edit it. Ship the equivalent as one additive migration instead:

```sql
-- 20260627110000_finance_ownership_hardening.sql  (only if earlier migrations are already applied)
alter table monthly_ledger add constraint uq_ledger_id_user unique (id, user_id);
alter table category      add constraint uq_category_id_user unique (id, user_id);
alter table account       add constraint uq_account_id_user  unique (id, user_id);
alter table person        add constraint uq_person_id_user   unique (id, user_id);
alter table envelope      add constraint uq_envelope_id_user unique (id, user_id);

alter table envelope drop constraint fk_envelope_ledger;        -- single-column
alter table envelope add  constraint fk_envelope_ledger
  foreign key (ledger_id, user_id) references monthly_ledger (id, user_id) on delete cascade;
-- …repeat the drop/add for category_id, account_id, linked_person_id,
--    carry_over.envelope_id, ledger_settlement_summary.ledger_id,
--    opening_balance_adjustment.ledger_id (preserve each original ON DELETE action).
```

Either way: **`supabase db reset` must succeed clean from scratch**, regenerate `database.types.ts`, and `db push` to `staging`. No CI/CD pipeline (per EF1).

---

## 4. Verification matrix

Reuse EF1.1's two seed users (A = `…00a`, B = `…00b`). The key new cases prove cross-owner links are rejected.

| # | Action | Expected |
|---|---|---|
| 1 | Insert envelope for user A whose `ledger_id` belongs to a user-A ledger, `user_id = A` | ✅ inserts |
| 2 | Insert envelope with `user_id = A` but `ledger_id` of a **user-B** ledger | ❌ FK violation (`fk_envelope_ledger`) — composite key blocks it |
| 3 | Same cross-owner attempt for `category_id` / `account_id` / `linked_person_id` | ❌ FK violation on the respective composite FK |
| 4 | Insert envelope with `account_id = NULL` | ✅ inserts (nullable FK inert under MATCH SIMPLE) |
| 5 | Insert `carry_over` (user A) referencing a **user-B** envelope | ❌ FK violation (`fk_carryover_envelope`) |
| 6 | Insert `ledger_settlement_summary` / `opening_balance_adjustment` (user A) referencing a user-B ledger | ❌ FK violation |
| 7 | Each parent now has `uq_<table>_id_user` | ✅ present (`\d <table>` shows the unique key) |
| 8 | Normal same-owner inserts across the whole schema (the EF1.6–1.9 happy paths) | ✅ unchanged — no regression |
| 9 | `supabase db reset` from scratch (all migrations + seed) | ✅ clean apply |

Recommended: fold cases 2/3/5/6 into the affected tables' existing SDK integration tests (EF1.6–1.9), since the harden-vs-not behavior is part of those tables' contract.

---

## 5. Acceptance criteria

- [ ] **AC1** — `uq_<table>_id_user` UNIQUE `(id, user_id)` exists on `monthly_ledger`, `category`, `account`, `person`, `envelope` (and `template` only if a hard FK targets it — default skip).
- [ ] **AC2** — Every **hard** child FK in §2.2 is composite `(child_fk, user_id) → parent.(id, user_id)`, preserving its original `ON DELETE` action.
- [ ] **AC3** — Soft references (`template_id`, `carried_from_envelope_id`) remain **un-FK'd** (D9 unchanged).
- [ ] **AC4** — Cross-owner child inserts are rejected at the DB (matrix #2, #3, #5, #6); same-owner inserts unaffected (#1, #8).
- [ ] **AC5** — `supabase db reset` clean from scratch; `database.types.ts` regenerated + committed; pushed to `staging`.
- [ ] **AC6** — EF1.1 §13.1's composite-key decision is recorded as **resolved → hardening adopted** (this ticket).

---

## 6. Notes / decisions

1. **Resolves DB-design open question #7** ("Cross-owner integrity hardening — worth it, or trust the insert path?"). Decision: **harden.** The cost is six cheap unique keys + composite FK columns; the payoff is that no app-layer or `service_role` bug can ever cross-link owners.
2. **`template` parent key skipped by default** — templates have no inbound hard FK (D9). Revisit only if one is introduced.
3. **No behavioral change for the app** — repositories (EF2) still stamp `user_id` from `auth.uid()`; this ticket only makes the DB reject the pathological case they already avoid.
4. **Order of operations if shipping as an `ALTER` migration:** add every parent `UNIQUE (id, user_id)` **before** the composite FKs that reference it.

*Provenance: DB-design §2 (D9, D12, D13), §7 open question #7; EF1.1 §3 + §13.1 (composite-key decision deferred to "before E2").*

---

## Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 0.1 | 2026-06-27 | NafiOS Foundation | Initial cross-table ownership-hardening ticket: `UNIQUE (id, user_id)` on owner-rooted parents + composite `(fk, user_id)` FKs on all hard child links. Resolves DB-design open question #7; overrides EF1.1 §13.1 default. Soft refs (template_id, carried_from_envelope_id) excluded per D9. |
