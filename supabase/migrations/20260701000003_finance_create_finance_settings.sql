-- ---------------------------------------------------------------------------
-- finance: finance_settings
-- ---------------------------------------------------------------------------
-- One row = the complete ledger-creation config for ONE user (domain D8).
-- Three config entities — DefaultOpeningBalance, MaxCappedPolicy and
-- LedgerCreationWindow — always read/written together at ledger-creation time,
-- so they collapse into a single settings row per user rather than three
-- tables. UNIQUE(user_id) is the singleton key: with owner isolation (D12) the
-- user IS the singleton — exactly one settings row per owner.
--
-- Root table: its only FK points at auth.users (ownership). No inbound FKs —
-- nothing references it; it is an independent island. This is the 10th and
-- FINAL finance table — with this migration a full `supabase db reset` builds
-- the entire Finance schema from scratch.
--
-- What this table does NOT do (by design):
--   * Apply the settings when a ledger is created (pre-fill opening_balance,
--     compute the max_capped ceiling, gate the creation window) — that is the
--     ledger-creation engine (E4.x); this table only STORES the config.
--   * Enforce the maxCapped 2x ceiling / amber-zone confirmation — those live
--     on monthly_ledger (CHECK) and in the domain (E4.3), not here.
--   * Seed a default settings row for a new user — an onboarding/seed concern
--     (E2.5/E3); CRUD (E3.4/E3.5) upserts/patches columns of the one row.
--
-- updated_at is auto-maintained by the shared public.set_updated_at() trigger
-- function (created in the first profiles migration, reused by every table that
-- carries updated_at). finance_settings is the 6th finance table on this
-- convention. created_at is never touched by it.
--
-- RLS is ENABLED (owner isolation), per ADR-0023.

-- maxCapped policy enums. Members are a fixed set; more can be added later
-- online (ALTER TYPE ... ADD VALUE), never removed.
CREATE TYPE public.max_capped_mode     AS ENUM ('hard_amount', 'percentage_of_opening');
CREATE TYPE public.max_capped_behavior AS ENUM ('warn_only', 'block_add');

CREATE TABLE public.finance_settings (
  id                      uuid                       PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Owner AND singleton key (UNIQUE below). Defaults to the request JWT's user
  -- (auth.uid()), so authenticated inserts fill it automatically. NULL for
  -- service_role (no JWT) → a service_role insert that omits user_id fails the
  -- NOT NULL on purpose; seeds/jobs must set it explicitly. Drives RLS.
  user_id                 uuid                       NOT NULL DEFAULT auth.uid()
                                                       REFERENCES auth.users (id) ON DELETE CASCADE,
  -- DefaultOpeningBalance — income figure pre-filled when opening a new month.
  -- Optional (NULL = none set). numeric(12,2): exact decimal, arrives as a
  -- string via supabase-js — never do money math in JS floats.
  default_opening_balance numeric(12,2),
  -- MaxCappedPolicy: the ceiling mode. hard_amount | percentage_of_opening.
  max_capped_mode         public.max_capped_mode     NOT NULL DEFAULT 'hard_amount',
  -- The ceiling value: an amount (hard_amount) or a percentage of opening
  -- (percentage_of_opening). Optional (NULL until a policy is configured).
  -- Same numeric(12,2) string contract as above.
  max_capped_value        numeric(12,2),
  -- What happens when the ceiling is exceeded. warn_only | block_add.
  max_capped_behavior     public.max_capped_behavior NOT NULL DEFAULT 'warn_only',
  -- LedgerCreationWindow — how many days before month start a ledger may be
  -- created. Clamped 1..7 by ck_lead_days.
  lead_days               integer                    NOT NULL DEFAULT 7,
  created_at              timestamptz                NOT NULL DEFAULT now(),
  -- Last-modified stamp. Kept current by set_finance_settings_updated_at.
  updated_at              timestamptz                NOT NULL DEFAULT now(),

  -- One settings row per user (D8) — the singleton key. Its implicit index also
  -- serves the RLS user_id predicate, so no separate user_id index is needed.
  CONSTRAINT uq_finance_settings_user UNIQUE (user_id),
  -- Creation window is within the allowed 1..7 day range.
  CONSTRAINT ck_lead_days             CHECK (lead_days BETWEEN 1 AND 7)
);

COMMENT ON TABLE public.finance_settings IS
  'One row = the complete ledger-creation config for one user (D8): DefaultOpeningBalance, MaxCappedPolicy and LedgerCreationWindow. UNIQUE(user_id) is the singleton key; CRUD upserts on user_id.';
COMMENT ON COLUMN public.finance_settings.default_opening_balance IS
  'Income figure pre-filled when opening a new month. Optional (NULL = none set). numeric(12,2); arrives as a string via supabase-js — never do money math in JS floats.';
COMMENT ON COLUMN public.finance_settings.max_capped_value IS
  'Ceiling value — an amount (hard_amount) or a percentage of opening (percentage_of_opening). Optional. numeric(12,2); read as a string via supabase-js.';
COMMENT ON COLUMN public.finance_settings.lead_days IS
  'Days before month start a ledger may be created (the creation window). 1..7 (ck_lead_days).';

-- Keep updated_at current on every UPDATE (created_at is never touched).
CREATE TRIGGER set_finance_settings_updated_at
  BEFORE UPDATE ON public.finance_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-Level Security: a user sees/writes only their own settings row.
-- ---------------------------------------------------------------------------
-- (select auth.uid()) is wrapped so Postgres evaluates it once per statement,
-- not once per row. service_role bypasses RLS (migrations/seeds/jobs).

ALTER TABLE public.finance_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY owner_all ON public.finance_settings
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Grant table privileges to PostgREST roles (auto_expose_new_tables = false in
-- config). RLS scopes the rows authenticated can reach; service_role bypasses
-- RLS but still needs the grant to operate (seeds, jobs, admin cleanup).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_settings TO service_role;
