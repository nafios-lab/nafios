-- ---------------------------------------------------------------------------
-- finance: account
-- ---------------------------------------------------------------------------
-- One row = one source of funds for one user — where money is paid FROM
-- (e.g. "DBS Savings" (bank), "Cash wallet" (cash), "GrabPay" (other)).
-- A label ONLY: no balance, no opening amount, no transaction history, and no
-- reconciliation at MVP (finance domain §4). Do NOT add a balance column.
--
-- Root table: its only FK points at auth.users (ownership). Later, template
-- and envelope will each carry an OPTIONAL payment-source FK → account.id
-- (template.default_payment_source_id, envelope.payment_source_id), both
-- ON DELETE SET NULL — so deleting an account is ALWAYS allowed (it just
-- clears the reference). Those inbound FKs are created in THEIR tickets, never
-- here. (Contrast category, whose inbound FKs are NOT NULL RESTRICT.)
--
-- updated_at is auto-maintained by the shared public.set_updated_at() trigger
-- function (created in the first profiles migration, reused by every table
-- that carries updated_at) — kept current at the DB so app code can never
-- forget it. (account is the 2nd finance table on this convention.)
--
-- RLS is ENABLED (owner isolation), per ADR-0023.

-- account source-of-funds kinds. 'other' is the deliberate MVP catch-all;
-- members can be added later online (ALTER TYPE ... ADD VALUE), never removed.
CREATE TYPE public.account_type AS ENUM ('bank', 'cash', 'other');

CREATE TABLE public.account (
  id         uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Owner. Defaults to the request JWT's user (auth.uid()), so authenticated
  -- inserts fill it automatically. NULL for service_role (no JWT) → a
  -- service_role insert that omits user_id fails the NOT NULL on purpose;
  -- seeds/jobs must set it explicitly.
  user_id    uuid                 NOT NULL DEFAULT auth.uid()
                                    REFERENCES auth.users (id) ON DELETE CASCADE,
  -- The account label, e.g. "DBS Savings". No uniqueness or non-empty CHECK is
  -- enforced today (duplicates/blank allowed at the DB by design).
  name       varchar(80)          NOT NULL,
  -- bank | cash | other. No default — there is no sensible default source of
  -- funds, so the user picks one on create.
  type       public.account_type  NOT NULL,
  created_at timestamptz          NOT NULL DEFAULT now(),
  -- Last-modified stamp. Kept current by set_account_updated_at, not app code.
  updated_at timestamptz          NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.account IS
  'A user''s source of funds (where money is paid from). Label only — no balance, transactions, or reconciliation at MVP.';
COMMENT ON COLUMN public.account.type IS
  'Source-of-funds kind: bank | cash | other. No default — the user chooses on create.';

-- Per-user listing (also serves the RLS user_id predicate — no separate
-- user_id index needed). Accounts list by user_id alone (no display_order).
CREATE INDEX idx_account_user
  ON public.account (user_id);

-- Keep updated_at current on every UPDATE (created_at is never touched).
CREATE TRIGGER set_account_updated_at
  BEFORE UPDATE ON public.account
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-Level Security: a user sees/writes only their own accounts.
-- ---------------------------------------------------------------------------
-- (select auth.uid()) is wrapped so Postgres evaluates it once per statement,
-- not once per row. service_role bypasses RLS (migrations/seeds/jobs).

ALTER TABLE public.account ENABLE ROW LEVEL SECURITY;

CREATE POLICY owner_all ON public.account
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Grant table privileges to PostgREST roles (auto_expose_new_tables = false in
-- config). RLS scopes the rows authenticated can reach; service_role bypasses
-- RLS but still needs the grant to operate (seeds, jobs, admin cleanup).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account TO service_role;
