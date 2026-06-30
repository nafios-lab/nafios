-- ---------------------------------------------------------------------------
-- finance: envelope
-- ---------------------------------------------------------------------------
-- One row = one spending line within a month's ledger — the working surface the
-- user actually edits. Each envelope is an intended or actual payment: an item,
-- an amount, a category, and a status in its lifecycle
-- (pending -> paid / skipped / carried_over). An envelope arises three ways:
--
--   manual         — the user typed it in. template_id is NULL.
--   template-linked — generated from a recurring template, or pulled from an
--     adhoc one. template_id points (softly) at the template; original_amount
--     records the template's default so the UI can show an amendment when amount
--     differs.
--   carried-over   — created by carrying an unpaid line forward from a previous
--     month. carried_from_envelope_id points (softly) back at the source
--     envelope; carry_over_reason explains why.
--
-- The MOST connected table in the schema: five real FKs and two soft references.
--   real FKs: auth.users CASCADE, monthly_ledger CASCADE, category RESTRICT,
--             account SET NULL, family_members SET NULL.
--   soft refs (D9): template_id and carried_from_envelope_id are plain uuid
--             columns with NO FK constraint. A template (or a source envelope)
--             can be HARD-deleted while this id is kept as an orphaned historical
--             reference; a real FK cannot honor that (RESTRICT blocks the delete,
--             SET NULL erases the wanted id). The domain layer tolerates dangling
--             ids. Case 15 of the verification matrix is this guard.
--
-- NOTE: the EF1.6 ticket modelled the linked person on a `person` table. `person`
-- was deprecated in favour of reusing public.family_members (same as EF1.5), so
-- the column is `linked_member_id`, FK -> family_members(id) ON DELETE SET NULL.
-- The index is idx_envelope_member accordingly.
--
-- Cross-owner integrity (DB-design open #7) lands HERE: ledger_id uses a SIMPLE
-- FK -> monthly_ledger(id) CASCADE; user_id is denormalized (D12) and kept equal
-- to the ledger owner BY CONSTRUCTION (every insert stamps auth.uid()), not by a
-- composite FK. The composite-FK hardening would require UNIQUE(id, user_id) on
-- monthly_ledger (not present) and altering both tables — declined per §13.1.
--
-- Derived metrics (COL / Health Margin / ASM / Outstanding / Amendments) and
-- occurrencesRemaining are NEVER stored (D10/D11) — computed on read from these
-- rows. No columns. The carry_over panel (kill reason, lock, history) is its own
-- table (EF1.7); this table only holds carry_over_reason text and the soft
-- carried_from_envelope_id back-pointer. The inbound carry_over FKs are created
-- in THAT ticket, never here.
--
-- obligation_kind is Phase-2 reserved: the enum and column are created now so
-- Phase 2 needs no enum migration, but the column stays NULL in MVP. No CHECK
-- forces it NULL (faithful to the design; §13.4 declined the optional guard).
--
-- updated_at is auto-maintained by the shared public.set_updated_at() trigger
-- function (created in the first profiles migration, reused by every table that
-- carries updated_at) — envelope is the 5th finance table on this convention.
-- Deliberately NOT enforced here (domain/repo concerns): status-transition
-- gating, settled-ledger immutability, the carry-over "never emptied once set"
-- rule (temporal, E7), envelope auto-generation.
--
-- RLS is ENABLED (owner isolation), per ADR-0023.

-- envelope lifecycle states. D4 naming seam: the label is `carried_over` (no
-- hyphen — Postgres identifiers forbid them); the domain literal is
-- 'carried-over'. The mapping layer (E2) owns the translation. Members can be
-- added later online (ALTER TYPE ... ADD VALUE), never removed.
CREATE TYPE public.envelope_status AS ENUM ('pending', 'paid', 'skipped', 'carried_over');

-- Phase-2 reserved classification. Created now so Phase 2 needs no enum
-- migration; the column stays NULL in MVP (domain §6.1).
CREATE TYPE public.obligation_kind AS ENUM (
  'debt_repayment', 'recurring_service', 'tax_installment', 'utility',
  'set_aside', 'family_support', 'insurance_premium', 'discretionary'
);

CREATE TABLE public.envelope (
  id                       uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Owner (matches the ledger owner; denormalized, D12). Defaults to the request
  -- JWT's user (auth.uid()), so authenticated inserts fill it automatically.
  -- NULL for service_role (no JWT) → a service_role insert that omits user_id
  -- fails the NOT NULL on purpose; seeds/jobs must set it explicitly. Drives RLS.
  user_id                  uuid            NOT NULL DEFAULT auth.uid()
                                             REFERENCES auth.users (id) ON DELETE CASCADE,
  -- The owning month. SIMPLE FK (§13.1); deleting the ledger removes its lines.
  ledger_id                uuid            NOT NULL
                                             REFERENCES public.monthly_ledger (id) ON DELETE CASCADE,
  -- Every envelope has exactly one category. RESTRICT: a category can't be
  -- deleted while an envelope references it (mirrors template, EF1.2 §13.1).
  category_id              uuid            NOT NULL
                                             REFERENCES public.category (id) ON DELETE RESTRICT,
  -- The line label, e.g. "Groceries — week 1".
  item                     varchar(160)    NOT NULL,
  -- Current amount. numeric(12,2): exact decimal, arrives as a string via
  -- supabase-js — never do money math in JS floats. >= 0 ($0 is a valid line).
  amount                   numeric(12,2)   NOT NULL,
  -- Template's default at generation; only when template_id is set (CHECK).
  -- NULL for manual lines. Diff vs amount = an amendment.
  original_amount          numeric(12,2),
  status                   public.envelope_status NOT NULL DEFAULT 'pending',
  -- Set iff status = 'paid' (enforced by ck_env_paid_at).
  paid_at                  timestamptz,
  -- Optional payment source; survives the account's deletion (SET NULL).
  payment_source_id        uuid            REFERENCES public.account (id) ON DELETE SET NULL,
  remark                   text,
  -- Optional linked family member (the deprecated `person` concept, now reusing
  -- family_members). Survives the member's deletion (SET NULL).
  linked_member_id         uuid            REFERENCES public.family_members (id) ON DELETE SET NULL,
  -- Position within the ledger's list. NOT NULL default 0 (unlike
  -- template.sort_order, which is nullable).
  sort_order               integer         NOT NULL DEFAULT 0,

  -- soft references (D9): plain uuid columns, NO FK constraint; may be orphaned.
  template_id              uuid,            -- -> template.id  (NULL = manual line)
  carried_from_envelope_id uuid,            -- -> envelope.id  (set => carried-over origin)

  -- >= 10 chars when set (CHECK). The "never emptied once set" rule is temporal,
  -- so it lives in the domain/repo (E7), not here.
  carry_over_reason        text,
  -- Phase-2 reserved; always NULL in MVP. No CHECK forces NULL (§13.4).
  obligation_kind          public.obligation_kind,

  created_at               timestamptz     NOT NULL DEFAULT now(),
  -- Last-modified stamp. Kept current by set_envelope_updated_at, not app code.
  updated_at               timestamptz     NOT NULL DEFAULT now(),

  -- Money is never negative; $0 is valid.
  CONSTRAINT ck_env_amount_nonneg   CHECK (amount >= 0),
  -- A paid timestamp exists exactly when paid.
  CONSTRAINT ck_env_paid_at         CHECK ((status = 'paid') = (paid_at IS NOT NULL)),
  -- original_amount only makes sense for a template-linked line.
  CONSTRAINT ck_env_original_amount CHECK (original_amount IS NULL OR template_id IS NOT NULL),
  -- A carry-over reason, when given, is substantial (>= 10 chars).
  CONSTRAINT ck_env_co_reason_len   CHECK (carry_over_reason IS NULL OR char_length(carry_over_reason) >= 10)
);

COMMENT ON TABLE public.envelope IS
  'One spending line within a month''s ledger (the working surface the user edits). Derived metrics (COL/HM/ASM/Outstanding/Amendments) are NOT stored (D11).';
COMMENT ON COLUMN public.envelope.amount IS
  'Current amount. numeric(12,2); arrives as a string via supabase-js — never do money math in JS floats. >= 0 ($0 valid).';
COMMENT ON COLUMN public.envelope.original_amount IS
  'Template''s default at generation; only when template_id is set. NULL for manual lines. Diff vs amount = an amendment.';
COMMENT ON COLUMN public.envelope.linked_member_id IS
  'Optional linked family member (the deprecated `person` concept, now reusing family_members). FK -> family_members(id) ON DELETE SET NULL.';
COMMENT ON COLUMN public.envelope.template_id IS
  'Soft ref (D9), NO FK. NULL = manual line; may be orphaned after the template is hard-deleted.';
COMMENT ON COLUMN public.envelope.carried_from_envelope_id IS
  'Soft ref (D9), NO FK. Set => this line was carried over from that source envelope; may dangle after the source is removed.';
COMMENT ON COLUMN public.envelope.obligation_kind IS
  'Phase-2 reserved classification. Always NULL in MVP (domain §6.1); no CHECK forces it.';

-- All envelopes for a ledger (the working surface). Leads with user_id, so it
-- also serves the RLS user_id predicate.
CREATE INDEX idx_envelope_ledger          ON public.envelope (user_id, ledger_id);
-- paid-count for occurrencesRemaining (D10) + outstanding carry-overs by
-- template. Also leads with user_id.
CREATE INDEX idx_envelope_template_status ON public.envelope (user_id, template_id, status);
-- annual outflow tied to a family member. Also leads with user_id.
CREATE INDEX idx_envelope_member          ON public.envelope (user_id, linked_member_id);
-- envelopes by category (also supports the category RESTRICT delete-check).
CREATE INDEX idx_envelope_category        ON public.envelope (category_id);

-- Keep updated_at current on every UPDATE (created_at is never touched).
CREATE TRIGGER set_envelope_updated_at
  BEFORE UPDATE ON public.envelope
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-Level Security: a user sees/writes only their own envelopes.
-- ---------------------------------------------------------------------------
-- (select auth.uid()) is wrapped so Postgres evaluates it once per statement,
-- not once per row. service_role bypasses RLS (migrations/seeds/jobs).

ALTER TABLE public.envelope ENABLE ROW LEVEL SECURITY;

CREATE POLICY owner_all ON public.envelope
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Grant table privileges to PostgREST roles (auto_expose_new_tables = false in
-- config). RLS scopes the rows authenticated can reach; service_role bypasses
-- RLS but still needs the grant to operate (seeds, jobs, admin cleanup).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.envelope TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.envelope TO service_role;
