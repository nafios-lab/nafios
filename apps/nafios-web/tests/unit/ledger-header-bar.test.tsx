import { afterEach, describe, expect, test } from "bun:test";
import { formatMonthLong, monthOf } from "@nafios/datetime";
import { cleanup, render, screen } from "@testing-library/react";
import { LedgerHeaderBar } from "../../src/features/finance/components/ledger/ledger-header-bar.tsx";

afterEach(cleanup);

describe("LedgerHeaderBar", () => {
  test("renders the month label it is given as the page heading", () => {
    render(<LedgerHeaderBar monthLedger={formatMonthLong(monthOf("2026-07-15"))} />);

    expect(screen.getByRole("heading", { name: "July 2026" })).toBeTruthy();
  });

  test("the label is pass-through — the bar formats nothing itself", () => {
    render(<LedgerHeaderBar monthLedger="December 2026" />);

    expect(screen.getByRole("heading", { name: "December 2026" })).toBeTruthy();
  });

  test("renders the envelope actions", () => {
    render(<LedgerHeaderBar monthLedger="July 2026" />);

    expect(screen.getByRole("button", { name: /Add Envelope/ })).toBeTruthy();
    // Two buttons: the labelled add CTA and the icon-only bulk-action trigger.
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  test("shows the status pill", () => {
    render(<LedgerHeaderBar monthLedger="July 2026" />);

    // Hard-coded today — the bar takes no status prop yet. Update this
    // expectation when the real ledger status is wired in.
    expect(screen.getByText("ON-GOING")).toBeTruthy();
  });
});
