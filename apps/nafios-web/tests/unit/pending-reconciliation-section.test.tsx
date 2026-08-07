import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { moneyFromCents, monthOf, type ReconPendingLedger } from "@nafios/finance";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// The section owns its own client-side read (ADR-0026) via `useReconPendingLedgers`,
// so we drive it by mocking that hook to a controllable query object — each test
// sets `isPending` / `isError` / the resolved `{ ledgers }`. Rendering the ready
// worklist also exercises the child `PendingReconciliationLedgersList` (money +
// month formatting, the Pending/Pendings pluralization) with real components.
//
// `mock.module` is process-global and leaks forward, so we capture the REAL hook
// and restore it in `afterAll` — use-recon-pending-ledgers.test.tsx runs later and
// must see the real implementation.
const HOOK_PATH = "../../src/features/finance/hooks/use-recon-pending-ledgers";
const realUseReconPendingLedgers = (await import(HOOK_PATH)).useReconPendingLedgers;

type FakeQuery = {
  isPending?: boolean;
  isError?: boolean;
  data?: { ledgers: ReconPendingLedger[] };
  refetch?: () => void;
};
/** The query object the component reads — swapped per test before rendering. */
let query: FakeQuery;

mock.module(HOOK_PATH, () => ({ useReconPendingLedgers: () => query }));

// Imported AFTER the mock is registered so the component binds to the stub.
const { PendingReconciliationSection } = await import(
  "../../src/features/finance/components/pending-reconciliation-section.tsx"
);

afterAll(() => {
  mock.module(HOOK_PATH, () => ({ useReconPendingLedgers: realUseReconPendingLedgers }));
});

/** A reconciliation worklist row with sensible defaults. */
function reconLedger(overrides: Partial<ReconPendingLedger> = {}): ReconPendingLedger {
  return {
    id: "led_recon",
    month: monthOf("2026-05-01"),
    status: "reconciling",
    pendingEnvCounts: 3,
    pendingSumAmount: moneyFromCents(128450), // $1,284.50
    ...overrides,
  };
}

/** Normalize an element's text (collapse the JSX whitespace between fragments). */
function normText(el: Element | null): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

afterEach(cleanup);
beforeEach(() => {
  query = { isPending: false, isError: false, data: { ledgers: [] } };
});

describe("PendingReconciliationSection — read states", () => {
  test("loading → skeletons in the header count and the body, no empty/worklist text", () => {
    query = { isPending: true };
    const { container } = render(<PendingReconciliationSection />);

    // Header still labels the section; the count is a skeleton, not a number.
    expect(normText(screen.getByText(/PENDING RECONCILIATION/))).toBe("PENDING RECONCILIATION");
    // A header skeleton + a body skeleton.
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("All caught up, Yay!")).toBeNull();
  });

  test("error → a generic error card with a working retry", () => {
    const refetch = mock(() => {});
    query = { isError: true, refetch };
    render(<PendingReconciliationSection />);

    expect(screen.getByText("Couldn't load pending reconciliations")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("PendingReconciliationSection — resolved worklist", () => {
  test("empty → 0 in the header and the All caught up empty state, no worklist rows", () => {
    query = { isPending: false, isError: false, data: { ledgers: [] } };
    render(<PendingReconciliationSection />);

    expect(normText(screen.getByText(/PENDING RECONCILIATION/))).toBe("0 PENDING RECONCILIATION");
    expect(screen.getByText("All caught up, Yay!")).toBeDefined();
    expect(screen.queryByText("Review")).toBeNull();
  });

  test("non-empty → count reflects the rows and the worklist renders each ledger", () => {
    query = {
      isPending: false,
      isError: false,
      data: {
        ledgers: [
          reconLedger({
            id: "a",
            month: monthOf("2026-07-01"),
            pendingEnvCounts: 1,
            pendingSumAmount: moneyFromCents(800),
          }),
          reconLedger({ id: "b", month: monthOf("2026-05-01"), pendingEnvCounts: 3 }),
        ],
      },
    };
    render(<PendingReconciliationSection />);

    // Header count is derived from the data (no longer a hard-coded 0).
    expect(normText(screen.getByText(/PENDING RECONCILIATION/))).toBe("2 PENDING RECONCILIATION");
    // The empty state is gone.
    expect(screen.queryByText("All caught up, Yay!")).toBeNull();
    // Each row: month label, pending tally (singular vs plural), Σ amount.
    expect(screen.getByText("July 2026")).toBeDefined();
    expect(screen.getByText("May 2026")).toBeDefined();
    expect(screen.getByText("1 Pending")).toBeDefined();
    expect(screen.getByText("3 Pendings")).toBeDefined();
    expect(screen.getByText("$8.00")).toBeDefined();
    expect(screen.getByText("$1,284.50")).toBeDefined();
    // One Review action per row.
    expect(screen.getAllByText("Review")).toHaveLength(2);
  });
});
