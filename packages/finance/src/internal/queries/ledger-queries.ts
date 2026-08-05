// @nafios/finance — data layer (src/internal/). The Finance-Home READ surface
// (EF3.13): the single public read that resolves the Home decision state for the
// logged-in user given a caller-supplied `today`.
//
// It COMPOSES already-built primitives — it adds no new I/O, no clock, and no
// migration:
//   • the internal `createLedgerRepository(client).list()` (EF3.6) — the user's
//     ledgers, RLS-scoped, chronological (a `LedgerHeader[]`, structurally the
//     resolver's `LedgerMonthStatus[]`), and
//   • the pure `resolveCreationState` / `addMonths` (EF3.4/EF3.1) — the Lead-Day
//     window + openable-month math.
//
// The repository stays INTERNAL (imported here, never re-exported): this query
// is the public read API, the repository its private primitive — same layering
// discipline as the EF3.7 command. `today` is caller-supplied ("YYYY-MM-DD") so
// the surface reads no clock and stays testable; the browser caller passes its
// local calendar day (ADR-0026), tests pass a fixed string.

// import { addMonths, type Month, resolveCreationState } from "../../domain";
import { addMonths, type Month } from "@nafios/datetime";
import { resolveCreationState } from "../../domain";
import type { FinanceClient } from "../client";
import { createLedgerRepository } from "../repositories/ledger.repo";

/** The domain Lead-Day window is fixed at 7 days in EF3 (no finance-settings
 *  layer). Kept module-local; a future config layer would thread it through. */
const LEAD_DAYS = 7;

/**
 * The Finance-Home decision state for the current user — a UI-ready superset of
 * the ticket's `{ hasActiveLedger, isWithinLeadDay, openable }`. It also carries
 * the always-present `currentMonth` / `nextMonth` CTA labels the EF3.10 Home
 * consumes, so this one shape replaces EF3.10's local `LedgerHomeState` verbatim
 * (one source of truth, no field drift).
 *
 * `currentMonth` / `nextMonth` are the always-present labels for the creation
 * CTAs; `openable.current` / `openable.next` are a DIFFERENT concept — the months
 * the user may actually open right now (null when already taken / out of window).
 */
export interface FinanceHomeState {
  /** `true` ⟺ the user has a ledger with `status === 'ongoing'` (the single
   *  active working surface). `reconciling` / `settled` do NOT count. */
  readonly hasActiveLedger: boolean;
  /** `true` ⟺ `today` falls in the Lead-Day window — `resolveCreationState(...).isWindowOpen`. */
  readonly isWithinLeadDay: boolean;
  /** The current calendar month (`monthOf(today)`) — always present. */
  readonly currentMonth: Month;
  /** The next calendar month (`addMonths(currentMonth, 1)`) — always present. */
  readonly nextMonth: Month;
  /** The months openable right now (from the resolver): `current` when free,
   *  `next` only in-window AND free. Either may be `null`. */
  readonly openable: {
    readonly current: Month | null;
    readonly next: Month | null;
  };
}

export interface LedgerQueries {
  /**
   * The Finance-Home decision state for the current user, given a caller-supplied
   * "YYYY-MM-DD" `today`. Reads no clock — the pure resolver does the day math.
   * Runs one `list()` and derives `hasActiveLedger` from it (no second round-trip).
   * Propagates `FinanceDataError` from the repository unchanged.
   */
  getFinanceHomeState(today: string): Promise<FinanceHomeState>;
}

/**
 * Construct the ledger read surface bound to a `FinanceClient`. Client-agnostic:
 * whether the client is the browser/authed client (the runtime caller — RLS
 * applies) or a service/test client is the CALLER's concern. Returns an object so
 * the later composed ongoing-ledger read can join it without another barrel churn.
 */
export function createLedgerQueries(client: FinanceClient): LedgerQueries {
  const ledgers = createLedgerRepository(client); // internal primitive — stays unexported

  return {
    async getFinanceHomeState(today) {
      // One RLS-scoped read of the user's ledgers; FinanceDataError propagates.
      const list = await ledgers.list();
      const state = resolveCreationState({ today, leadDays: LEAD_DAYS, ledgers: list });

      return {
        // 'ongoing' only — reconciling / settled are not the active working surface.
        hasActiveLedger: list.some((ledger) => ledger.status === "ongoing"),
        isWithinLeadDay: state.isWindowOpen,
        currentMonth: state.currentMonth,
        nextMonth: addMonths(state.currentMonth, 1),
        openable: state.openable,
      };
    },
  };
}
