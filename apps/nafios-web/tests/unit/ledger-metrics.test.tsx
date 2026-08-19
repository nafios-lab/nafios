import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { LedgerLoading } from "../../src/features/finance/components/ledger/ledger-loading.tsx";
import { LedgerMetrics } from "../../src/features/finance/components/ledger/ledger-metrics.tsx";

// The metric strip is still a placeholder — no figures are wired to it yet. So the
// only contract worth pinning is the one the skeleton depends on: the strip's
// geometry. `LedgerLoading` mirrors this strip card-for-card, and a mismatch there
// is a layout shift at the moment the read lands. These tests fail the pair
// together rather than letting the two drift apart silently.

afterEach(cleanup);

/** The summary strip inside either tree — the five-column grid. */
function strip(container: HTMLElement) {
  const el = container.querySelector(".grid-cols-5");
  if (!el) throw new Error("no five-column summary strip found");
  return el;
}

describe("LedgerMetrics", () => {
  test("renders five metric slots — one per figure the summary strip shows", () => {
    const { container } = render(<LedgerMetrics />);

    expect(strip(container).children).toHaveLength(5);
  });

  test("its geometry matches the skeleton's strip, so the swap causes no shift", () => {
    const { container: loaded } = render(<LedgerMetrics />);
    const { container: loading } = render(<LedgerLoading />);

    const loadedCards = [...strip(loaded).children];
    const loadingCards = [...strip(loading).children];

    // Same count and same card height: the two states occupy identical space.
    expect(loadedCards).toHaveLength(loadingCards.length);
    for (const card of [...loadedCards, ...loadingCards]) {
      expect(card.className).toContain("h-[100px]");
    }
  });

  test("holds no content or affordance yet — the figures are not wired up", () => {
    // Guards the placeholder honestly: when real values arrive this test is the
    // one that should be rewritten, not quietly left passing on empty cards.
    render(<LedgerMetrics />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByRole("heading")).toBeNull();
  });
});
