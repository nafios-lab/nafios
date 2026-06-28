-- ---------------------------------------------------------------------------
-- finance: monthly_ledger
-- ---------------------------------------------------------------------------
-- One row = one calendar month of cashflow for one user (the "header" for a
-- month). Line items (envelopes) and computed figures (committed total,
-- headroom) live in later tables / are computed on read — never stored here.
--
-- Root table: its only FK points at auth.users (ownership). First finance
-- table in the suite.
--
-- RLS is ENABLED on this table (owner isolation), unlike the auth-epic tables
-- which deferred it per ADR-0019. This is the data epic that ADR-0019
-- anticipated; see ADR-0023.

-- ledger lifecycle states (used only by monthly_ledger)
CREATE TYPE public.ledger_status AS ENUM ('ongoing', 'reconciling', 'settled');

CREATE TABLE public.monthly_ledger (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Owner. Defaults to the request JWT's user (auth.uid()), so authenticated
  -- inserts fill it automatically. NULL for service_role (no JWT) → a
  -- service_role insert that omits user_id fails the NOT NULL on purpose;
  -- seeds/jobs must set it explicitly.
  user_id         uuid          NOT NULL DEFAULT auth.uid()
                                  REFERENCES auth.users (id) ON DELETE CASCADE,
  -- The month this ledger covers, pinned to the 1st (2026-01 -> 2026-01-01).
  month           date          NOT NULL,
  -- Income to allocate this month. numeric(12,2): exact decimal, never float.
  -- Arrives as a string through supabase-js — no money math in JS floats.
  opening_balance numeric(12,2) NOT NULL,
  -- Self-imposed spending ceiling for the month.
  max_capped      numeric(12,2) NOT NULL,
  status          public.ledger_status NOT NULL DEFAULT 'ongoing',
  created_at      timestamptz   NOT NULL DEFAULT now(),
  -- Set iff status = 'settled' (enforced by ck_settled_at).
  settled_at      timestamptz,

  CONSTRAINT uq_ledger_user_month  UNIQUE (user_id, month),
  CONSTRAINT ck_ledger_month_first CHECK (extract(day from month) = 1),
  CONSTRAINT ck_maxcapped_ceiling  CHECK (max_capped <= 2 * opening_balance),
  CONSTRAINT ck_balances_nonneg    CHECK (opening_balance >= 0 AND max_capped >= 0),
  CONSTRAINT ck_settled_at         CHECK ((status = 'settled') = (settled_at IS NOT NULL))
);

COMMENT ON TABLE public.monthly_ledger IS
  'One row = one calendar month of cashflow for one user. Header only — envelopes and computed figures live elsewhere.';
COMMENT ON COLUMN public.monthly_ledger.opening_balance IS
  'Income to allocate this month. numeric(12,2); arrives as a string via supabase-js — never do money math in JS floats.';
COMMENT ON COLUMN public.monthly_ledger.max_capped IS
  'Self-imposed spending ceiling. >= 0 and <= 2 * opening_balance (a higher value is almost always a misplaced decimal).';
COMMENT ON COLUMN public.monthly_ledger.month IS
  'Month covered, pinned to the 1st (2026-01 -> 2026-01-01). Unique per user.';

-- At most one ongoing ledger per user (older months sit in reconciling/settled).
CREATE UNIQUE INDEX uq_one_ongoing_ledger
  ON public.monthly_ledger (user_id) WHERE status = 'ongoing';

-- ---------------------------------------------------------------------------
-- Row-Level Security: a user sees/writes only their own ledgers.
-- ---------------------------------------------------------------------------
-- (select auth.uid()) is wrapped so Postgres evaluates it once per statement,
-- not once per row. service_role bypasses RLS (migrations/seeds/jobs).

ALTER TABLE public.monthly_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY owner_all ON public.monthly_ledger
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Grant table privileges to PostgREST roles (auto_expose_new_tables = false in
-- config). RLS scopes the rows authenticated can reach; service_role bypasses
-- RLS but still needs the grant to operate (seeds, jobs, admin cleanup).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_ledger TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_ledger TO service_role;
