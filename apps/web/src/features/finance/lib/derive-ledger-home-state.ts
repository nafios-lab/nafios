import { addMonths, type Month, resolveCreationState } from "@nafios/finance";

// The finance-home ledger-state SEAM (EF3.10 plan, Decision 3).
//
// The left-column display decision is a pure function of this single value. In
// THIS story it is assembled locally: `hasActiveLedger` is a MOCKED flag
// (default `false`) and the empty-state fields come from the pure domain
// resolver over an empty ledger set. EF3.13 replaces the whole value with its
// real read surface's return — so the FIELD NAMES here are the contract between
// the two tickets and must stay identical.

/** The resolved ledger-state the finance home renders from. */
export interface LedgerHomeState {
  /** `true` ⟺ the user has an active (`status === 'ongoing'`) ledger. Drives the
   *  left-column branch (detail-card placeholder vs. empty state). MOCKED here. */
  readonly hasActiveLedger: boolean;
  /** `true` ⟺ `today` falls in the Lead-Day window. Selects the empty-state
   *  scenario only; irrelevant once an active ledger exists. */
  readonly isWithinLeadDay: boolean;
  /** The current calendar month (`monthOf(today)`). */
  readonly currentMonth: Month;
  /** The next calendar month (`addMonths(currentMonth, 1)`). */
  readonly nextMonth: Month;
}

/** The domain Lead-Day window is fixed at 7 days in EF3 (no config layer). */
const LEAD_DAYS = 7;

/** Local client date as a "YYYY-MM-DD" string — the only clock read, kept out of
 *  the pure branch. Built from local components (not `toISOString`, which is UTC)
 *  so the day-of-month math matches the user's calendar day. */
function localTodayIso(): string {
  const now = new Date();
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Assemble the {@link LedgerHomeState} seam.
 *
 * `hasActiveLedger` is injectable (mock; default `false`) so tests/preview can
 * exercise the detail-card branch. `today` is injectable so the Lead-Day
 * scenario is deterministic under test; it defaults to the local client date.
 * The window/month fields come from the pure `resolveCreationState` over an
 * empty ledger set — the same Lead-Day rule EF3.13 will honour with real data.
 */
export function deriveLedgerHomeState(
  input: { hasActiveLedger?: boolean; today?: string } = {},
): LedgerHomeState {
  const today = input.today ?? localTodayIso();
  const state = resolveCreationState({ today, leadDays: LEAD_DAYS, ledgers: [] });
  return {
    hasActiveLedger: input.hasActiveLedger ?? false,
    isWithinLeadDay: state.isWindowOpen,
    currentMonth: state.currentMonth,
    nextMonth: addMonths(state.currentMonth, 1),
  };
}
