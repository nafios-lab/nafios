import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  type CreateLedgerInput,
  type CreateLedgerResult,
  type MonthlyLedger,
  moneyFromCents,
  monthOf,
} from "@nafios/finance";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// The form's job is to *orchestrate* the mutation: gate the fields, call
// `useCreateLedger`, and branch on the `CreateLedgerResult` (amber confirm flow
// vs. blocking error). We mock the hook to a controllable `mutateAsync` so each
// result branch is driven deterministically — the mutation itself (a @MOCKUP
// today, the real command later) is not under test here, and mocking it removes
// the hook's timing/`useQueryClient` coupling from these UI tests.
// `mock.module` is process-global and leaks forward to later files, so we capture
// the REAL hook up front and restore it in `afterAll` — finance-home.test.tsx
// embeds the real form and must see the real implementation.
const HOOK_PATH = "../../src/features/finance/hooks/use-create-ledger";
const realUseCreateLedger = (await import(HOOK_PATH)).useCreateLedger;

/** Per-test: maps the command input to the result the mocked mutation resolves. */
let resolveWith: (input: CreateLedgerInput) => CreateLedgerResult;
const mutateAsync = mock((input: CreateLedgerInput) => Promise.resolve(resolveWith(input)));

mock.module(HOOK_PATH, () => ({ useCreateLedger: () => ({ mutateAsync }) }));

afterAll(() => {
  mock.module(HOOK_PATH, () => ({ useCreateLedger: realUseCreateLedger }));
});

// Imported AFTER the mock is registered so the component binds to the stub.
const { CreateLedgerForm } = await import(
  "../../src/features/finance/components/create-ledger/create-ledger-form.tsx"
);

// Result fixtures — the form reads only `ok` / `reason`, so the ok payload is
// illustrative (cast rather than a full MonthlyLedger build).
const OK_RESULT: CreateLedgerResult = {
  ok: true,
  ledger: {} as MonthlyLedger,
  parkedLedgerId: null,
};
const OVERSPEND: CreateLedgerResult = { ok: false, reason: "overspend_warning" };
const HARD_CAP: CreateLedgerResult = { ok: false, reason: "exceeds_hard_cap" };

beforeEach(() => {
  mutateAsync.mockClear();
  // Default mirrors the amber flow: first submit warns, the acknowledged re-submit opens.
  resolveWith = (input) => (input.acknowledgedOverspend ? OK_RESULT : OVERSPEND);
});
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

/** Fill both money fields with valid amounts and submit. */
function fillValidAndSubmit() {
  fill("Opening balance", "7152.35");
  fill("Max Capped", "5000");
  fireEvent.click(screen.getByRole("button", { name: "Open ledger" }));
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
    // Validation blocks the submit — the mutation is never reached.
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  test("submits the keyed-in values (acknowledged false) once both fields are valid", async () => {
    resolveWith = () => OK_RESULT;
    await open();
    fillValidAndSubmit();

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        month: monthOf("2026-08-01"),
        openingBalance: moneyFromCents(715235),
        maxCapped: moneyFromCents(500000),
        acknowledgedOverspend: false,
      }),
    );
    // No validation errors leak through on the happy path.
    expect(screen.queryByText("Enter an opening balance")).toBeNull();
    expect(screen.queryByText("Enter a spending cap")).toBeNull();
  });

  test("an overspend_warning result opens the amber confirm dialog", async () => {
    resolveWith = () => OVERSPEND;
    await open();
    fillValidAndSubmit();

    expect(await screen.findByText("Spending cap exceeds your balance")).toBeDefined();
    // The amber path is a confirm flow, not the blocking error surface.
    expect(screen.queryByText("Exceeds hard cap")).toBeNull();
  });

  test("acknowledging the overspend re-submits with acknowledgedOverspend true", async () => {
    await open();
    fillValidAndSubmit();

    fireEvent.click(await screen.findByRole("button", { name: "Acknowledge & open" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
    expect(mutateAsync.mock.calls[1]?.[0]).toMatchObject({ acknowledgedOverspend: true });
  });

  test("a blocking rejection reason opens the error dialog, not the confirm flow", async () => {
    resolveWith = () => HARD_CAP;
    await open();
    fillValidAndSubmit();

    expect(await screen.findByText("Exceeds hard cap")).toBeDefined();
    expect(screen.queryByText("Spending cap exceeds your balance")).toBeNull();
  });
});
