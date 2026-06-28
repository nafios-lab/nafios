-- ---------------------------------------------------------------------------
-- finance: category
-- ---------------------------------------------------------------------------
-- One row = one user-defined grouping label for envelopes & templates
-- (e.g. "Housing", "Transport", "Groceries"). A category is purely a label
-- with a user-controlled sort position (display_order) and an optional UI
-- color — NO priority/budget/payment semantics, no enum, no CHECKs.
--
-- Root table: its only FK points at auth.users (ownership). Later, template
-- and envelope will each carry a NOT NULL category_id → category.id; those
-- inbound FKs (and the RESTRICT that blocks deleting an in-use category) are
-- created in THEIR tickets, never here.
--
-- updated_at is auto-maintained by the shared public.set_updated_at() trigger
-- function (created in the first profiles migration, reused by every table
-- that carries updated_at) — kept current at the DB so app code can never
-- forget it.
--
-- RLS is ENABLED (owner isolation), per ADR-0023.

CREATE TABLE public.category (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Owner. Defaults to the request JWT's user (auth.uid()), so authenticated
  -- inserts fill it automatically. NULL for service_role (no JWT) → a
  -- service_role insert that omits user_id fails the NOT NULL on purpose;
  -- seeds/jobs must set it explicitly.
  user_id       uuid        NOT NULL DEFAULT auth.uid()
                              REFERENCES auth.users (id) ON DELETE CASCADE,
  -- The grouping label, e.g. "Housing". No uniqueness or non-empty CHECK is
  -- enforced today (duplicates/blank allowed at the DB by design).
  name          varchar(80) NOT NULL,
  -- The user's chosen sort position within their own category list.
  display_order integer     NOT NULL DEFAULT 0,
  -- Optional UI color (hex like '#3b82f6' or a design-token name). NULL = unset.
  color         varchar(32),
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Last-modified stamp. Kept current by set_category_updated_at, not app code.
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.category IS
  'A user-defined grouping label for envelopes & templates. Pure label — no priority/budget/payment semantics.';
COMMENT ON COLUMN public.category.display_order IS
  'User-chosen sort position within their own category list. Defaults to 0.';
COMMENT ON COLUMN public.category.color IS
  'Optional UI color (hex or design-token name). NULL = no color set. Purely presentational.';

-- Per-user listing in display order. Leads with user_id, so it also serves the
-- RLS user_id predicate — no separate user_id index needed.
CREATE INDEX idx_category_user_order
  ON public.category (user_id, display_order);

-- Keep updated_at current on every UPDATE (created_at is never touched).
CREATE TRIGGER set_category_updated_at
  BEFORE UPDATE ON public.category
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-Level Security: a user sees/writes only their own categories.
-- ---------------------------------------------------------------------------
-- (select auth.uid()) is wrapped so Postgres evaluates it once per statement,
-- not once per row. service_role bypasses RLS (migrations/seeds/jobs).

ALTER TABLE public.category ENABLE ROW LEVEL SECURITY;

CREATE POLICY owner_all ON public.category
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Grant table privileges to PostgREST roles (auto_expose_new_tables = false in
-- config). RLS scopes the rows authenticated can reach; service_role bypasses
-- RLS but still needs the grant to operate (seeds, jobs, admin cleanup).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.category TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.category TO service_role;
