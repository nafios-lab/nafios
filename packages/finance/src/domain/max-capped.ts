// @nafios/finance — domain layer (pure). Zero I/O, zero dependencies, no clock.
//
// THE MaxCapped guardrail — the single home of RFC-022's Informed-Friction
// input-side rules (monthly-ledger.md §2, §4). `maxCapped` is the user's
// self-imposed spending ceiling; setting it ABOVE Opening Balance is the root
// cause of a negative ASM Contribution (they'd be permitting themselves to
// spend more than they earn — monthly-ledger.md §5). Two rules fire at the
// point of configuration, before the value is ever written:
//   • amber zone — `maxCapped > openingBalance`: require an explicit confirm
//     ("you'll be drawing $Z from savings"); a dismiss is not a confirm.
//   • hard block — `maxCapped > 2 × openingBalance`: reject outright, NO
//     override — this catches typos / decimal slips, not deliberate choices.
//
// Pinned here in ONE pure place so the create command (EF3.7, enforcement) and
// the creation form (EF3.12, live UI) agree by construction and the boundary
// can never drift. Numbers only — no user-facing copy (that's EF3.12's job).
// All math goes through EF3.1's Money helpers: the 2× ceiling is
// `addMoney(opening, opening)` (exact doubling-by-addition), never `* 2`.

import { addMoney, compareMoney, type Money, subtractMoney } from "./money";

// ─────────────────────────────── Zones ───────────────────────────────

/**
 * Which guardrail zone a (openingBalance, maxCapped) pair falls in
 * (monthly-ledger.md §2, RFC-022):
 *   'ok'      — maxCapped ≤ openingBalance                 → no friction (green)
 *   'amber'   — openingBalance < maxCapped ≤ 2×opening      → allowed WITH explicit confirmation
 *   'blocked' — maxCapped > 2×openingBalance                → rejected, NO override (input-error guard)
 *
 * Boundaries are strict on the low side and inclusive on the high side of amber:
 * maxCapped == openingBalance is 'ok' (Case 2 — no structural floor, but no friction);
 * maxCapped == 2×openingBalance is 'amber' (the block is only ABOVE 2×).
 */
export type MaxCappedZone = "ok" | "amber" | "blocked";

/**
 * The pure classification of a proposed maxCapped against an opening balance.
 * All money values are exact Money (EF3.1). Numbers only — no display copy (§4.3).
 */
export interface MaxCappedGuardrail {
  readonly zone: MaxCappedZone;
  /** The absolute ceiling: 2 × openingBalance, via addMoney(opening, opening) — exact, no
   *  multiplication/float. Always present so the UI can show "ceiling can't exceed $X". */
  readonly hardCap: Money;
  /** The savings draw the amber confirmation sheet reports — maxCapped − openingBalance —
   *  i.e. the "$Z you'll be drawing from savings". Non-null IFF zone === 'amber'; null for
   *  'ok' (no draw) and 'blocked' (rejected — the UI shows a hard-cap message, not a draw). */
  readonly savingsDraw: Money | null;
}

/**
 * THE zone classifier. Pure: same inputs → same outputs, no I/O, no clock.
 * Drives the creation-form UI (EF3.12) live as the user types, and is the basis
 * validateMaxCapped composes with the confirm flag. Order matters — openingBalance
 * first (the reference income), maxCapped second (the proposed ceiling).
 */
export function evaluateMaxCapped(openingBalance: Money, maxCapped: Money): MaxCappedGuardrail {
  // 2× ceiling by doubling-by-addition — exact for the whole numeric(12,2) range;
  // no multiplyMoney ships (§4.1 rule 3, §8).
  const hardCap = addMoney(openingBalance, openingBalance);

  // 'ok' ⟺ maxCapped ≤ opening; 'blocked' ⟺ maxCapped > 2×opening; else 'amber'.
  // == opening → ok (Case 2); == hardCap → amber (block is strictly above 2×).
  if (compareMoney(maxCapped, openingBalance) <= 0) {
    return { zone: "ok", hardCap, savingsDraw: null };
  }
  if (compareMoney(maxCapped, hardCap) > 0) {
    return { zone: "blocked", hardCap, savingsDraw: null };
  }
  return { zone: "amber", hardCap, savingsDraw: subtractMoney(maxCapped, openingBalance) };
}

// ─────────────────────────── Enforcement gate ─────────────────────────

/** Why validateMaxCapped rejected a proposed maxCapped. */
export type MaxCappedRejectionReason =
  | "overspend_warning" // amber zone, but `acknowledgedOverspend` was false
  | "exceeds_hard_cap"; // blocked zone — above 2×opening; NEVER overridable

/**
 * The gate's result — `{ ok }` plus, on failure, the `reason`. It carries no
 * guardrail payload: callers branch on the reason alone. The zone / hardCap /
 * savingsDraw stay internal to `evaluateMaxCapped` (still used to classify the
 * zone here and by the EF3.12 live form).
 */
export type MaxCappedValidation =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: MaxCappedRejectionReason;
    };

/**
 * THE enforcement gate — used by the create-ledger command (EF3.7) before it writes,
 * and mirrored by the creation form (EF3.12). Pure; never throws (a bad maxCapped is
 * USER input, not a programming error — so it returns a result, unlike EF3.1's codecs
 * which throw on malformed DB values).
 *
 *   zone 'ok'                             → { ok: true }                              (acknowledgedOverspend ignored)
 *   zone 'amber' & acknowledgedOverspend  → { ok: true }
 *   zone 'amber' & !acknowledgedOverspend → { ok: false, reason: 'overspend_warning' }
 *   zone 'blocked' (any acknowledgement)  → { ok: false, reason: 'exceeds_hard_cap' }  (NO override)
 *
 * `acknowledgedOverspend` is the user's explicit amber-zone acknowledgement ("Yes, I
 * understand I'm setting my ceiling above income" — monthly-ledger.md §2 / RFC-022). It
 * can only lift the amber gate; it can NEVER rescue a blocked value.
 */
export function validateMaxCapped(input: {
  readonly openingBalance: Money;
  readonly maxCapped: Money;
  readonly acknowledgedOverspend: boolean;
}): MaxCappedValidation {
  const guardrail = evaluateMaxCapped(input.openingBalance, input.maxCapped);
  switch (guardrail.zone) {
    case "ok":
      // Green needs no confirmation — `acknowledgedOverspend` is ignored.
      return { ok: true };
    case "amber":
      // `acknowledgedOverspend` lifts amber, and ONLY amber.
      return input.acknowledgedOverspend
        ? { ok: true }
        : { ok: false, reason: "overspend_warning" };
    case "blocked":
      // No override — a blocked value rejects even with acknowledgedOverspend: true.
      return { ok: false, reason: "exceeds_hard_cap" };
  }
}
