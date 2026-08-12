import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { monthOf } from "@nafios/finance";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CreateLedgerForm } from "../../src/features/finance/components/create-ledger/create-ledger-form.tsx";

afterEach(cleanup);

/** Render the form closed, behind a trigger button we can click to open it. */
function renderClosed(month = monthOf("2026-08-01")) {
  return render(
    <CreateLedgerForm ledgerMonth={month} trigger={<button type="button">Open</button>} />,
  );
}

/** Open the dialog and wait for its content to mount. */
async function open(month?: Parameters<typeof renderClosed>[0]) {
  renderClosed(month);
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  await screen.findByText("New Month Ledger");
}

/** Type a valid amount into a labelled MoneyInput. */
function fill(label: string, value: string) {
  const field = screen.getByLabelText(label) as HTMLInputElement;
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value } });
}

describe("CreateLedgerForm — dialog", () => {
  test("stays closed until the trigger is clicked", () => {
    renderClosed();
    expect(screen.queryByText("New Month Ledger")).toBeNull();
  });

  test("opens to the month-titled ledger form", async () => {
    await open();
    expect(screen.getByText("Open August 2026")).toBeDefined();
    expect(screen.getByText("New Month Ledger")).toBeDefined();
    expect(screen.getByLabelText("Opening balance")).toBeDefined();
    expect(screen.getByLabelText("Max Capped")).toBeDefined();
    expect(screen.getByText("Update my saved defaults with these values")).toBeDefined();
    expect(screen.getByRole("button", { name: "Open ledger" })).toBeDefined();
  });

  test("titles the dialog with the long month name across a year boundary", async () => {
    await open(monthOf("2026-12-01"));
    expect(screen.getByText("Open December 2026")).toBeDefined();
  });
});

describe("CreateLedgerForm — submit", () => {
  test("surfaces per-field required errors when submitted empty", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Open ledger" }));

    expect(await screen.findByText("Enter an opening balance")).toBeDefined();
    expect(screen.getByText("Enter a spending cap")).toBeDefined();
  });

  test("submits the keyed-in values once both fields are valid", async () => {
    const log = spyOn(console, "log").mockImplementation(() => {});
    try {
      await open();
      fill("Opening balance", "7152.35");
      fill("Max Capped", "5000");

      fireEvent.click(screen.getByRole("button", { name: "Open ledger" }));

      await waitFor(() => expect(log).toHaveBeenCalledTimes(1));
      // No validation errors leak through on the happy path.
      expect(screen.queryByText("Enter an opening balance")).toBeNull();
      expect(screen.queryByText("Enter a spending cap")).toBeNull();
    } finally {
      log.mockRestore();
    }
  });
});
