import { afterEach, describe, expect, test } from "bun:test";
import {
  type LedgerStatus,
  type LedgerSummaryCard,
  moneyFromCents,
  monthOf,
  summarizeHealthMargin,
} from "@nafios/finance";
import { cleanup, render, screen } from "@testing-library/react";
import { LedgerDetailCard } from "../../src/features/finance/components/home/ledger-detail-card.tsx";

afterEach(cleanup);

/**
 * A July-2026 ongoing summary. Only the fields the card reads matter; the money
 * figures are illustrative but internally consistent — the card formats them, it
 * never re-derives them.
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
      summarizedHealthMargin: summarizeHealthMargin({
        maxCapped: moneyFromCents(500000),
        col: moneyFromCents(430030),
      }),
      asmContribution: moneyFromCents(285205), // opening − col
      outstanding: { count: 1, total: moneyFromCents(12000) },
      isAsmNegative: false,
    },
    counts: { total: 4, paid: 2, pending: 1, skipped: 1, carriedOver: 0 },
    ...overrides,
  };
}

describe("LedgerDetailCard — navigation", () => {
  test("the whole card is one link into that month's ledger", () => {
    render(<LedgerDetailCard {...makeSummary()} />);

    const link = screen.getByRole("link", { name: "Open ledger for July 2026" });
    // `$month` carries the ENCODED month — the first-of-month DATE string the
    // route decodes with `monthOf`, and the same target CreateLedgerForm pushes to.
    expect(link.getAttribute("href")).toBe("/finance/ledger/2026-07-01");
  });

  test("the card body lives inside the link, so the entire surface navigates", () => {
    const { container } = render(<LedgerDetailCard {...makeSummary()} />);

    const card = container.querySelector("[data-slot='ledger-detail-card']");
    expect(card).not.toBeNull();
    expect(card?.closest("a")).not.toBeNull();
  });

  test("only one link is rendered — no nested interactive elements", () => {
    render(<LedgerDetailCard {...makeSummary()} />);

    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("LedgerDetailCard — status pill", () => {
  const cases: readonly [LedgerStatus, string][] = [
    ["ongoing", "On-going"],
    ["reconciling", "Reconciling"],
    ["settled", "Settled"],
  ];

  for (const [status, label] of cases) {
    test(`${status} renders the "${label}" pill`, () => {
      render(<LedgerDetailCard {...makeSummary({ status })} />);

      expect(screen.getByText(label)).toBeTruthy();
    });
  }
});

describe("LedgerDetailCard — summary figures", () => {
  test("renders the month heading and the opening/max-capped line", () => {
    render(<LedgerDetailCard {...makeSummary()} />);

    // Uppercasing is CSS-only, so the accessible text keeps its natural case.
    expect(screen.getByRole("heading", { name: "July, 2026" })).toBeTruthy();
    expect(screen.getByText("$7,152.35 Opening · $5,000.00 Max Capped")).toBeTruthy();
  });

  test("renders both headline metrics with their exact money figures", () => {
    render(<LedgerDetailCard {...makeSummary()} />);

    expect(screen.getByText("Cost of Living")).toBeTruthy();
    expect(screen.getByText("$4,300.30")).toBeTruthy();
    expect(screen.getByText("Free Margin (ASM)")).toBeTruthy();
    expect(screen.getByText("$2,852.05")).toBeTruthy();
  });

  test("a negative ASM contribution is tinted with the error token", () => {
    render(
      <LedgerDetailCard
        {...makeSummary({
          metrics: {
            ...makeSummary().metrics,
            asmContribution: moneyFromCents(-15000),
            isAsmNegative: true,
          },
        })}
      />,
    );

    expect(screen.getByText("-$150.00").className).toContain("text-error-foreground");
  });

  test("the progress bar reports paid out of total envelopes", () => {
    render(<LedgerDetailCard {...makeSummary()} />);

    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("2");
    expect(bar.getAttribute("aria-valuemax")).toBe("4");
    expect(screen.getByText("1 pending")).toBeTruthy();
  });

  test("an empty ledger floors the progress max at 1 so the ratio stays finite", () => {
    render(
      <LedgerDetailCard
        {...makeSummary({ counts: { total: 0, paid: 0, pending: 0, skipped: 0, carriedOver: 0 } })}
      />,
    );

    expect(screen.getByRole("progressbar").getAttribute("aria-valuemax")).toBe("1");
  });
});

describe("LedgerDetailCard — status tally", () => {
  test("renders the paid / pending / skipped / carry-over chips", () => {
    render(<LedgerDetailCard {...makeSummary()} />);

    expect(screen.getByText("2 Paid")).toBeTruthy();
    expect(screen.getByText("1 Pending")).toBeTruthy();
    expect(screen.getByText("1 Skipped")).toBeTruthy();
    expect(screen.getByText("0 Carry-Over")).toBeTruthy();
  });

  test("the skipped chip is omitted while nothing has been skipped", () => {
    render(
      <LedgerDetailCard
        {...makeSummary({ counts: { total: 3, paid: 2, pending: 1, skipped: 0, carriedOver: 0 } })}
      />,
    );

    expect(screen.queryByText(/Skipped/)).toBeNull();
  });
});
