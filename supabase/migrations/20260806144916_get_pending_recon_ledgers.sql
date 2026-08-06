-- ---------------------------------------------------------------------------
-- get_pending_recon_ledgers: every ledger parked in `reconciling`, each
-- annotated with its still-unresolved (status = 'pending') envelope count + $$.
-- ---------------------------------------------------------------------------
-- Powers the reconciliation worklist (boards/finance/EF3/images/
-- recon-ledger-card.png): the set of months the user has moved to `reconciling`
-- but not yet `settled`, each labelled with how much is still outstanding so the
-- UI can rank/curate what to finalize next.
--
--   "pending reconciliation" = monthly_ledger.status = 'reconciling'
--       (ongoing -> reconciling -> settled; monthly-ledger.md §3).
--   "unresolved envelope"     = envelope.status = 'pending'
--       (pending -> paid / skipped / carried_over; the latter three are terminal).
--
-- The 'pending'-only count + Σ amount MIRROR get_ledger_summary's `outstanding`
-- subset exactly, so a recon-list row and that ledger's summary card agree to the
-- cent (numeric(12,2) is exact, like Money's integer cents).
--
-- SECURITY INVOKER (default) so the owner_all RLS policy on BOTH tables scopes
-- every row to the caller — the function carries no user_id predicate of its own.
-- numeric(12,2) is cast ::text so money crosses the wire as a STRING, never a JS
-- float (the money-as-string contract decodeMoney / every finance mapper depends
-- on; a bare numeric in the result would arrive as a float).
--
-- Returns a SET of flat rows (RETURNS TABLE) — a LIST read, unlike the single
-- nested object get_ledger_summary emits; supabase-js hands the caller a typed
-- array (empty when nothing is reconciling — no NULL-row / jsonb_agg dance). A
-- `reconciling` ledger with zero pending envelopes STILL appears (LEFT JOIN
-- LATERAL -> 0 / '0.00'); add `AND agg.pending_env_counts > 0` to the outer WHERE
-- if the worklist should hide fully-resolved-but-unsettled months.

CREATE OR REPLACE FUNCTION public.get_pending_recon_ledgers()
RETURNS TABLE (
  id                 uuid,
  month              date,
  status             public.ledger_status,
  pending_env_counts integer,
  pending_sum_amount text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    l.id,
    l.month,                              -- 'YYYY-MM-01' date; decodeMonth on read
    l.status,                             -- always 'reconciling' here (raw enum label)
    agg.pending_env_counts,
    agg.pending_sum_amount::text          -- numeric(12,2) -> string (money-as-string)
  FROM public.monthly_ledger l
  -- One pass over this ledger's envelopes; LEFT JOIN so a reconciling ledger with
  -- zero pending lines still returns (agg.* come back as 0 / 0.00, never NULL).
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE e.status = 'pending')::integer                       AS pending_env_counts,
      COALESCE(SUM(e.amount) FILTER (WHERE e.status = 'pending'), 0)::numeric(12,2) AS pending_sum_amount
    FROM public.envelope e
    WHERE e.ledger_id = l.id
  ) agg ON true
  WHERE l.status = 'reconciling'
  ORDER BY l.month;                       -- oldest parked month first (reconcile in order)
$$;

COMMENT ON FUNCTION public.get_pending_recon_ledgers() IS
  'Reconciliation worklist: every `reconciling` ledger for the caller, each with its unresolved (status=pending) envelope count + Σ amount. RLS-scoped (SECURITY INVOKER). Money is text (numeric->string). The pending subset MIRRORS get_ledger_summary.outstanding — keep in sync.';

GRANT EXECUTE ON FUNCTION public.get_pending_recon_ledgers() TO authenticated;
