import { afterEach, describe, expect, test } from "bun:test";
import {
  type FinanceHomeState,
  type LedgerSummaryCard,
  moneyFromCents,
  monthOf,
} from "@nafios/finance";
import { cleanup, render, screen } from "@testing-library/react";
import { NextLedgerAlert } from "../../src/features/finance/components/next-ledger-alert.tsx";

afterEach(cleanup);

/** A non-fresh, in-window seam — June → July 2026, no active ledger by default. */
function makeSeam(overrides: Partial<FinanceHomeState> = {}): FinanceHomeState {
  return {
    fresh_start_ledger: false,
    activeLedgerSummary: null,
    isWithinLeadDay: true,
    currentMonth: monthOf("2026-06-01"),
    nextMonth: monthOf("2026-07-01"),
    openable: { current: null, next: monthOf("2026-07-01") },
    ...overrides,
  };
}

/** An ongoing-ledger summary with a caller-chosen pending count (drives the tone). */
function summaryWithPending(pending: number): LedgerSummaryCard {
  return {
    id: "led_june_2026",
    month: monthOf("2026-06-01"),
    status: "ongoing",
    openingBalance: moneyFromCents(715235),
    maxCapped: moneyFromCents(500000),
    metrics: {
      col: moneyFromCents(430030),
      healthMargin: moneyFromCents(69970),
      asmContribution: moneyFromCents(285205),
      outstanding: { count: pending, total: moneyFromCents(pending * 1000) },
      isAsmNegative: false,
    },
    counts: { total: pending + 3, paid: 3, pending, skipped: 0, carriedOver: 0 },
  };
}

describe("NextLedgerAlert — Lead-Day gate", () => {
  test("outside the Lead-Day window it renders nothing", () => {
    const { container } = render(<NextLedgerAlert {...makeSeam({ isWithinLeadDay: false })} />);

    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("inside the window it renders a single alert with the open CTA", () => {
    render(<NextLedgerAlert {...makeSeam()} />);

    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Open .+ ledger/ })).toBeDefined();
  });
});

describe("NextLedgerAlert — tone by pending count", () => {
  test("active ledger with pending envelopes → info tone + wrap-up copy", () => {
    render(<NextLedgerAlert {...makeSeam({ activeLedgerSummary: summaryWithPending(7) })} />);

    expect(screen.getByText("July 2026 is ready to open")).toBeDefined();
    expect(screen.getByText(/Wrap up June's 7 pending envelopes/)).toBeDefined();
    expect(screen.getByText(/move into reconciliation/)).toBeDefined();
    expect(screen.getByText("Open July ledger")).toBeDefined();
    expect(screen.getByText("Opens automatically on Jul 1 if you don't")).toBeDefined();
    expect(screen.getByRole("alert").className).toContain("bg-info");
    // The two tones are mutually exclusive — no settled copy leaks in.
    expect(screen.queryByText(/all settled/)).toBeNull();
  });

  test("no active ledger → success tone + settled copy", () => {
    render(<NextLedgerAlert {...makeSeam()} />);

    expect(screen.getByText("July 2026 is ready to open")).toBeDefined();
    expect(
      screen.getByText(
        "June is all settled — nothing pending. Roll into July whenever you're ready.",
      ),
    ).toBeDefined();
    expect(screen.getByText("Open July ledger")).toBeDefined();
    expect(screen.getByText("Opens automatically on Jul 1 if you don't")).toBeDefined();
    expect(screen.getByRole("alert").className).toContain("bg-success");
    // No wrap-up copy leaks into the settled tone.
    expect(screen.queryByText(/Wrap up/)).toBeNull();
    expect(screen.queryByText(/reconciliation/)).toBeNull();
  });

  test("active ledger with zero pending collapses to the settled tone", () => {
    render(<NextLedgerAlert {...makeSeam({ activeLedgerSummary: summaryWithPending(0) })} />);

    expect(screen.getByText(/all settled/)).toBeDefined();
    expect(screen.getByRole("alert").className).toContain("bg-success");
  });

  test("a single pending envelope reads in the singular", () => {
    render(<NextLedgerAlert {...makeSeam({ activeLedgerSummary: summaryWithPending(1) })} />);

    expect(screen.getByText(/1 pending envelope\b/)).toBeDefined();
    expect(screen.queryByText(/pending envelopes/)).toBeNull();
  });

  test("multiple pending envelopes read in the plural", () => {
    render(<NextLedgerAlert {...makeSeam({ activeLedgerSummary: summaryWithPending(12) })} />);

    expect(screen.getByText(/12 pending envelopes/)).toBeDefined();
  });
});

describe("NextLedgerAlert — computed month labels", () => {
  test("labels roll across the year boundary (December → January)", () => {
    render(
      <NextLedgerAlert
        {...makeSeam({
          currentMonth: monthOf("2026-12-01"),
          nextMonth: monthOf("2027-01-01"),
        })}
      />,
    );

    expect(screen.getByText("January 2027 is ready to open")).toBeDefined();
    expect(screen.getByText("Open January ledger")).toBeDefined();
    expect(screen.getByText("Opens automatically on Jan 1 if you don't")).toBeDefined();
  });

  test("the auto-open caption abbreviates a long month name to three letters", () => {
    render(
      <NextLedgerAlert
        {...makeSeam({
          currentMonth: monthOf("2026-08-01"),
          nextMonth: monthOf("2026-09-01"),
        })}
      />,
    );

    expect(screen.getByText("Opens automatically on Sep 1 if you don't")).toBeDefined();
  });
});
