-- ---------------------------------------------------------------------------
-- get_ledger_summary: the ledger SUMMARY CARD payload, in one round-trip.
-- ---------------------------------------------------------------------------
-- Powers the "ledger summary card" (docs/brand-theme/sample-components/
-- ledger-summary-card.png): the month header + the four headline numbers +
-- the envelope status breakdown, WITHOUT shipping the envelope rows. A summary
-- card is fundamentally an aggregate view, so the sums/counts are computed in
-- SQL (the detail read, get_ledger_detail, returns raw envelopes instead and
-- lets the pure engine compute — the single source of truth for the DETAIL path).
--
-- SECURITY INVOKER (default) so the owner_all RLS policy scopes every table to
-- the caller. Returns NULL when the ledger is missing or not owned (mirrors
-- repo.findById -> null). numeric(12,2) values are cast ::text so money crosses
-- the wire as a string — never a JS float (the money-as-string contract every
-- finance mapper depends on; jsonb_build_object would otherwise emit a number).
--
-- ⚠️ DUPLICATION SEAM — keep in sync with the pure metrics engine
--    (packages/finance/src/domain/ledger-metrics.ts):
--      • col               = Σ amount where countsTowardCol(status)  → status IN ('pending','paid')
--      • asm_contribution  = opening_balance − col
--      • health_margin     = max_capped − col
--      • outstanding       = the 'pending' subset only (count + Σ amount)
--    These are the ONLY re-expression of those rules in SQL. If countsTowardCol
--    ever changes which statuses count, THIS FUNCTION MUST CHANGE TOO. The
--    numbers match to the cent (numeric(12,2) is exact, like Money's integer cents).
--
-- DB-label note: the envelope_status enum label is 'carried_over' (snake_case);
-- the domain literal is 'carried-over'. Counts key on the DB label here; the TS
-- mapper owns the translation for any status it surfaces to the domain.

CREATE OR REPLACE FUNCTION public.get_ledger_summary(p_ledger_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    -- ── header ──────────────────────────────────────────────────────────────
    'id',               l.id,
    'month',            l.month,               -- 'YYYY-MM-01' date; UI renders "MAY, 2026"
    'status',           l.status,              -- raw enum ('ongoing'); UI renders "ON-GOING"
    'opening_balance',  l.opening_balance::text,
    'max_capped',       l.max_capped::text,

    -- ── headline metrics (mirror computeLedgerMetrics — see DUPLICATION SEAM) ─
    'col',              agg.col::text,                                      -- COST OF LIVING
    'asm_contribution', (l.opening_balance - agg.col)::numeric(12,2)::text, -- FREE MARGIN (ASM); may be < 0
    'health_margin',    (l.max_capped      - agg.col)::numeric(12,2)::text, -- MaxCapped − COL; may be < 0
    'is_asm_negative',  (l.opening_balance - agg.col) < 0,                  -- drives the overspend signal (EF3.13)

    -- "what's left to handle" — the pending subset only (LedgerMetrics.Outstanding)
    'outstanding', jsonb_build_object(
      'count', agg.pending,
      'total', agg.outstanding_total::text
    ),

    -- ── envelope status breakdown (the chips + the progress bar: paid / total) ─
    'envelope_counts', jsonb_build_object(
      'total',        agg.total,
      'paid',         agg.paid,
      'pending',      agg.pending,
      'skipped',      agg.skipped,
      'carried_over', agg.carried_over
    )
  )
  FROM public.monthly_ledger l
  -- One pass over this ledger's envelopes; LEFT JOIN so a ledger with zero
  -- envelopes still returns (agg.* come back as 0 / 0.00, never NULL).
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(e.amount) FILTER (WHERE e.status IN ('pending', 'paid')), 0)::numeric(12,2) AS col,
      COALESCE(SUM(e.amount) FILTER (WHERE e.status = 'pending'), 0)::numeric(12,2)            AS outstanding_total,
      COUNT(*)                                              AS total,
      COUNT(*) FILTER (WHERE e.status = 'paid')             AS paid,
      COUNT(*) FILTER (WHERE e.status = 'pending')          AS pending,
      COUNT(*) FILTER (WHERE e.status = 'skipped')          AS skipped,
      COUNT(*) FILTER (WHERE e.status = 'carried_over')     AS carried_over
    FROM public.envelope e
    WHERE e.ledger_id = l.id
  ) agg ON true
  WHERE l.id = p_ledger_id;
$$;

COMMENT ON FUNCTION public.get_ledger_summary(uuid) IS
  'Ledger summary-card payload (header + COL/ASM/HealthMargin + Outstanding + status counts) as JSON, aggregated server-side, RLS-scoped to the caller. NULL when missing/not owned. Money is text (numeric->string). Metric rules MIRROR ledger-metrics.ts (countsTowardCol = pending+paid) — keep in sync.';

GRANT EXECUTE ON FUNCTION public.get_ledger_summary(uuid) TO authenticated;
