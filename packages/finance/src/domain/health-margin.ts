// @nafios/finance — domain layer (pure). Zero I/O, zero dependencies, no clock.
//
// THE Health Margin status gauge — the presentation judgment layered on top of
// the raw `Health Margin = MaxCapped − COL` amount (ledger-metrics.md §5). The
// amount alone ("$1,240") makes the user ask "is that good?"; this pins the
// answer as a named zone + a ready-to-render snippet ("Healthy · 62%"), so the
// UI renders a verdict instead of re-deriving one. The judgment lives here, in
// ONE pure place, exactly as the metric formulas do — a corner chip must never
// invent its own thresholds.
//
// The zone is decided by the RATIO of headroom to ceiling — `margin / maxCapped`
// — bucketed by fixed cutoffs (monthly-ledger.md §5, "Health Margin status
// zones"). Threshold classification stays EXACT: it compares scaled integer
// cents (`100·marginCents ⋛ percent·maxCappedCents`), never a float, so a value
// on a boundary lands deterministically. The displayed `percent` IS a rounded
// float — a presentation figure only (like formatMoney's ÷100), never the basis
// of a bucket decision.
//
// `maxCapped == 0` is a valid, committable ledger value (DB ck_balances_nonneg
// allows it; the create command rejects only `< 0`). But the RATIO divides by it,
// and a $0 ceiling in practice means "no ceiling configured" (a blank creation-
// form field coerces to 0), not an intentional zero cap. So a zero ceiling yields
// the neutral `no-ceiling` state (ratio null) — the amount tile still shows the
// truthful `−COL`; the chip simply declines to judge health with nothing to
// judge against.

import {
  compareMoney,
  isNegativeMoney,
  type Money,
  subtractMoney,
  toCents,
  ZERO_MONEY,
} from "./money";

// ─────────────────────────────── Zones ───────────────────────────────

/**
 * The Health Margin health verdict:
 *   'healthy'    — ratio ≥ 30%                    → comfortable headroom (green)
 *   'tight'      — 10% ≤ ratio < 30%              → getting close (amber)
 *   'at-risk'    — 0% ≤ ratio < 10%               → nearly at the ceiling (red)
 *   'over'       — ratio < 0% (margin negative)   → past the self-imposed ceiling (red)
 *   'no-ceiling' — maxCapped == 0                 → no ceiling to judge against (neutral)
 */
export type HealthStatus = "healthy" | "tight" | "at-risk" | "over" | "no-ceiling";

/**
 * The zone cutoffs, as whole percents of headroom (`margin / maxCapped × 100`).
 * `healthy` is the floor of the green zone; `tight` the floor of the amber zone;
 * below `tight` (but ≥ 0) is at-risk; below 0 is over. Tunable in ONE place — the
 * policy the corner chip and any future gauge both read.
 */
export const HEALTH_MARGIN_THRESHOLDS = {
  healthy: 30, // ratio ≥ 30% → Healthy
  tight: 10, // 10% ≤ ratio < 30% → Tight  (0% ≤ ratio < 10% → At risk)
} as const;

/** Human labels for each status — the word the chip shows. */
const HEALTH_STATUS_LABELS: Record<HealthStatus, string> = {
  healthy: "Healthy",
  tight: "Tight",
  "at-risk": "At risk",
  over: "Over",
  "no-ceiling": "No ceiling",
};

/**
 * The pure Health Margin summary. `status`/`label` are the verdict (drive color +
 * word); `ratio`/`percent` are the headroom figure (null when there is no ceiling);
 * `text` is the ready-to-render corner snippet ("Healthy · 62%", "Over · -10%",
 * "No ceiling"). The UI renders these — it never re-derives the zone.
 */
export interface HealthMarginSummary {
  readonly status: HealthStatus;
  readonly label: string;
  /** margin / maxCapped as a fraction (0.62 = 62% headroom); null when no-ceiling. */
  readonly ratio: number | null;
  /** ratio rounded to a whole percent (62, -10); null when no-ceiling. */
  readonly percent: number | null;
  readonly text: string;
}

/**
 * THE Health Margin status gauge. Pure: same inputs → same outputs, no I/O, no clock.
 *
 * Takes the two raw amounts the tile already has — `maxCapped` (the ceiling) and
 * `col` (Σ counted envelopes) — and returns the bucketed verdict plus the snippet.
 * `Health Margin = maxCapped − col` (the same subtractMoney the metrics engine uses;
 * MAY be negative). A zero ceiling short-circuits to `no-ceiling` (ratio undefined).
 * Otherwise the sign of the margin decides `over`, and scaled-integer-cent
 * comparisons bucket the rest — no float ever gates a zone.
 */
export function summarizeHealthMargin(input: {
  readonly maxCapped: Money;
  readonly col: Money;
}): HealthMarginSummary {
  const { maxCapped, col } = input;
  const margin = subtractMoney(maxCapped, col); // = Health Margin; MAY be negative

  // No ceiling to judge against → neutral, ratio undefined (a $0 ceiling reads as
  // "not configured", not an intentional zero cap — see file header).
  if (compareMoney(maxCapped, ZERO_MONEY) === 0) {
    const label = HEALTH_STATUS_LABELS["no-ceiling"];
    return { status: "no-ceiling", label, ratio: null, percent: null, text: label };
  }

  const marginCents = toCents(margin);
  const maxCents = toCents(maxCapped); // > 0 here — safe divisor / positive multiplier
  const ratio = marginCents / maxCents; // presentation float (like formatMoney's ÷100)
  const percent = Math.round(ratio * 100);

  // Zone by EXACT integer comparison: ratio ≥ T% ⟺ marginCents·100 ≥ T·maxCents
  // (maxCents > 0 keeps the inequality direction). Over is decided by sign alone,
  // so it holds even where the ratio would be a repeating fraction.
  let status: HealthStatus;
  if (isNegativeMoney(margin)) {
    status = "over";
  } else if (marginCents * 100 >= HEALTH_MARGIN_THRESHOLDS.healthy * maxCents) {
    status = "healthy";
  } else if (marginCents * 100 >= HEALTH_MARGIN_THRESHOLDS.tight * maxCents) {
    status = "tight";
  } else {
    status = "at-risk";
  }

  const label = HEALTH_STATUS_LABELS[status];
  return { status, label, ratio, percent, text: `${label} · ${percent}%` };
}
