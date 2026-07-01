-- ---------------------------------------------------------------------------
-- finance: opening_balance_adjustment
-- ---------------------------------------------------------------------------
-- One row = one edit to a ledger's opening_balance, logged as an append-only
-- audit entry (domain §5 invariant: "Opening Balance adjustments are logged").
-- Each row records the previous_value, the new_value, an optional reason, and
-- when the edit happened (adjusted_at). The ledger's CURRENT opening balance
-- lives on monthly_ledger; this table is the history of how it got there.
--
-- Two real FKs — both created HERE:
--   auth.users      CASCADE — ownership; drives RLS.
--   monthly_ledger  CASCADE — the ledger this edit belongs to; its audit trail
--                             is removed with the ledger.
--
-- APPEND-ONLY is a DOMAIN/REPO convention (only INSERT; never UPDATE/DELETE a
-- row), NOT a DB constraint — Postgres has no "append-only row" primitive and
-- this migration adds no trigger/REVOKE to force it. RLS still scopes by owner.
-- This mirrors the sibling immutable snapshot ledger_settlement_summary, which
-- likewise leaves immutability to the domain (E4.3) rather than the DB.
--
-- NOT enforced here (by design):
--   * Applying new_value to monthly_ledger.opening_balance — that is the domain
--     edit operation (E4.3) that ALSO writes a row here; both in one txn.
--   * Validating new_value against the ledger's maxCapped ceiling — domain guard.
--   * No enum, no CHECKs (the DB design specifies none), no updated_at and so
--     no set_updated_at() trigger — adjusted_at is the row's only timestamp.
--
-- RLS is ENABLED (owner isolation), per ADR-0023.

CREATE TABLE public.opening_balance_adjustment (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Owner. Defaults to the request JWT's user (auth.uid()), so authenticated
  -- inserts fill it automatically. NULL for service_role (no JWT) → a
  -- service_role insert that omits user_id fails the NOT NULL on purpose;
  -- seeds/jobs must set it explicitly. Drives RLS.
  user_id        uuid          NOT NULL DEFAULT auth.uid()
                                 REFERENCES auth.users (id) ON DELETE CASCADE,
  -- The ledger whose opening balance changed. Its audit trail cascade-deletes
  -- with the ledger.
  ledger_id      uuid          NOT NULL
                                 REFERENCES public.monthly_ledger (id) ON DELETE CASCADE,
  -- The opening balance BEFORE this edit. numeric(12,2): exact decimal, arrives
  -- as a string via supabase-js — never do money math in JS floats.
  previous_value numeric(12,2) NOT NULL,
  -- The opening balance AFTER this edit. Same numeric(12,2) contract.
  new_value      numeric(12,2) NOT NULL,
  -- Optional note explaining the adjustment.
  reason         text,
  -- When the edit happened. This IS the row's timestamp — no created_at/updated_at.
  adjusted_at    timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.opening_balance_adjustment IS
  'Append-only audit log of opening-balance edits (domain §5). One row = one edit. Append-only is domain-enforced; no updated_at (adjusted_at is the row''s timestamp).';
COMMENT ON COLUMN public.opening_balance_adjustment.previous_value IS
  'Opening balance before this edit. numeric(12,2); arrives as a string via supabase-js — never do money math in JS floats.';
COMMENT ON COLUMN public.opening_balance_adjustment.new_value IS
  'Opening balance after this edit. numeric(12,2); read as a string via supabase-js.';
COMMENT ON COLUMN public.opening_balance_adjustment.adjusted_at IS
  'When the edit happened — the row''s only timestamp. No created_at/updated_at (append-only).';

-- a ledger's adjustment history, per user (E4.3). Also serves the RLS user_id predicate.
CREATE INDEX idx_oba_ledger ON public.opening_balance_adjustment (user_id, ledger_id);

-- NO set_updated_at() trigger — this table has no updated_at column (append-only).

-- ---------------------------------------------------------------------------
-- Row-Level Security: a user sees/writes only their own adjustments.
-- ---------------------------------------------------------------------------
-- (select auth.uid()) is wrapped so Postgres evaluates it once per statement,
-- not once per row. service_role bypasses RLS (seeds/jobs set user_id explicitly).

ALTER TABLE public.opening_balance_adjustment ENABLE ROW LEVEL SECURITY;

CREATE POLICY owner_all ON public.opening_balance_adjustment
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Grant table privileges to PostgREST roles (auto_expose_new_tables = false in
-- config). RLS scopes the rows authenticated can reach; service_role bypasses
-- RLS but still needs the grant to operate (seeds, jobs, admin cleanup).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opening_balance_adjustment TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opening_balance_adjustment TO service_role;
