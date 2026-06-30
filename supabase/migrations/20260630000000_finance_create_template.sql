-- ---------------------------------------------------------------------------
-- finance: template
-- ---------------------------------------------------------------------------
-- One row = one reusable definition of a spending line, held in ONE
-- discriminated table for both kinds (design decision D5), keyed by `type`:
--
--   recurring — auto-generates an envelope each month it is due. Carries a
--     cursor (next_due_month), an optional end_month (NULL = indefinite), a
--     lifecycle status (active -> pending_reconciliation -> completed, or
--     terminated if ended early) and a termination_reason (required only once
--     terminated).
--   adhoc — a library item the user manually pulls into a ledger. Carries
--     archived (soft-hide from the library), last_used_month and usage_count.
--
-- Both kinds share an identity (item, category_id, sort_order) and a set of
-- defaults (default_amount, default_remark, default_payment_source_id,
-- default_linked_member_id) that seed the envelope created from them. The
-- recurring-only and adhoc-only columns are nullable; the CHECK constraints
-- below are the teeth enforcing that each row carries exactly the right set for
-- its type. The domain layer reconstitutes the discriminated union on read.
--
-- First finance table with cross-table FKs: a hub with four outbound FKs
-- (auth.users CASCADE, category RESTRICT, account/family_members SET NULL).
-- Inbound references — envelope.template_id (soft ref, D9 — deliberately NO FK)
-- and carry_over.template_id (real FK, CASCADE) — are created in THEIR tickets,
-- never here. id is a stable single-column uuid PK: a valid target for both.
--
-- NOTE: the EF1.5 ticket modelled the linked-person default on a `person`
-- table. `person` was deprecated in favour of reusing public.family_members,
-- so the column is `default_linked_member_id`, FK -> family_members(id)
-- ON DELETE SET NULL.
--
-- updated_at is auto-maintained by the shared public.set_updated_at() trigger
-- function (created in the first profiles migration, reused by every table that
-- carries updated_at) — template is the 4th finance table on this convention.
-- Deliberately NOT enforced here (domain/repo concerns): type immutability,
-- occurrencesRemaining (derived, D10 — no column), envelope auto-generation,
-- next_due_month cursor advance, status flips, usage_count bumps.
--
-- No conditional column DEFAULTs: archived / usage_count / status /
-- next_due_month have no DEFAULT — a default would fire for the WRONG type and
-- break a shape CHECK (e.g. archived = false would fail ck_tpl_recurring_shape
-- on recurring rows). The insert path supplies type-appropriate values.
--
-- RLS is ENABLED (owner isolation), per ADR-0023.

-- template discriminator + recurring lifecycle. Members can be added later
-- online (ALTER TYPE ... ADD VALUE), never removed.
CREATE TYPE public.template_type             AS ENUM ('recurring', 'adhoc');
CREATE TYPE public.recurring_template_status AS ENUM ('active', 'pending_reconciliation', 'completed', 'terminated');

CREATE TABLE public.template (
  id                        uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Owner. Defaults to the request JWT's user (auth.uid()), so authenticated
  -- inserts fill it automatically. NULL for service_role (no JWT) → a
  -- service_role insert that omits user_id fails the NOT NULL on purpose;
  -- seeds/jobs must set it explicitly.
  user_id                   uuid          NOT NULL DEFAULT auth.uid()
                                            REFERENCES auth.users (id) ON DELETE CASCADE,
  -- recurring | adhoc. No default — set on create. Immutable after creation
  -- (domain/repo convention, NOT a DB trigger — see header).
  type                      public.template_type NOT NULL,
  -- The line label, e.g. "Rent", "Netflix". Wider than the label tables —
  -- templates can be descriptive.
  item                      varchar(160)  NOT NULL,
  -- Every template has exactly one category. RESTRICT: a category can't be
  -- deleted while a template references it (implements the EF1.2 §13.1 decision).
  category_id               uuid          NOT NULL
                                            REFERENCES public.category (id) ON DELETE RESTRICT,
  -- Optional manual ordering. Nullable, no default (unlike category.display_order).
  sort_order                integer,
  -- Amount seeded into the envelope created from this template. numeric(12,2):
  -- exact decimal, arrives as a string via supabase-js — never do money math in
  -- JS floats.
  default_amount            numeric(12,2) NOT NULL,
  default_remark            text,
  -- Optional default payment source / linked family member. Both survive their
  -- target's deletion (ON DELETE SET NULL).
  default_payment_source_id uuid          REFERENCES public.account (id)        ON DELETE SET NULL,
  default_linked_member_id  uuid          REFERENCES public.family_members (id) ON DELETE SET NULL,

  -- recurring-only (NULL for adhoc) -----------------------------------------
  -- First-of-month cursor; the next month an envelope is due.
  next_due_month            date,
  -- First-of-month; NULL = indefinite. When set, must be ≥ next_due_month.
  end_month                 date,
  status                    public.recurring_template_status,
  -- Required iff status reaches 'terminated'.
  termination_reason        text,

  -- adhoc-only (NULL for recurring) -----------------------------------------
  -- false on a live adhoc template, true when hidden from the library.
  archived                  boolean,
  -- First-of-month; the last month this adhoc was pulled. NULL until first used.
  last_used_month           date,
  -- How many times pulled; 0 on create.
  usage_count               integer,

  created_at                timestamptz   NOT NULL DEFAULT now(),
  -- Last-modified stamp. Kept current by set_template_updated_at, not app code.
  updated_at                timestamptz   NOT NULL DEFAULT now(),

  -- D3: month columns pinned to first-of-month when present.
  CONSTRAINT ck_tpl_months_first CHECK (
        (next_due_month  IS NULL OR extract(day from next_due_month)  = 1)
    AND (end_month       IS NULL OR extract(day from end_month)       = 1)
    AND (last_used_month IS NULL OR extract(day from last_used_month) = 1) ),

  -- D5: recurring rows carry recurring fields, not adhoc fields.
  CONSTRAINT ck_tpl_recurring_shape CHECK (
    type <> 'recurring' OR (next_due_month IS NOT NULL AND status IS NOT NULL
                            AND archived IS NULL AND usage_count IS NULL) ),

  -- D5: adhoc rows carry adhoc fields, not recurring fields.
  CONSTRAINT ck_tpl_adhoc_shape CHECK (
    type <> 'adhoc' OR (archived IS NOT NULL AND usage_count IS NOT NULL
                        AND next_due_month IS NULL AND end_month IS NULL
                        AND status IS NULL AND termination_reason IS NULL) ),

  -- Termination reason required iff terminated.
  CONSTRAINT ck_tpl_termination_reason CHECK (
    status IS DISTINCT FROM 'terminated' OR termination_reason IS NOT NULL ),

  -- end_month not before next_due_month when both set.
  CONSTRAINT ck_tpl_end_after_due CHECK (
    end_month IS NULL OR next_due_month IS NULL OR end_month >= next_due_month )
);

COMMENT ON TABLE public.template IS
  'A reusable definition of a spending line. ONE discriminated table (D5) for recurring (auto-generates monthly envelopes) and adhoc (manually pulled library items), keyed by type.';
COMMENT ON COLUMN public.template.type IS
  'recurring | adhoc. Immutable after creation (domain-enforced, NOT a DB trigger). No default — set on create.';
COMMENT ON COLUMN public.template.default_amount IS
  'Amount seeded into the envelope created from this template. numeric(12,2); arrives as a string via supabase-js — never do money math in JS floats.';
COMMENT ON COLUMN public.template.default_linked_member_id IS
  'Optional default linked family member (the deprecated `person` concept, now reusing family_members). FK -> family_members(id) ON DELETE SET NULL.';
COMMENT ON COLUMN public.template.next_due_month IS
  'Recurring-only. First-of-month cursor; the next month an envelope is due. NULL for adhoc.';
COMMENT ON COLUMN public.template.usage_count IS
  'Adhoc-only. How many times this template was pulled; 0 on create. NULL for recurring.';

-- recurring generation scan: "recurring active due <= :month" at ledger
-- creation. Leads with user_id, so it also serves the RLS user_id predicate.
CREATE INDEX idx_template_generation ON public.template (user_id, type, status, next_due_month);
-- adhoc library: flat list, most-recently-used first. Also leads with user_id.
CREATE INDEX idx_adhoc_library       ON public.template (user_id, type, archived, last_used_month);
-- templates by category (also supports the category RESTRICT delete-check).
CREATE INDEX idx_template_category   ON public.template (category_id);

-- Keep updated_at current on every UPDATE (created_at is never touched).
CREATE TRIGGER set_template_updated_at
  BEFORE UPDATE ON public.template
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-Level Security: a user sees/writes only their own templates.
-- ---------------------------------------------------------------------------
-- (select auth.uid()) is wrapped so Postgres evaluates it once per statement,
-- not once per row. service_role bypasses RLS (migrations/seeds/jobs).

ALTER TABLE public.template ENABLE ROW LEVEL SECURITY;

CREATE POLICY owner_all ON public.template
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Grant table privileges to PostgREST roles (auto_expose_new_tables = false in
-- config). RLS scopes the rows authenticated can reach; service_role bypasses
-- RLS but still needs the grant to operate (seeds, jobs, admin cleanup).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.template TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.template TO service_role;
