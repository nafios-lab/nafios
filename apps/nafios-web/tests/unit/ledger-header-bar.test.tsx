import { afterEach, describe, expect, test } from "bun:test";
import { monthOf } from "@nafios/datetime";
import { cleanup, render, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { LedgerHeaderBar } from "../../src/features/finance/components/ledger/ledger-header-bar.tsx";
import { _ledgerInSession } from "../../src/features/finance/state/ledger-sheet/ledger-sheet.atoms.ts";
import { makeLedger } from "../ledger-fixtures.ts";

// The bar takes no props any more (ADR-0029): it reads the in-session ledger
// from a Jotai atom and formats the month itself. So every case here seeds a
// store — the atom, not a prop, is the seam.

afterEach(cleanup);

/** Render the bar against a store pre-seeded with `ledger` (null = no session). */
function renderBar(ledger: ReturnType<typeof makeLedger> | null) {
  const store = createStore();
  store.set(_ledgerInSession, ledger);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  return render(<LedgerHeaderBar />, { wrapper });
}

describe("LedgerHeaderBar", () => {
  test("renders nothing until a ledger is in session", () => {
    const { container } = renderBar(null);

    // No session → no chrome at all, so the sheet's skeleton→loaded swap never
    // flashes a bar with an empty heading.
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  test("formats the in-session ledger's month as the page heading", () => {
    // The bar owns the formatting now — it is handed a `Month`, not a label.
    renderBar(makeLedger({ month: monthOf("2026-07-15") }));

    expect(screen.getByRole("heading", { name: "July 2026" })).toBeTruthy();
  });

  test("the heading follows the atom, not the route — December rolls its own year", () => {
    renderBar(makeLedger({ month: monthOf("2026-12-01") }));

    expect(screen.getByRole("heading", { name: "December 2026" })).toBeTruthy();
  });

  test("renders the envelope actions", () => {
    renderBar(makeLedger());

    expect(screen.getByRole("button", { name: /Add Envelope/ })).toBeTruthy();
    // Two buttons: the labelled add CTA and the icon-only bulk-action trigger.
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  test("shows the status pill", () => {
    // Hard-coded today — the bar does not read `ledger.status` yet. Update this
    // expectation (and pass a non-ongoing fixture) when the real status is wired in.
    renderBar(makeLedger({ status: "settled" }));

    expect(screen.getByText("ON-GOING")).toBeTruthy();
  });
});
