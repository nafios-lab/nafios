import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Money, MonthlyLedger, UpdateLedgerResult } from "@nafios/finance";
import * as finance from "@nafios/finance";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import {
  _ledgerInSession,
  _metrics_openingBalance,
  _startLedgerSession,
} from "../../src/features/finance/state/ledger-sheet/ledger-sheet.atoms.ts";
import { makeLedger } from "../ledger-fixtures.ts";

// The opening-balance card AS A WHOLE — the edit affordance, the field, and the
// write it now owns, over a SEEDED session. ledger-metrics.test.tsx renders the
// same card with no ledger in session, so every commit there short-circuits;
// this suite is the other half: what the card does once there is something to
// write against.
//
// Same three seams as the hook's own suite (finance client, the command, toast),
// because the card composes the hook rather than taking handlers as props. What
// is under test here is the CARD's decisions — when it commits, when it reverts,
// and how the acknowledgement dialog is wired to the hook's two outcomes.
const CLIENT_PATH = "../../src/features/finance/lib/finance-client";
const SONNER_PATH = "@nafios/ui/components/ui/sonner";
// Captured BEFORE the stubs go in. `getFinanceClient` memoizes its client, so a
// leaked stub does not merely mock the next suite's seam — it hands that suite a
// client with no query builder at all, and its reads hang to the timeout.
const realFinanceClientModule = { ...(await import(CLIENT_PATH)) };
const realSonner = { ...(await import(SONNER_PATH)) };

type ToastOptions = { id?: string; description?: string; closeButton?: boolean; duration?: number };
const toastError = mock((_message: string, _options?: ToastOptions) => "toast-1");

let answer: (value: Money, ack?: boolean) => UpdateLedgerResult;
let calls: Array<{ value: Money; ack: boolean | undefined }>;

mock.module(CLIENT_PATH, () => ({ getFinanceClient: () => ({}) }));
mock.module(SONNER_PATH, () => ({
  ...realSonner,
  toast: { ...realSonner.toast, error: toastError },
}));
mock.module("@nafios/finance", () => ({
  ...finance,
  createLedgerCommands: () => ({
    updateLedger: (ledger: MonthlyLedger, ack?: boolean) => {
      calls.push({ value: ledger.openingBalance, ack });
      return Promise.resolve(answer(ledger.openingBalance, ack));
    },
  }),
}));

// Imported AFTER the mocks are registered so the card binds to the stubs.
const { MetricOpenBalance } = await import(
  "../../src/features/finance/components/ledger/metrics/opening-balance.tsx"
);

afterAll(() => {
  mock.module("@nafios/finance", () => finance);
  mock.module(CLIENT_PATH, () => realFinanceClientModule);
  mock.module(SONNER_PATH, () => realSonner);
});

const { moneyFromCents, toCents } = finance;

/** The fixture's persisted opening balance — every revert target below. */
const PERSISTED = 715235;

function cents(value: Money | null | undefined) {
  return value === null || value === undefined ? null : toCents(value);
}

/** The card over a seeded session, the way the sheet composes it. */
function renderCard() {
  const store = createStore();
  store.set(_startLedgerSession, makeLedger());
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>{children}</Provider>
    </QueryClientProvider>
  );
  return { store, queryClient, ...render(<MetricOpenBalance />, { wrapper }) };
}

function field(): HTMLInputElement {
  return screen.getByRole("textbox") as HTMLInputElement;
}

/** Open the field and type an amount into it, in major units. */
function type(amount: string) {
  fireEvent.click(screen.getByRole("button", { name: "edit-OPENING BAL" }));
  fireEvent.focus(field());
  fireEvent.change(field(), { target: { value: amount } });
}

beforeEach(() => {
  calls = [];
  answer = (value) => ({ ok: true, ledger: makeLedger({ openingBalance: value }) });
  toastError.mockClear();
});
afterEach(cleanup);

describe("MetricOpenBalance — committing an edit", () => {
  test("Enter commits the typed amount, unacknowledged", async () => {
    renderCard();
    type("1234.56");

    await act(async () => {
      fireEvent.keyDown(field(), { key: "Enter" });
    });

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(cents(calls[0]?.value)).toBe(123456);
    // Always false on the first attempt: the amber acknowledgement is a decision
    // the user has not been asked for yet.
    expect(calls[0]?.ack).toBe(false);
  });

  test("Enter closes the field and shows the written figure", async () => {
    renderCard();
    type("1234.56");

    await act(async () => {
      fireEvent.keyDown(field(), { key: "Enter" });
    });

    expect(screen.queryByRole("textbox")).toBeNull();
    await waitFor(() => expect(screen.getByText("$1,234.56")).toBeTruthy());
  });

  test("an unchanged amount commits nothing — no write for a no-op edit", async () => {
    // The command has its own no-op fast path, but a round trip that changes
    // nothing would still repaint and re-seed for no reason.
    renderCard();
    type("7152.35");

    await act(async () => {
      fireEvent.keyDown(field(), { key: "Enter" });
    });

    expect(calls).toHaveLength(0);
  });

  test("a cleared field commits nothing — an empty field is mid-edit, not zero", async () => {
    renderCard();
    type("");

    await act(async () => {
      fireEvent.keyDown(field(), { key: "Enter" });
    });

    // `CurrencyInput` emits null for an empty field, which the card refuses to
    // forward — so the atom still holds the persisted figure and it matches.
    expect(calls).toHaveLength(0);
  });

  test("a key that is not Enter neither commits nor closes the field", async () => {
    renderCard();
    type("1234.56");

    fireEvent.keyDown(field(), { key: "5" });

    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  test("a successful commit replaces the session entity, not just the figure", async () => {
    const written = makeLedger({ openingBalance: moneyFromCents(123456) });
    answer = () => ({ ok: true, ledger: written });
    const { store } = renderCard();
    type("1234.56");

    await act(async () => {
      fireEvent.keyDown(field(), { key: "Enter" });
    });

    await waitFor(() => expect(store.get(_ledgerInSession)).toBe(written));
  });
});

describe("MetricOpenBalance — abandoning an edit", () => {
  test("blurring reverts the figure to the persisted one and writes nothing", async () => {
    // Clicking away is a CANCEL, not a commit: the figure moved into the atom as
    // the user typed, so leaving it there would paint an amount nobody saved.
    const { store } = renderCard();
    type("1234.56");
    expect(cents(store.get(_metrics_openingBalance))).toBe(123456);

    await act(async () => {
      fireEvent.blur(field());
    });

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(cents(store.get(_metrics_openingBalance))).toBe(PERSISTED);
    expect(screen.getByText("$7,152.35")).toBeTruthy();
    expect(calls).toHaveLength(0);
  });
});

describe("MetricOpenBalance — the overspend acknowledgement", () => {
  /** Commit an amber amount and wait for the dialog. */
  async function commitIntoDialog() {
    answer = (_value, ack) =>
      ack === true
        ? { ok: true, ledger: makeLedger({ openingBalance: moneyFromCents(123456) }) }
        : { ok: false, reason: "overspend_warning" };
    const harness = renderCard();
    type("1234.56");
    await act(async () => {
      fireEvent.keyDown(field(), { key: "Enter" });
    });
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    return harness;
  }

  test("a rejected amber edit raises the dialog, with the figure still on screen", async () => {
    const { store } = await commitIntoDialog();

    expect(screen.getByText("That leaves your spending cap above your balance")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Acknowledge & save" })).toBeTruthy();
    // The dialog asks about THIS amount, so it has to stay painted behind it.
    expect(cents(store.get(_metrics_openingBalance))).toBe(123456);
    // A decision, not a failure — the toast lane is for the terminal reasons.
    expect(toastError).not.toHaveBeenCalled();
  });

  test("acknowledging retries with the flag and closes the dialog on its own", async () => {
    const user = userEvent.setup();
    const { store } = await commitIntoDialog();

    await user.click(screen.getByRole("button", { name: "Acknowledge & save" }));

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.ack).toBe(true);
    expect(cents(calls[1]?.value)).toBe(123456);
    // `open` is derived from `pendingAck`, so clearing the decision is what closes it.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(cents(store.get(_metrics_openingBalance))).toBe(123456);
  });

  test("cancelling reverts the figure and leaves the write unmade", async () => {
    const user = userEvent.setup();
    const { store } = await commitIntoDialog();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(cents(store.get(_metrics_openingBalance))).toBe(PERSISTED));
    expect(calls).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("dismissing with Escape reverts too — every decline is the same decline", async () => {
    const user = userEvent.setup();
    const { store } = await commitIntoDialog();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(cents(store.get(_metrics_openingBalance))).toBe(PERSISTED));
    expect(calls).toHaveLength(1);
  });

  test("the close behind an acknowledgement does not roll the saved figure back", async () => {
    // The reason the card wires `onReject` and not `onOpenChange`: the latter also
    // fires on the close Radix runs right after a confirm, which would undo the
    // very value the user just acknowledged.
    const user = userEvent.setup();
    const { store } = await commitIntoDialog();

    await user.click(screen.getByRole("button", { name: "Acknowledge & save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(cents(store.get(_metrics_openingBalance))).toBe(123456);
  });
});

describe("MetricOpenBalance — a terminal rejection", () => {
  test("reverts the figure and raises the reason's toast", async () => {
    answer = () => ({ ok: false, reason: "exceeds_hard_cap" });
    const { store } = renderCard();
    type("1234.56");

    await act(async () => {
      fireEvent.keyDown(field(), { key: "Enter" });
    });

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(cents(store.get(_metrics_openingBalance))).toBe(PERSISTED);
    // No decision to make, so no dialog — the toast is the whole response.
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
