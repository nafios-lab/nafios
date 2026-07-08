// @nafios/finance — domain layer (pure). Zero I/O, zero dependencies, no clock.
//
// THE creation-window / openable-month resolver + roll-forward warning signal.
// Ledger creation is bounded and never automatic (monthly-ledger.md §3, §6): the
// system grants a narrow PERMISSION — open the current month, or (only in the
// last few days of the month) the next one — and, when the user lets a month
// turn over without acting, escalates to a persistent warning rather than
// silently rolling anything forward. All three decisions are pure functions of
// `today` + `leadDays` + the existing ledgers, pinned here in ONE resolver so the
// picker (EF3.12), the create command (EF3.7), and the hub banner (EF3.11/EF3.13)
// agree by construction instead of each re-deriving the date math.
//
// This file does the day-level window math — reading the day-of-month and, via
// the shared calendar.ts helper, the month's length — because EF3.1's Month
// deliberately has no day component. Everything at month granularity
// (build/shift/compare) goes through EF3.1; this file never hand-rolls
// "YYYY-MM" string math and never re-checks first-of-month.
// It also HOMES the roll-forward warning (deferred from the metrics engine —
// EF3.2 §8.6): it is derived from `today` + the SET of ledgers, not from any
// single ledger's fields. Reports permission only — the prev-`ongoing` →
// `reconciling` transition and envelope generation are the create command's job
// (EF3.7), never performed here.

import { daysInMonth } from "./calendar";
import { addMonths, compareMonths, type Month, monthOf } from "./month";
import type { LedgerStatus } from "./monthly-ledger";

// ─────────────────────────── Inputs ───────────────────────────

/**
 * The minimal view of an existing ledger the resolver needs: its month (to decide
 * which months are free) and its status (to spot a stale `ongoing` ledger for the
 * roll-forward signal). A full MonthlyLedger (EF3.2) structurally satisfies this,
 * so the repository (EF3.6/EF3.10) can pass its ledgers directly and test fixtures
 * stay minimal — same "accepts a minimal shape" discipline as computeLedgerMetrics.
 */
export interface LedgerSummary {
  readonly month: Month; // EF3.1
  readonly status: LedgerStatus; // EF3.2
}

// ─────────────────────── Openable months ──────────────────────

/**
 * Which months the user may open right now (monthly-ledger.md §3). At most two —
 * NEVER any other month (no far-future, no back-fill; a month that already has a
 * ledger is never offered).
 */
export interface OpenableMonths {
  /** The current calendar month (monthOf(today)), iff no ledger exists for it.
   *  Window-INDEPENDENT — the current month is always openable when free (a fresh
   *  start, or a gap after settling everything). null when it already has a ledger. */
  readonly current: Month | null;
  /** The next calendar month (addMonths(current, 1)), iff BOTH the window is open
   *  AND no ledger exists for it. null outside the window or when already taken. */
  readonly next: Month | null;
}

// ─────────────────────── Roll-forward signal ──────────────────

/**
 * The roll-forward warning signal (monthly-ledger.md §3 "Roll-forward warning").
 * Derived from `today` + existing ledgers only — NOT from any single ledger's own
 * fields, which is why it lives here and not in the metrics engine (EF3.2 §8.6).
 */
export interface RollForwardSignal {
  /** true ⟺ the current calendar month has NO ledger AND the user already has ≥1
   *  ledger (they were tracking). Drives the persistent, non-dismissible banner —
   *  same prominence tier as the negative-ASM banner. A brand-new user with zero
   *  ledgers gets `false`: they see the "open your first ledger" empty state (S2),
   *  not a warning (§4.2 rule 2). */
  readonly active: boolean;
  /** The current calendar month the banner urges the user to open (monthOf(today)).
   *  ALWAYS set (even when `active` is false) so the UI can name the month. */
  readonly month: Month;
  /** An `ongoing` ledger belonging to a month EARLIER than the current one, if any —
   *  the classic §3 "previous ledger stuck ongoing" case (an `ongoing` ledger may
   *  belong to an already-ended month). null when the gap follows a settled month or
   *  there is no earlier ongoing ledger. Informational only — does not gate `active`. */
  readonly staleOngoingMonth: Month | null;
}

// ─────────────────────── The resolver ─────────────────────────

/** Everything the finance hub / creation flow needs from one pure call. */
export interface CreationState {
  readonly currentMonth: Month; // monthOf(today) — convenience
  readonly isWindowOpen: boolean; // === isWithinCreationWindow(today, leadDays)
  readonly openable: OpenableMonths;
  readonly rollForward: RollForwardSignal;
}

// ─────────────────── Window sizing (day-level) ────────────────

/** Clamp `leadDays` to the domain range 1–7 (fractional floored first), per
 *  monthly-ledger.md §3/§6. EF3 always passes 7; the clamp is defensive so a bad
 *  caller can neither widen the window past a week nor disable it (§4.1 rule 2). */
function clampLeadDays(leadDays: number): number {
  return Math.min(Math.max(Math.floor(leadDays), 1), 7);
}

// ─────────────────────── Creation window ──────────────────────

/**
 * True iff `today` falls within the CREATION WINDOW — the final `leadDays` days of
 * its calendar month (monthly-ledger.md §3). This is the only period during which
 * the NEXT month may be opened. Pure day-math: window is open ⟺
 * (daysInMonth(today) − dayOf(today)) < clampedLeadDays.
 *
 * `today` is a caller-supplied "YYYY-MM-DD" string — the function reads no clock.
 * It is validated via EF3.1's month parsing; a malformed/impossible date throws
 * CodecError (a bad `today` is a programming error, not user input — §4.3).
 *
 * `leadDays` is clamped to the domain range 1–7 (fractional values floored first),
 * per monthly-ledger.md §3/§6. EF3 always passes the fixed 7 (no config layer);
 * clamping is defensive and future-proofs the config capability (EF-later).
 */
export function isWithinCreationWindow(today: string, leadDays: number): boolean {
  // Validate `today` via EF3.1 (throws CodecError on malformed/impossible dates).
  // The day-of-month math below reads the already-validated string directly —
  // day-within-month reasoning is owned here, not by the day-less Month codec.
  monthOf(today);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const day = Number(today.slice(8, 10));
  return daysInMonth(year, month) - day < clampLeadDays(leadDays);
}

/**
 * THE creation-state resolver. Pure: same inputs → same outputs, no I/O, no clock.
 * Composes the window predicate, the openable-month rules, and the roll-forward
 * signal over `today` + `leadDays` + the existing ledgers.
 */
export function resolveCreationState(input: {
  readonly today: string; // caller-supplied "YYYY-MM-DD"; no clock read
  readonly leadDays: number; // EF3 passes 7; clamped to 1–7 (fractional floored)
  readonly ledgers: readonly LedgerSummary[]; // all of the user's existing ledgers, any status/order
}): CreationState {
  const { today, leadDays, ledgers } = input;

  // `currentMonth` also validates `today` via EF3.1 → CodecError on malformed input.
  const currentMonth = monthOf(today);
  const nextMonth = addMonths(currentMonth, 1);
  const isWindowOpen = isWithinCreationWindow(today, leadDays);

  // A month is "taken" if ANY ledger occupies it, regardless of status (the DB
  // (user_id, month) uniqueness constraint, EF1.1). Month identity goes through
  // EF3.1's compareMonths — never string equality on the raw "YYYY-MM".
  const occupied = (m: Month): boolean =>
    ledgers.some((ledger) => compareMonths(ledger.month, m) === 0);

  const hasCurrentLedger = occupied(currentMonth);

  const openable: OpenableMonths = {
    // Current: always openable when free, window-independent (§4.1 rule 3).
    current: hasCurrentLedger ? null : currentMonth,
    // Next: only in-window AND only when free (§4.1 rule 4).
    next: isWindowOpen && !occupied(nextMonth) ? nextMonth : null,
  };

  // Earliest `ongoing` ledger strictly BEFORE the current month, if any — the §3
  // "previous ledger stuck ongoing" case. Deterministic (earliest) and
  // order-independent even if the "one ongoing" invariant is somehow broken.
  let staleOngoingMonth: Month | null = null;
  for (const ledger of ledgers) {
    if (ledger.status === "ongoing" && compareMonths(ledger.month, currentMonth) < 0) {
      if (staleOngoingMonth === null || compareMonths(ledger.month, staleOngoingMonth) < 0) {
        staleOngoingMonth = ledger.month;
      }
    }
  }

  const rollForward: RollForwardSignal = {
    // active ⟺ current month empty AND the user was already tracking (§4.2 rules
    // 1–2). Zero-ledger fresh users are the S2 empty state, not the S5 warning.
    active: hasCurrentLedger === false && ledgers.length > 0,
    month: currentMonth,
    staleOngoingMonth,
  };

  return { currentMonth, isWindowOpen, openable, rollForward };
}
