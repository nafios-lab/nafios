import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { LedgerLoading } from "../../src/features/finance/components/ledger/ledger-loading.tsx";

// The skeleton is layout, so the assertions are about the two things it promises:
// it announces itself to assistive tech, and its geometry matches the loaded
// sheet card-for-card (so the swap causes no shift).

afterEach(cleanup);

describe("LedgerLoading", () => {
  test("announces the wait to assistive tech instead of rendering silent boxes", () => {
    render(<LedgerLoading />);

    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-busy")).toBe("true");
    // A sighted user reads the pulse; a screen-reader user needs the text.
    expect(screen.getByText("Loading ledger…")).toBeTruthy();
  });

  test("mirrors the loaded geometry: header bar, five summary cards, four envelope rows", () => {
    const { container } = render(<LedgerLoading />);

    // Five metric cards — one per figure the loaded strip shows (Opening Balance,
    // Max Capped, COL, Health Margin, ASM Contribution). A card added to the
    // loaded sheet without a placeholder here reintroduces layout shift.
    expect(container.querySelectorAll(".grid > div")).toHaveLength(5);
    // Envelope rows: enough to fill the fold, deliberately not a real count.
    expect(container.querySelectorAll(".rounded-2xl > div")).toHaveLength(4);
  });

  test("only the content pulses — the card and panel chrome renders solid", () => {
    const { container } = render(<LedgerLoading />);

    // Chrome (the `bg-card` boxes) must not carry the pulse: a whole page of
    // pulsing blocks reads as "still being built" rather than "filling in".
    for (const chrome of container.querySelectorAll(".bg-card")) {
      expect(chrome.className).not.toContain("animate-pulse");
    }
    // …but the placeholders inside them do: 5 header bar + 10 summary (5 cards ×
    // label/value) + 16 envelope (4 rows × avatar/title/meta/amount).
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(31);
  });

  test("renders no interactive affordance — nothing is clickable while loading", () => {
    render(<LedgerLoading />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByRole("heading")).toBeNull();
  });
});
