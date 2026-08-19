import { afterEach, describe, expect, test } from "bun:test";
import type { MonthlyLedger } from "@nafios/finance";
import { cleanup, render, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { LedgerStatusAlert } from "../../src/features/finance/components/ledger/ledger-status-alert.tsx";
import { _ledgerInSession } from "../../src/features/finance/state/ledger-sheet/ledger-sheet.atoms.ts";
import { makeLedger } from "../ledger-fixtures.ts";

// The banner is a pure projection of ONE field of the session working copy
// (ADR-0030 rule 5: consumers read the copy, never the seed query) — so the atom
// is the only seam, and `status` is the only input that changes what renders.
//
// The contract worth pinning is that the three statuses are MUTUALLY EXCLUSIVE
// and that `ongoing` — the overwhelmingly common case — is silent. A regression
// that turns the two `&&` guards into an if/else chain, or that drops the
// `ongoing` exclusion, is invisible in line coverage (both branches are "hit"
// by any single render) but shouts at the user on every working month.

afterEach(cleanup);

/** Render the banner against a store pre-seeded with `ledger` (null = no session). */
function renderAlert(ledger: MonthlyLedger | null) {
  const store = createStore();
  store.set(_ledgerInSession, ledger);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  return render(<LedgerStatusAlert />, { wrapper });
}

/** The ISO instant for a given LOCAL wall-clock time — the shape PostgREST returns.
 *  Derived rather than literal so the formatted expectations hold in any TZ. */
const isoForLocal = (y: number, m: number, d: number, h: number, min: number): string =>
  new Date(y, m, d, h, min, 0, 0).toISOString();

/** A settled-at instant for cases that only need *an* instant, not a given label. */
const SETTLED_AT = isoForLocal(2026, 7, 1, 17, 15);

describe("LedgerStatusAlert — when it stays silent", () => {
  test("renders nothing at all until a ledger is in session", () => {
    const { container } = renderAlert(null);

    // Not an empty padding wrapper — literally nothing, so the skeleton→loaded
    // swap never reserves vertical space for a banner that will not appear.
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("an ongoing ledger gets no banner — the normal month is not an event", () => {
    const { container } = renderAlert(makeLedger({ status: "ongoing" }));

    // The padding wrapper still renders (it is outside both guards); what must
    // not appear is an alert.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.textContent).toBe("");
  });
});

describe("LedgerStatusAlert — reconciling", () => {
  test("raises exactly one warning banner", () => {
    renderAlert(makeLedger({ status: "reconciling" }));

    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    // Warning, not error: reconciliation is a state to act on, not a failure.
    expect(alerts[0]?.className).toContain("bg-warning");
  });

  test("names the state and tells the user what unblocks the next month", () => {
    renderAlert(makeLedger({ status: "reconciling" }));

    expect(screen.getByText("This ledger is in reconciliation")).toBeTruthy();
    // The actionable half: WHY it matters — the next month's ledger is gated on it.
    expect(screen.getByRole("alert").textContent).toContain("next month ledger");
  });

  test("says nothing about settlement, even though settledAt is null", () => {
    renderAlert(makeLedger({ status: "reconciling", settledAt: null }));

    expect(screen.queryByText(/settled as of/)).toBeNull();
    // No "as of null" / "as of undefined" leaking from the other branch.
    expect(screen.getByRole("alert").textContent).not.toContain("null");
  });
});

describe("LedgerStatusAlert — settled", () => {
  test("raises exactly one neutral banner — settlement is a fact, not a warning", () => {
    renderAlert(makeLedger({ status: "settled", settledAt: SETTLED_AT }));

    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    // `variant="default"` → the card surface, deliberately not bg-warning.
    expect(alerts[0]?.className).toContain("bg-card");
    expect(alerts[0]?.className).not.toContain("bg-warning");
  });

  test("states the settlement moment and that the ledger is now closed", () => {
    renderAlert(makeLedger({ status: "settled", settledAt: SETTLED_AT }));

    expect(screen.getByText(/This ledger is settled as of/)).toBeTruthy();
    expect(screen.getByText(/All envelopes are locked/)).toBeTruthy();
  });

  test("the moment is the house label, never the raw timestamptz", () => {
    // `settledAt` arrives as PostgREST hands it over; the user must never see that.
    // Asserted in LOCAL time (see `isoForLocal`) because `formatTimestamp` renders
    // locally — hard-coding a wall clock would only pass in the author's zone.
    renderAlert(makeLedger({ status: "settled", settledAt: isoForLocal(2026, 7, 1, 17, 15) }));

    const banner = screen.getByRole("alert").textContent ?? "";
    expect(banner).toContain("1 Aug 2026, 5:15 PM");
    expect(banner).not.toContain("T17:15");
    expect(banner).not.toMatch(/\dZ|\+00:00/);
  });

  test("a settled ledger with no settledAt raises no banner", () => {
    // The `settledAt !== null` half of the guard. The column is nullable in the
    // domain type, so this state is reachable by type even if the DB forbids it —
    // and silence beats a banner reading "settled as of ." or a CodecError thrown
    // from render, which would take the whole sheet down with it.
    renderAlert(makeLedger({ status: "settled", settledAt: null }));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/settled as of/)).toBeNull();
  });

  test("does not raise the reconciliation banner as well", () => {
    // The two guards are independent `&&`s over the same field, so a regression
    // to `status !== "ongoing"` on the first would stack both banners.
    renderAlert(makeLedger({ status: "settled", settledAt: SETTLED_AT }));

    expect(screen.queryByText("This ledger is in reconciliation")).toBeNull();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });
});
