-- ---------------------------------------------------------------------------
-- finance: carry_over
-- ---------------------------------------------------------------------------
-- One row = one entry on a recurring template's carry-over panel (D6). When an
-- envelope tied to a recurring template goes UNPAID at month end and the user
-- carries it forward, a row lands here. It tracks a small lifecycle:
--
--   outstanding — the carried line sits on the panel, not yet acted on.
--   added       — the user pulled it into the new month; added_envelope_id
--                 points at the NEW envelope created.
--   killed      — the user dismissed it; kill_reason (mandatory) records why.
--
-- Why a first-class table (D6), not derived from envelope state: two facts
-- can't be reconstructed from envelope rows alone — (a) the kill action + its
-- mandatory reason (audit), and (b) the acted-on lock that freezes the source
-- envelope once added/killed. The panel's DISPLAY fields (item, amount, reason,
-- carried-from month) are read THROUGH source_envelope_id, never duplicated here.
--
-- Four real FKs — all created HERE (no soft refs on this table):
--   auth.users        CASCADE   — ownership; drives RLS.
--   template          CASCADE   — the panel owner; deleting it clears the panel.
--   envelope (source) CASCADE   — the carried-over envelope; UNIQUE, one entry.
--   envelope (added)  SET NULL  — the new envelope an "added" entry produced. ⚠
--
-- ⚠ added_envelope_id SET NULL vs ck_co_added_env (EF1.7 §13.1): if the added
-- envelope is deleted (directly, or via its ledger's CASCADE), SET NULL fires →
-- added_envelope_id becomes NULL while status is still 'added' → ck_co_added_env
-- is violated and the delete is REJECTED. This migration ships the design as
-- written (SET NULL + CHECK); the tension is a flagged, unresolved design
-- decision (§13.1) and verification-matrix case 13 is its regression marker.
--
-- NO updated_at (unlike most finance tables): the row is created once and
-- transitions status at most once (to added/killed, stamping resolved_at). So
-- NO set_updated_at() trigger — created_at + resolved_at are the only stamps.
--
-- Lifecycle (D6): 'outstanding' rows are HARD-deleted if the source reverts
-- before action; 'added'/'killed' rows are retained as history.
-- UNIQUE(source_envelope_id) holds for the row's whole lifetime.
--
-- Deliberately NOT enforced here (domain/repo concerns, E7): the acted-on lock
-- freezing the source envelope's status once added/killed (this table's mere
-- EXISTENCE represents the lock; envelope.status stays free-form), the
-- hard-delete on "revert before action", and reading the display fields (joined
-- from envelope via source_envelope_id at read time).
--
-- RLS is ENABLED (owner isolation), per ADR-0023.

-- carry-over panel entry lifecycle. Members can be added later online
-- (ALTER TYPE ... ADD VALUE), never removed.
CREATE TYPE public.carry_over_status AS ENUM ('outstanding', 'added', 'killed');

CREATE TABLE public.carry_over (
  id                 uuid                     PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Owner. Defaults to the request JWT's user (auth.uid()), so authenticated
  -- inserts fill it automatically. NULL for service_role (no JWT) → a
  -- service_role insert that omits user_id fails the NOT NULL on purpose;
  -- seeds/jobs must set it explicitly. Drives RLS.
  user_id            uuid                     NOT NULL DEFAULT auth.uid()
                                                REFERENCES auth.users (id) ON DELETE CASCADE,
  -- The panel this entry belongs to. Deleting the template clears its panel.
  template_id        uuid                     NOT NULL
                                                REFERENCES public.template (id) ON DELETE CASCADE,
  -- The envelope marked carried-over. UNIQUE — one entry per source for its
  -- whole lifetime (an acted-on source is locked, never spawns a second entry).
  -- The panel's display fields are read THROUGH this id, never copied here.
  source_envelope_id uuid                     NOT NULL
                                                REFERENCES public.envelope (id) ON DELETE CASCADE,
  status             public.carry_over_status NOT NULL DEFAULT 'outstanding',
  -- Required IFF status = 'killed' (ck_co_kill_reason). Records why dismissed.
  kill_reason        text,
  -- Set IFF status = 'added' (ck_co_added_env); points at the NEW envelope.
  -- ⚠ FK SET NULL collides with the CHECK on delete — see header / EF1.7 §13.1.
  added_envelope_id  uuid                     REFERENCES public.envelope (id) ON DELETE SET NULL,
  created_at         timestamptz              NOT NULL DEFAULT now(),
  -- Domain-set when status leaves 'outstanding'. No CHECK enforces it (§13.2).
  resolved_at        timestamptz,

  -- #3: one panel entry per source envelope, for its whole lifetime.
  CONSTRAINT uq_carryover_source UNIQUE (source_envelope_id),
  -- #1: a kill must say why; only a kill has a reason.
  CONSTRAINT ck_co_kill_reason   CHECK ((status = 'killed') = (kill_reason IS NOT NULL)),
  -- #2: an "added" entry points at exactly the new envelope; only "added" does.
  CONSTRAINT ck_co_added_env     CHECK ((status = 'added')  = (added_envelope_id IS NOT NULL))
);

COMMENT ON TABLE public.carry_over IS
  'One entry on a recurring template''s carry-over panel (D6). First-class (not derived): retains the kill action + reason and the acted-on lock. Display fields are read through source_envelope_id, never copied.';
COMMENT ON COLUMN public.carry_over.source_envelope_id IS
  'The carried-over envelope. UNIQUE — one entry per source for its whole lifetime. Panel display fields (item, amount, reason, carried-from month) are read THROUGH this id, never duplicated.';
COMMENT ON COLUMN public.carry_over.added_envelope_id IS
  'Set IFF status = ''added''; the NEW envelope produced. FK -> envelope(id) ON DELETE SET NULL — ⚠ collides with ck_co_added_env on delete (EF1.7 §13.1; verification case 13).';
COMMENT ON COLUMN public.carry_over.resolved_at IS
  'Domain-set when status leaves ''outstanding''. No CHECK enforces it (EF1.7 §13.2).';

-- a template's panel, filtered by status (E7.2). Leads with user_id, so it also
-- serves the RLS user_id predicate.
CREATE INDEX idx_carryover_template_status ON public.carry_over (user_id, template_id, status);

-- NO set_updated_at() trigger — this table has no updated_at column (see header).

-- ---------------------------------------------------------------------------
-- Row-Level Security: a user sees/writes only their own carry-over entries.
-- ---------------------------------------------------------------------------
-- (select auth.uid()) is wrapped so Postgres evaluates it once per statement,
-- not once per row. service_role bypasses RLS (migrations/seeds/jobs).

ALTER TABLE public.carry_over ENABLE ROW LEVEL SECURITY;

CREATE POLICY owner_all ON public.carry_over
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Grant table privileges to PostgREST roles (auto_expose_new_tables = false in
-- config). RLS scopes the rows authenticated can reach; service_role bypasses
-- RLS but still needs the grant to operate (seeds, jobs, admin cleanup).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carry_over TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carry_over TO service_role;
