import { afterEach, describe, expect, test } from "bun:test";
import { moneyFromCents } from "@nafios/finance";
import { cleanup, render, screen } from "@testing-library/react";
import { LedgerLoading } from "../../src/features/finance/components/ledger/ledger-loading.tsx";
import { LedgerMetrics } from "../../src/features/finance/components/ledger/metrics/index.tsx";
import { MetricCard } from "../../src/features/finance/components/ledger/metrics/metric-card.tsx";

// The strip now renders real figures, but through PLACEHOLDER amounts — the metrics
// read is not wired. So the contracts worth pinning are the ones that outlive the
// stand-in numbers: the strip's geometry (which `LedgerLoading` mirrors card-for-card
// — a mismatch is a layout shift the instant the read lands), and `MetricCard`'s
// obligation to keep the exact amount reachable whenever it abbreviates one.

afterEach(cleanup);

/** The summary strip inside either tree — the five-column grid. */
function strip(container: HTMLElement) {
  const el = container.querySelector(".grid-cols-5");
  if (!el) throw new Error("no five-column summary strip found");
  return el;
}

describe("MetricCard", () => {
  test("renders the caption and the amount, formatted to fit the card", () => {
    render(<MetricCard label="OPENING BAL" value={moneyFromCents(540033)} />);

    expect(screen.getByText("OPENING BAL")).toBeTruthy();
    expect(screen.getByText("$5,400.33")).toBeTruthy();
  });

  test("adds no tooltip or alternate text when the amount fits as-is", () => {
    // Nothing was given up, so there is no second form of the figure to expose —
    // a title here would be a tooltip repeating what is already on screen.
    render(<MetricCard label="C.O.L" value={moneyFromCents(23300)} />);

    expect(screen.getByText("$233.00").closest("code")?.getAttribute("title")).toBeNull();
  });

  test("keeps the exact amount reachable when it abbreviates one", () => {
    // $123,456,789.00 cannot fit the card, so `formatMoneyToFit` trades precision
    // for width. The spec's rule for that trade: the UI MUST still surface `exact`.
    render(<MetricCard label="MAX CAPPED" value={moneyFromCents(12345678900)} />);

    const abbreviated = screen.getByText("$123.46M");
    expect(abbreviated.closest("code")?.getAttribute("title")).toBe("$123,456,789.00");
    // Sighted users get the tooltip; screen readers read the exact string instead
    // of the abbreviation, so the abbreviation is hidden from them.
    expect(abbreviated.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("$123,456,789.00").className).toContain("sr-only");
  });

  test("shows the edit affordance only when the metric is editable", () => {
    const { unmount } = render(<MetricCard label="C.O.L" value={moneyFromCents(23300)} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    unmount();

    render(<MetricCard label="OPENING BAL" value={moneyFromCents(540033)} editable />);
    expect(screen.getByRole("button", { name: "edit-OPENING BAL" })).toBeTruthy();
  });

  test("routes the edit affordance to onEdit", () => {
    let edits = 0;
    render(
      <MetricCard
        label="MAX CAPPED"
        value={moneyFromCents(640033)}
        editable
        onEdit={() => {
          edits += 1;
        }}
      />,
    );

    screen.getByRole("button", { name: "edit-MAX CAPPED" }).click();

    expect(edits).toBe(1);
  });
});

describe("LedgerMetrics", () => {
  test("renders five metric slots — one per figure the summary strip shows", () => {
    const { container } = render(<LedgerMetrics />);

    expect(strip(container).children).toHaveLength(5);
  });

  test("labels every slot, in display order", () => {
    const { container } = render(<LedgerMetrics />);

    const labels = [...strip(container).children].map(
      (card) => card.querySelector("p")?.textContent,
    );

    expect(labels).toEqual(["OPENING BAL", "MAX CAPPED", "C.O.L", "HEALTH MARGIN", "ASM CONTR"]);
  });

  test("its geometry matches the skeleton's strip, so the swap causes no shift", () => {
    const { container: loaded } = render(<LedgerMetrics />);
    const { container: loading } = render(<LedgerLoading />);

    const loadedCards = [...strip(loaded).children];
    const loadingCards = [...strip(loading).children];

    // Same count and same card height: the two states occupy identical space.
    expect(loadedCards).toHaveLength(loadingCards.length);
    for (const card of [...loadedCards, ...loadingCards]) {
      expect(card.className).toContain("h-[90px]");
    }
  });

  test("exposes an edit affordance only on the two figures the user owns", () => {
    // Opening Balance and Max Capped are inputs; the other three are derived and
    // must never offer an edit. If a derived metric ever grows one, this fails.
    render(<LedgerMetrics />);

    expect(screen.queryAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "edit-OPENING BAL",
      "edit-MAX CAPPED",
    ]);
  });

  test("leaves the edit affordances inert until the metric-edit flow lands", () => {
    // The strip deliberately passes no `onEdit`. Clicking must be a no-op rather
    // than firing a silent handler — and this test is the one to rewrite when the
    // real flow arrives, not quietly leave passing.
    render(<LedgerMetrics />);

    const edit = screen.getByRole("button", { name: "edit-OPENING BAL" });

    expect(() => edit.click()).not.toThrow();
  });
});
