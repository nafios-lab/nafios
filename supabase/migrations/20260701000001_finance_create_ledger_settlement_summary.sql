-- ---------------------------------------------------------------------------
-- finance: ledger_settlement_summary
-- ---------------------------------------------------------------------------
-- One row = the frozen snapshot of a SETTLED ledger (D7), 1:1 with its
-- monthly_ledger. Live (ongoing/reconciling) ledgers compute COL, Health Margin
-- and ASM on the fly and store nothing (D11); at settlement the engine (E5/E13)
-- freezes those metrics — plus snapshotted copies of opening_balance/max_capped
-- and the envelope tallies — into this row. The row's mere EXISTENCE is the
-- "settled" signal: the annual/history view (E13.2) renders settled months
-- straight from this snapshot.
--
-- ledger_id is BOTH the PK and the FK to monthly_ledger(id): PK = FK is what
-- enforces the 1:1 (exactly one snapshot per ledger). No separate id.
--
-- This is an immutable snapshot: NO created_at/updated_at (settled_at is the
-- row's timestamp) and therefore NO set_updated_at() trigger. Immutability of a
-- settled ledger is a DOMAIN guard (E5.1/E8.2), not a DB constraint — Postgres
-- has no "frozen row" primitive.
--
-- NOT enforced here (by design):
--   * Computing the metrics/tallies — the settlement engine writes them once.
--   * "Row exists IFF monthly_ledger.status = 'settled'" — that cross-table
--     invariant is domain-owned: the settlement transaction writes this row and
--     flips the status (+ settled_at) atomically. No DB constraint links them.
--   * No enum, no CHECKs (the DB design specifies none; count-consistency
--     hardening was considered per EF1.8 §13.2 and deliberately omitted).
--     health_margin/asm_contribution stay sign-unconstrained — overspend is real.
--
-- Two real FKs — both created HERE:
--   monthly_ledger  CASCADE — 1:1 with the settled ledger; deleting it drops
--                             the snapshot.
--   auth.users      CASCADE — ownership; drives RLS.
--
-- RLS is ENABLED (owner isolation), per ADR-0023.

CREATE TABLE public.ledger_settlement_summary (
  -- Primary key AND FK -> monthly_ledger(id). PK = FK enforces one snapshot per
  -- ledger (1:1). No separate id column.
  ledger_id          uuid          PRIMARY KEY
                                      REFERENCES public.monthly_ledger (id) ON DELETE CASCADE,
  -- Owner. Defaults to the request JWT's user (auth.uid()), so authenticated
  -- inserts fill it automatically. NULL for service_role (no JWT) → a
  -- service_role insert that omits user_id fails the NOT NULL on purpose; the
  -- settlement writer/seed sets it explicitly. Drives RLS.
  user_id            uuid          NOT NULL DEFAULT auth.uid()
                                      REFERENCES auth.users (id) ON DELETE CASCADE,
  -- Frozen Cost-of-Living (Σ amount of pending+paid at settlement). numeric(12,2):
  -- exact decimal, arrives as a string via supabase-js — never money math in floats.
  col                numeric(12,2) NOT NULL,
  -- Frozen max_capped − col. MAY be negative (overspend) — no sign CHECK.
  health_margin      numeric(12,2) NOT NULL,
  -- Frozen opening_balance − col. MAY be negative — no sign CHECK.
  asm_contribution   numeric(12,2) NOT NULL,
  -- Snapshotted copy of the ledger's opening_balance (self-contained record).
  opening_balance    numeric(12,2) NOT NULL,
  -- Snapshotted copy of the ledger's max_capped (self-contained record).
  max_capped         numeric(12,2) NOT NULL,
  -- Envelope tallies at settlement.
  total_envelopes    integer       NOT NULL,
  paid_count         integer       NOT NULL,
  skipped_count      integer       NOT NULL,
  carried_over_count integer       NOT NULL,
  -- When the ledger was settled. This IS the row's timestamp — no created_at/
  -- updated_at. Set to the same instant as monthly_ledger.settled_at (§13.4).
  settled_at         timestamptz   NOT NULL
);

COMMENT ON TABLE public.ledger_settlement_summary IS
  'Frozen snapshot of a SETTLED ledger (D7), 1:1 with monthly_ledger. Row existence = the ledger is settled. Immutable: no id/created_at/updated_at.';
COMMENT ON COLUMN public.ledger_settlement_summary.ledger_id IS
  'PK AND FK -> monthly_ledger(id) ON DELETE CASCADE. PK = FK enforces one snapshot per ledger (1:1).';
COMMENT ON COLUMN public.ledger_settlement_summary.health_margin IS
  'Frozen max_capped − col. May be negative (overspend) — deliberately sign-unconstrained.';
COMMENT ON COLUMN public.ledger_settlement_summary.asm_contribution IS
  'Frozen opening_balance − col. May be negative — deliberately sign-unconstrained.';
COMMENT ON COLUMN public.ledger_settlement_summary.settled_at IS
  'When the ledger was settled — the row''s only timestamp. Set to the same instant as monthly_ledger.settled_at.';

-- per-user annual/history listing (E13.2). Also serves the RLS user_id predicate.
CREATE INDEX idx_settlement_user ON public.ledger_settlement_summary (user_id);

-- NO set_updated_at() trigger — this table has no updated_at column (immutable snapshot).

-- ---------------------------------------------------------------------------
-- Row-Level Security: a user sees/writes only their own snapshots.
-- ---------------------------------------------------------------------------
-- (select auth.uid()) is wrapped so Postgres evaluates it once per statement,
-- not once per row. service_role bypasses RLS (the settlement writer/seed sets
-- user_id explicitly).

ALTER TABLE public.ledger_settlement_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY owner_all ON public.ledger_settlement_summary
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Grant table privileges to PostgREST roles (auto_expose_new_tables = false in
-- config). RLS scopes the rows authenticated can reach; service_role bypasses
-- RLS but still needs the grant to operate (seeds, jobs, admin cleanup).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledger_settlement_summary TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledger_settlement_summary TO service_role;
