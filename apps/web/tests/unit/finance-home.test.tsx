import { afterEach, describe, expect, test } from "bun:test";
import { monthOf } from "@nafios/finance";
import { cleanup, render, screen } from "@testing-library/react";
import { FinanceHome } from "../../src/features/finance/components/finance-home.tsx";
import type { LedgerHomeState } from "../../src/features/finance/lib/derive-ledger-home-state.ts";

afterEach(cleanup);

/** Build a seam with sensible defaults (no active ledger, July → August 2026). */
function makeSeam(overrides: Partial<LedgerHomeState> = {}): LedgerHomeState {
  return {
    hasActiveLedger: false,
    isWithinLeadDay: false,
    currentMonth: monthOf("2026-07-01"),
    nextMonth: monthOf("2026-08-01"),
    ...overrides,
  };
}

describe("FinanceHome — display decision (hasActiveLedger)", () => {
  test("hasActiveLedger true → renders the Ledger Detail Card placeholder, not the empty state", () => {
    const { container } = render(<FinanceHome seam={makeSeam({ hasActiveLedger: true })} />);

    expect(container.querySelector("[data-slot='ledger-detail-card']")).not.toBeNull();
    // The empty state + creation CTAs are absent.
    expect(screen.queryByText("Start your first month")).toBeNull();
    expect(screen.queryByText(/Open .* ledger/)).toBeNull();
  });

  test("hasActiveLedger false → renders the empty state, not the detail card", () => {
    const { container } = render(<FinanceHome seam={makeSeam({ hasActiveLedger: false })} />);

    expect(screen.getByText("Start your first month")).toBeDefined();
    expect(container.querySelector("[data-slot='ledger-detail-card']")).toBeNull();
  });

  test("Lead-Day does not affect the left column when a ledger is active", () => {
    // Even with the window open, an active ledger still shows the detail card
    // and never the creation CTAs.
    const { container } = render(
      <FinanceHome seam={makeSeam({ hasActiveLedger: true, isWithinLeadDay: true })} />,
    );
    expect(container.querySelector("[data-slot='ledger-detail-card']")).not.toBeNull();
    expect(screen.queryByText(/Recommended/)).toBeNull();
  });
});

describe("FinanceHome — empty-state scenarios (Lead-Day)", () => {
  test("Scenario 1 (outside Lead-Day): single CTA + caption, no Recommended/Instead", () => {
    render(<FinanceHome seam={makeSeam({ isWithinLeadDay: false })} />);

    expect(screen.getByText("Open July 2026 ledger")).toBeDefined();
    expect(screen.getByText("August will become available in the recon period")).toBeDefined();
    expect(screen.queryByText("Recommended")).toBeNull();
    expect(screen.queryByText(/Instead/)).toBeNull();
  });

  test("Scenario 2 (inside Lead-Day): Recommended primary + secondary CTA + caption", () => {
    render(<FinanceHome seam={makeSeam({ isWithinLeadDay: true })} />);

    expect(screen.getByText("Open August 2026 ledger")).toBeDefined();
    expect(screen.getByText("Recommended")).toBeDefined();
    expect(screen.getByText("Open July 2026 Instead")).toBeDefined();
    expect(
      screen.getByText("You're in the recon-period, ready for next coming month"),
    ).toBeDefined();
  });

  test("month/year labels are computed — December rolls into January of the next year", () => {
    render(
      <FinanceHome
        seam={makeSeam({
          isWithinLeadDay: true,
          currentMonth: monthOf("2026-12-01"),
          nextMonth: monthOf("2027-01-01"),
        })}
      />,
    );

    expect(screen.getByText("Open January 2027 ledger")).toBeDefined();
    expect(screen.getByText("Open December 2026 Instead")).toBeDefined();
  });
});

describe("FinanceHome — placeholders rendered in both branches (Scenario 4)", () => {
  test.each([
    ["empty state", false],
    ["detail card", true],
  ])("Pending Reconciliation + View Settled Ledgers render with the %s", (_label, hasActiveLedger) => {
    render(<FinanceHome seam={makeSeam({ hasActiveLedger })} />);

    expect(screen.getByText("0 PENDING RECONCILIATION")).toBeDefined();
    expect(screen.getByText("All caught up")).toBeDefined();
    expect(screen.getByText("View Settled Ledgers")).toBeDefined();
  });
});

describe("FinanceHome — default seam", () => {
  test("renders the empty state + placeholders when no seam is injected", () => {
    // Exercises the locally-assembled seam (deriveLedgerHomeState, clock-read
    // default). hasActiveLedger defaults to false → the empty state shows.
    render(<FinanceHome />);

    expect(screen.getByText("Start your first month")).toBeDefined();
    expect(screen.getByText("0 PENDING RECONCILIATION")).toBeDefined();
  });
});
