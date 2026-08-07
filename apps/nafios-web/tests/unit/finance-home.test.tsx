import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  type FinanceHomeState,
  type LedgerSummaryCard,
  moneyFromCents,
  monthOf,
} from "@nafios/finance";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// FinanceHome now owns its own client-side read (ADR-0026) via `useFinanceHomeState`,
// so we drive it by mocking that hook to a controllable query object — each test
// sets `isPending` / `isError` / the resolved `data` seam, and no QueryClient
// provider is needed (the read plumbing is covered in use-finance-home-state.test.tsx).
//
// `mock.module` is process-global and leaks forward to later files, so we capture
// the REAL hook up front and restore it in `afterAll` — use-finance-home-state.test.tsx
// runs later and must see the real implementation.
const HOOK_PATH = "../../src/features/finance/hooks/use-finance-home-state";
const realUseFinanceHomeState = (await import(HOOK_PATH)).useFinanceHomeState;

type FakeQuery = {
  isPending?: boolean;
  isError?: boolean;
  data?: FinanceHomeState;
  refetch?: () => void;
};
/** The query object the component reads — swapped per test before rendering. */
let query: FakeQuery;

mock.module(HOOK_PATH, () => ({ useFinanceHomeState: () => query }));

// Imported AFTER the mock is registered so the component binds to the stub.
const { FinanceHome } = await import("../../src/features/finance/components/finance-home.tsx");

afterAll(() => {
  mock.module(HOOK_PATH, () => ({ useFinanceHomeState: realUseFinanceHomeState }));
});

/** Build a seam with sensible defaults (fresh-start user, July → August 2026). */
function makeSeam(overrides: Partial<FinanceHomeState> = {}): FinanceHomeState {
  return {
    fresh_start_ledger: true,
    activeLedgerSummary: null,
    isWithinLeadDay: false,
    currentMonth: monthOf("2026-07-01"),
    nextMonth: monthOf("2026-08-01"),
    openable: { current: monthOf("2026-07-01"), next: null },
    ...overrides,
  };
}

/**
 * Build an active-ledger summary — the shape the detail-card hero renders when a
 * ledger is active. Only the fields the card reads matter; the money figures are
 * illustrative but internally consistent (the card formats them, it never
 * re-derives). Pair it with `fresh_start_ledger: false` on the seam.
 */
function makeSummary(overrides: Partial<LedgerSummaryCard> = {}): LedgerSummaryCard {
  return {
    id: "led_july_2026",
    month: monthOf("2026-07-01"),
    status: "ongoing",
    openingBalance: moneyFromCents(715235), // $7,152.35
    maxCapped: moneyFromCents(500000), // $5,000.00
    metrics: {
      col: moneyFromCents(430030), // $4,300.30
      healthMargin: moneyFromCents(69970), // maxCapped − col
      asmContribution: moneyFromCents(285205), // opening − col
      outstanding: { count: 1, total: moneyFromCents(12000) },
      isAsmNegative: false,
    },
    counts: { total: 4, paid: 2, pending: 1, skipped: 1, carriedOver: 0 },
    ...overrides,
  };
}

/** The seam for an active ledger — not a fresh start + its summary, in step. */
function activeSeam(summaryOverrides: Partial<LedgerSummaryCard> = {}): Partial<FinanceHomeState> {
  return { fresh_start_ledger: false, activeLedgerSummary: makeSummary(summaryOverrides) };
}

/** Set the mocked read to a resolved (ready) seam. */
function ready(overrides: Partial<FinanceHomeState> = {}): void {
  query = { isPending: false, isError: false, data: makeSeam(overrides) };
}

beforeEach(() => ready());
afterEach(cleanup);

describe("FinanceHome — read states (loading / error)", () => {
  test("loading → a skeleton, no cards or CTAs", () => {
    query = { isPending: true };
    const { container } = render(<FinanceHome />);

    expect(container.querySelector(".animate-pulse")).not.toBeNull();
    expect(container.querySelector("[data-slot='ledger-detail-card']")).toBeNull();
    expect(screen.queryByText("Start your first month")).toBeNull();
  });

  test("error → a generic error card with a working retry (no error-code matrix)", () => {
    const refetch = mock(() => {});
    query = { isError: true, refetch };
    render(<FinanceHome />);

    expect(screen.getByText("Couldn't load your finance home")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("FinanceHome — display decision (fresh_start_ledger)", () => {
  test("active ledger (+ summary) → renders the Ledger Detail Card, not the empty state", () => {
    ready(activeSeam());
    const { container } = render(<FinanceHome />);

    expect(container.querySelector("[data-slot='ledger-detail-card']")).not.toBeNull();
    // The summary is wired through — the lifecycle pill + a headline metric show.
    expect(screen.getByText("On-going")).toBeDefined();
    expect(screen.getByText("Cost of Living")).toBeDefined();
    // The empty state + creation CTAs are absent.
    expect(screen.queryByText("Start your first month")).toBeNull();
    expect(screen.queryByText(/Open .* ledger/)).toBeNull();
  });

  test("not fresh start but no summary → renders neither card (defensive null-guard)", () => {
    // e.g. only reconciling / settled ledgers: not a fresh start, yet no ongoing
    // summary. The detail card only shows when a summary is present, and it is
    // NOT a fresh start, so the empty/fresh state does not show either (the
    // non-fresh branch still renders the NextLedgerAlert, but neither card).
    ready({ fresh_start_ledger: false, activeLedgerSummary: null });
    const { container } = render(<FinanceHome />);

    expect(container.querySelector("[data-slot='ledger-detail-card']")).toBeNull();
    expect(screen.queryByText("Start your first month")).toBeNull();
  });

  test("fresh start → renders the empty state, not the detail card", () => {
    ready({ fresh_start_ledger: true });
    const { container } = render(<FinanceHome />);

    expect(screen.getByText("Start your first month")).toBeDefined();
    expect(container.querySelector("[data-slot='ledger-detail-card']")).toBeNull();
  });

  test("Lead-Day does not affect the left column when a ledger is active", () => {
    // Even with the window open, an active ledger still shows the detail card
    // and never the creation CTAs.
    ready({ ...activeSeam(), isWithinLeadDay: true });
    const { container } = render(<FinanceHome />);

    expect(container.querySelector("[data-slot='ledger-detail-card']")).not.toBeNull();
    expect(screen.queryByText(/Recommended/)).toBeNull();
  });
});

describe("FinanceHome — empty-state scenarios (Lead-Day)", () => {
  test("Scenario 1 (outside Lead-Day): single CTA + caption, no Recommended/Instead", () => {
    ready({ isWithinLeadDay: false });
    render(<FinanceHome />);

    expect(screen.getByText("Open July 2026 ledger")).toBeDefined();
    expect(screen.getByText("August will become available in the recon period")).toBeDefined();
    expect(screen.queryByText("Recommended")).toBeNull();
    expect(screen.queryByText(/Instead/)).toBeNull();
  });

  test("Scenario 2 (inside Lead-Day): Recommended primary + secondary CTA + caption", () => {
    ready({ isWithinLeadDay: true });
    render(<FinanceHome />);

    expect(screen.getByText("Open August 2026 ledger")).toBeDefined();
    expect(screen.getByText("Recommended")).toBeDefined();
    expect(screen.getByText("Open July 2026 Instead")).toBeDefined();
    expect(
      screen.getByText("You're in the recon-period, ready for next coming month"),
    ).toBeDefined();
  });

  test("month/year labels are computed — December rolls into January of the next year", () => {
    ready({
      isWithinLeadDay: true,
      currentMonth: monthOf("2026-12-01"),
      nextMonth: monthOf("2027-01-01"),
    });
    render(<FinanceHome />);

    expect(screen.getByText("Open January 2027 ledger")).toBeDefined();
    expect(screen.getByText("Open December 2026 Instead")).toBeDefined();
  });
});
