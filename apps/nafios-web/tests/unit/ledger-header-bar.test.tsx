import { afterEach, describe, expect, test } from "bun:test";
import { monthOf } from "@nafios/datetime";
import { cleanup, render, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { LedgerHeaderBar } from "../../src/features/finance/components/ledger/ledger-header-bar.tsx";
import { _ledgerInSession } from "../../src/features/finance/state/ledger-sheet/ledger-sheet.atoms.ts";
import { makeLedger } from "../ledger-fixtures.ts";

// The bar takes no props any more (ADR-0030 rule 6): it reads the in-session ledger
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

  test("the actions render for every status — nothing is disabled by state yet", () => {
    // Pinning the CURRENT contract: only the pill is status-driven. When
    // settled-ledger immutability lands (ADR-0030's open persistence boundary),
    // this is the test that must change, not the pill tests below.
    for (const status of ["ongoing", "reconciling", "settled"] as const) {
      renderBar(makeLedger({ status }));
      expect(screen.getAllByRole("button")).toHaveLength(2);
      cleanup();
    }
  });
});

describe("LedgerHeaderBar — the status pill", () => {
  // The pill is the bar's only status-driven element, and it is an ALLOW-LIST:
  // `status === "ongoing"`, not `!== "settled"`. That matters because the union
  // has three members — a negated guard would mislabel a reconciling ledger as
  // ON-GOING, which is precisely the state the user must not mistake for active.

  test("an ongoing ledger is badged ON-GOING", () => {
    renderBar(makeLedger({ status: "ongoing" }));

    const pill = screen.getByText("ON-GOING");
    expect(pill).toBeTruthy();
    // Success tone — the affirmative "you can work in this month" signal.
    expect(pill.className).toContain("bg-success");
  });

  test("a reconciling ledger is NOT badged ON-GOING", () => {
    // The regression this guards: `status !== "settled"` would pass here wrongly.
    renderBar(makeLedger({ status: "reconciling" }));

    expect(screen.queryByText("ON-GOING")).toBeNull();
  });

  test("a settled ledger is NOT badged ON-GOING", () => {
    renderBar(makeLedger({ status: "settled", settledAt: "2026-08-01T09:15:00.000Z" }));

    expect(screen.queryByText("ON-GOING")).toBeNull();
  });

  test("dropping the pill never costs the heading", () => {
    // The pill is a sibling of the heading inside the same row, so a bad guard
    // that early-returns would take the month label with it. The bar must stay
    // navigable for a non-ongoing month.
    renderBar(makeLedger({ month: monthOf("2026-07-15"), status: "settled" }));

    expect(screen.getByRole("heading", { name: "July 2026" })).toBeTruthy();
    expect(screen.queryByText("ON-GOING")).toBeNull();
  });

  test("no ledger in session means no pill either", () => {
    renderBar(null);

    expect(screen.queryByText("ON-GOING")).toBeNull();
  });
});
