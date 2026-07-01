-- ---------------------------------------------------------------------------
-- finance: cross-owner ownership hardening (EF1.11)
-- ---------------------------------------------------------------------------
-- Defense-in-depth for ownership integrity. Every finance row carries a
-- denormalized user_id (D12) and RLS isolates per user (D13); cross-row
-- consistency (child.user_id = parent.user_id) holds BY CONSTRUCTION because
-- every insert stamps auth.uid(). Nothing at the DB *forced* it, though — a bug
-- in the insert path or a service_role job could attach a child to a parent
-- owned by a different user. This migration makes that structurally impossible.
--
-- Resolves DB-design open question #7 and OVERRIDES EF1.1 §13.1's "default: do
-- NOT add" — the composite-key decision is recorded here as resolved →
-- hardening adopted (EF1.11 AC6). The finance table migrations
-- (20260628xxx–20260701xxx) were already written under the old §13.1 default and
-- are treated as immutable (EF1.1 §7.4), so the hardening ships as this single
-- additive migration rather than by editing them.
--
-- HOW IT WORKS
--   1. Each owner-rooted parent that is a hard-FK target gets a cheap additive
--      UNIQUE (id, user_id). id is already the PK (unique), so this adds no new
--      restriction on the data — it exists only to serve as a composite-FK
--      target.
--   2. Each hard child→parent FK is converted from single-column
--      (child_fk → parent.id) to composite ((child_fk, user_id) → parent.(id,
--      user_id)). A child can then only reference a parent that shares its
--      user_id; the DB rejects cross-owner links outright.
--
-- ON DELETE SET NULL — CRITICAL (PG15+ column-list form, we run PG17):
--   A plain `ON DELETE SET NULL` on a COMPOSITE FK nulls *every* referencing
--   column — including user_id, which is NOT NULL. That would make deleting an
--   account/envelope fail the NOT NULL instead of just clearing the link. So the
--   three SET NULL FKs use `ON DELETE SET NULL (<link_col>)` to null ONLY the
--   link column and leave user_id intact. (The EF1.11 §3 example omitted this —
--   it is a latent bug for composite SET NULL FKs on a NOT NULL owner column.)
--
-- NULLABLE composite FKs behave correctly: Postgres MATCH SIMPLE (the default)
--   skips the FK check when ANY column of the FK is NULL. So the nullable links
--   (payment_source_id, added_envelope_id) enforce ownership when a link exists
--   and are simply inert when absent — exactly the desired behavior.
--
-- SCOPE NOTES
--   * Soft references (D9) stay un-FK'd: envelope.template_id and
--     envelope.carried_from_envelope_id remain plain uuid columns (EF1.11 AC3).
--   * family_members links are DELIBERATELY NOT hardened here. EF1.11 §2 modelled
--     these on a `person` table with a user_id column; `person` was deprecated in
--     favour of reusing public.family_members, which is owned via profile_id (NOT
--     user_id) and has RLS DISABLED (app-layer auth, ADR-0019). It carries no
--     user_id column, so the composite FK cannot be written against it. The two
--     affected FKs — envelope.linked_member_id and template.default_linked_member_id
--     — stay as single-column SET NULL FKs. This is a KNOWN GAP: closing it needs
--     family_members to gain a user_id (or a trigger-based owner check) and is
--     tracked separately, out of scope for EF1.11.
--   * Beyond EF1.11 §2.2's list, this also hardens four hard FKs the ticket
--     omitted but that point at owner-rooted parents: carry_over.template_id,
--     carry_over.added_envelope_id, template.category_id and
--     template.default_payment_source_id — plus uq_template_id_user (template DOES
--     have an inbound hard FK: carry_over.template_id). This fully achieves the
--     ticket's intent that cross-owner links be structurally impossible.
--
-- DROP names below are Postgres's auto-generated FK names (<table>_<column>_fkey)
-- — the original migrations declared these FKs inline without a CONSTRAINT name.
-- The re-added constraints get explicit fk_<...> names.
-- ---------------------------------------------------------------------------

-- 1. Parent UNIQUE (id, user_id) keys — added BEFORE the composite FKs that
--    reference them (EF1.11 note #4). Cheap and additive: id is already unique.
alter table public.monthly_ledger add constraint uq_ledger_id_user   unique (id, user_id);
alter table public.category       add constraint uq_category_id_user unique (id, user_id);
alter table public.account        add constraint uq_account_id_user  unique (id, user_id);
alter table public.envelope       add constraint uq_envelope_id_user unique (id, user_id);
alter table public.template       add constraint uq_template_id_user unique (id, user_id);

-- 2. Convert hard child FKs to composite, preserving each original ON DELETE
--    action. Grouped by child table.

-- envelope: ledger (CASCADE), category (RESTRICT), account (SET NULL).
-- linked_member_id → family_members is intentionally left single-column (see header).
alter table public.envelope drop constraint envelope_ledger_id_fkey;
alter table public.envelope add  constraint fk_envelope_ledger
  foreign key (ledger_id, user_id)
  references public.monthly_ledger (id, user_id) on delete cascade;

alter table public.envelope drop constraint envelope_category_id_fkey;
alter table public.envelope add  constraint fk_envelope_category
  foreign key (category_id, user_id)
  references public.category (id, user_id) on delete restrict;

alter table public.envelope drop constraint envelope_payment_source_id_fkey;
alter table public.envelope add  constraint fk_envelope_account
  foreign key (payment_source_id, user_id)
  references public.account (id, user_id) on delete set null (payment_source_id);

-- template: category (RESTRICT), default payment source (SET NULL).
-- default_linked_member_id → family_members is intentionally left single-column.
alter table public.template drop constraint template_category_id_fkey;
alter table public.template add  constraint fk_template_category
  foreign key (category_id, user_id)
  references public.category (id, user_id) on delete restrict;

alter table public.template drop constraint template_default_payment_source_id_fkey;
alter table public.template add  constraint fk_template_account
  foreign key (default_payment_source_id, user_id)
  references public.account (id, user_id) on delete set null (default_payment_source_id);

-- carry_over: template (CASCADE), source envelope (CASCADE), added envelope (SET NULL).
alter table public.carry_over drop constraint carry_over_template_id_fkey;
alter table public.carry_over add  constraint fk_carryover_template
  foreign key (template_id, user_id)
  references public.template (id, user_id) on delete cascade;

alter table public.carry_over drop constraint carry_over_source_envelope_id_fkey;
alter table public.carry_over add  constraint fk_carryover_source_envelope
  foreign key (source_envelope_id, user_id)
  references public.envelope (id, user_id) on delete cascade;

alter table public.carry_over drop constraint carry_over_added_envelope_id_fkey;
alter table public.carry_over add  constraint fk_carryover_added_envelope
  foreign key (added_envelope_id, user_id)
  references public.envelope (id, user_id) on delete set null (added_envelope_id);

-- ledger_settlement_summary: ledger (CASCADE). ledger_id is also the PK; only the
-- FK changes to composite, the PK stays single-column.
alter table public.ledger_settlement_summary drop constraint ledger_settlement_summary_ledger_id_fkey;
alter table public.ledger_settlement_summary add  constraint fk_settlement_ledger
  foreign key (ledger_id, user_id)
  references public.monthly_ledger (id, user_id) on delete cascade;

-- opening_balance_adjustment: ledger (CASCADE).
alter table public.opening_balance_adjustment drop constraint opening_balance_adjustment_ledger_id_fkey;
alter table public.opening_balance_adjustment add  constraint fk_oba_ledger
  foreign key (ledger_id, user_id)
  references public.monthly_ledger (id, user_id) on delete cascade;
