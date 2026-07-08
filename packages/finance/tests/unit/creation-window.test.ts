import { describe, expect, test } from "bun:test";
import {
  decodeMonth,
  isWithinCreationWindow,
  type LedgerStatus,
  type LedgerSummary,
  type Month,
  resolveCreationState,
} from "../../src/domain";
import { codeOf } from "./codec-error.helper";

// Terse fixtures — the §6 matrix is pure day-math over decodeMonth values + status
// literals; no DB, no clock (leadDays = 7 unless a row says otherwise).
const jun = decodeMonth("2026-06-01");
const jul = decodeMonth("2026-07-01");
const aug = decodeMonth("2026-08-01");

const ledger = (month: Month, status: LedgerStatus): LedgerSummary => ({ month, status });

describe("isWithinCreationWindow — the window boundary (§6 rows 1–10)", () => {
  test("#1 first window day of a 31-day month (31−25=6 < 7)", () => {
    expect(isWithinCreationWindow("2026-07-25", 7)).toBe(true);
  });

  test("#2 the day before the window (31−24=7, not < 7)", () => {
    expect(isWithinCreationWindow("2026-07-24", 7)).toBe(false);
  });

  test("#3 the last day is always in-window", () => {
    expect(isWithinCreationWindow("2026-07-31", 7)).toBe(true);
  });

  test("#4 day 1 is never in-window (leadDays ≤ 7)", () => {
    expect(isWithinCreationWindow("2026-07-01", 7)).toBe(false);
  });

  test("#5 30-day month → window opens on the 24th", () => {
    expect(isWithinCreationWindow("2026-06-24", 7)).toBe(true);
    expect(isWithinCreationWindow("2026-06-23", 7)).toBe(false);
  });

  test("#6 28-day Feb (non-leap 2026)", () => {
    expect(isWithinCreationWindow("2026-02-22", 7)).toBe(true);
    expect(isWithinCreationWindow("2026-02-21", 7)).toBe(false);
  });

  test("#7 29-day Feb (leap 2028)", () => {
    expect(isWithinCreationWindow("2028-02-23", 7)).toBe(true);
    expect(isWithinCreationWindow("2028-02-22", 7)).toBe(false);
  });

  test("#8 leadDays = 1 → only the last day", () => {
    expect(isWithinCreationWindow("2026-07-31", 1)).toBe(true);
    expect(isWithinCreationWindow("2026-07-30", 1)).toBe(false);
  });

  test("#9 leadDays clamped to 7 (day 1 not in final 7)", () => {
    expect(isWithinCreationWindow("2026-07-01", 40)).toBe(false);
  });

  test("#10 leadDays clamped up to 1 → last day only", () => {
    expect(isWithinCreationWindow("2026-07-31", 0)).toBe(true);
  });
});

describe("resolveCreationState — openable months (§6 rows 11–17)", () => {
  test("#11 fresh, window shut → current only", () => {
    const { openable } = resolveCreationState({ today: "2026-07-15", leadDays: 7, ledgers: [] });
    expect(openable).toEqual({ current: jul, next: null });
  });

  test("#12 fresh, in-window → both openable", () => {
    const { openable } = resolveCreationState({ today: "2026-07-28", leadDays: 7, ledgers: [] });
    expect(openable).toEqual({ current: jul, next: aug });
  });

  test("#13 July taken; August openable", () => {
    const { openable } = resolveCreationState({
      today: "2026-07-28",
      leadDays: 7,
      ledgers: [ledger(jul, "ongoing")],
    });
    expect(openable).toEqual({ current: null, next: aug });
  });

  test("#14 both taken — never offered", () => {
    const { openable } = resolveCreationState({
      today: "2026-07-28",
      leadDays: 7,
      ledgers: [ledger(jul, "ongoing"), ledger(aug, "ongoing")],
    });
    expect(openable).toEqual({ current: null, next: null });
  });

  test("#15 July free; window shut → current only", () => {
    const { openable } = resolveCreationState({
      today: "2026-07-03",
      leadDays: 7,
      ledgers: [ledger(jun, "ongoing")],
    });
    expect(openable).toEqual({ current: jul, next: null });
  });

  test("#16 year rolls via addMonths (Dec → next Jan)", () => {
    const { openable } = resolveCreationState({ today: "2026-12-28", leadDays: 7, ledgers: [] });
    expect(openable).toEqual({
      current: decodeMonth("2026-12-01"),
      next: decodeMonth("2027-01-01"),
    });
  });

  test("#17 a settled July still occupies the month", () => {
    const { openable } = resolveCreationState({
      today: "2026-07-15",
      leadDays: 7,
      ledgers: [ledger(jul, "settled")],
    });
    expect(openable).toEqual({ current: null, next: null });
  });
});

describe("resolveCreationState — roll-forward signal (§6 rows 18–22)", () => {
  test("#18 fresh user — S2 empty state, not a warning", () => {
    const { rollForward } = resolveCreationState({ today: "2026-07-15", leadDays: 7, ledgers: [] });
    expect(rollForward).toEqual({ active: false, month: jul, staleOngoingMonth: null });
  });

  test("#19 S5 — previous ledger stuck ongoing", () => {
    const { rollForward } = resolveCreationState({
      today: "2026-07-03",
      leadDays: 7,
      ledgers: [ledger(jun, "ongoing")],
    });
    expect(rollForward).toEqual({ active: true, month: jul, staleOngoingMonth: jun });
  });

  test("#20 settled-month gap still warns; no stale ongoing", () => {
    const { rollForward } = resolveCreationState({
      today: "2026-07-03",
      leadDays: 7,
      ledgers: [ledger(jun, "settled")],
    });
    expect(rollForward).toEqual({ active: true, month: jul, staleOngoingMonth: null });
  });

  test("#21 current month has a ledger — no warning", () => {
    const { rollForward } = resolveCreationState({
      today: "2026-07-15",
      leadDays: 7,
      ledgers: [ledger(jul, "ongoing")],
    });
    expect(rollForward).toEqual({ active: false, month: jul, staleOngoingMonth: null });
  });

  test("#22 S3 in-window — current ledger present, not stale", () => {
    const { rollForward } = resolveCreationState({
      today: "2026-07-28",
      leadDays: 7,
      ledgers: [ledger(jul, "ongoing")],
    });
    expect(rollForward).toEqual({ active: false, month: jul, staleOngoingMonth: null });
  });
});

describe("resolveCreationState — isWindowOpen + purity/validation (§6 rows 23–25)", () => {
  test("#23 isWindowOpen === isWithinCreationWindow(today, leadDays)", () => {
    const state = resolveCreationState({ today: "2026-07-28", leadDays: 7, ledgers: [] });
    expect(state.isWindowOpen).toBe(true);
    expect(state.isWindowOpen).toBe(isWithinCreationWindow("2026-07-28", 7));
  });

  test("#24 result is independent of ledger ordering", () => {
    const ledgers = [ledger(jun, "ongoing"), ledger(jul, "settled"), ledger(aug, "ongoing")];
    const input = { today: "2026-07-28", leadDays: 7 } as const;
    const forward = resolveCreationState({ ...input, ledgers });
    const reversed = resolveCreationState({ ...input, ledgers: [...ledgers].reverse() });
    expect(reversed).toEqual(forward);
  });

  test("#25 malformed/impossible today throws CodecError (validated via EF3.1)", () => {
    for (const bad of ["2026-13-01", "2026-02-30", ""]) {
      expect(codeOf(() => resolveCreationState({ today: bad, leadDays: 7, ledgers: [] }))).toBe(
        "month_not_a_date",
      );
      expect(codeOf(() => isWithinCreationWindow(bad, 7))).toBe("month_not_a_date");
    }
  });

  test("earliest ongoing wins when the one-ongoing invariant is broken (§4.2 rule 4)", () => {
    const may = decodeMonth("2026-05-01");
    const { rollForward } = resolveCreationState({
      today: "2026-07-03",
      leadDays: 7,
      ledgers: [ledger(jun, "ongoing"), ledger(may, "ongoing")],
    });
    expect(rollForward.staleOngoingMonth).toBe(may);
  });
});
