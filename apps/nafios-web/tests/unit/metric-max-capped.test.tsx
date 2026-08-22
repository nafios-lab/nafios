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
  _metrics_maxCapped,
  _metrics_openingBalance,
  _startLedgerSession,
} from "../../src/features/finance/state/ledger-sheet/ledger-sheet.atoms.ts";
import { makeLedger } from "../ledger-fixtures.ts";

// The max-capped card AS A WHOLE — the edit affordance, the field, and the write it
// owns, over a SEEDED session. The sibling of metric-opening-balance.test.tsx: both
// cards compose the SAME `useUpdateLedgerHeader`, so what is pinned here is only
// what the card itself decides — which field it asks the hook for, when it commits,
// when it reverts, and how the acknowledgement dialog is wired. The hook's own
// contract is run against both fields in use-update-ledger-header.test.tsx.
//
// Same three seams as that suite (finance client, the command, toast), because the
// card composes the hook rather than taking handlers as props.
const CLIENT_PATH = "../../src/features/finance/lib/finance-client";
const SONNER_PATH = "@nafios/ui/components/ui/sonner";
// Captured BEFORE the stubs go in. `getFinanceClient` memoizes its client, so a
// leaked stub does not merely mock the next suite's seam — it hands that suite a
// client with no query builder at all, and its reads hang to the timeout.
const realFinanceClientModule = { ...(await import(CLIENT_PATH)) };
const realSonner = { ...(await import(SONNER_PATH)) };

type ToastOptions = { id?: string; description?: string; closeButton?: boolean; duration?: number };
const toastError = mock((_message: string, _options?: ToastOptions) => "toast-1");
const toastDismiss = mock((_id?: string | number) => undefined);

let answer: (ledger: MonthlyLedger, ack?: boolean) => UpdateLedgerResult;
/** The WHOLE row is recorded: the card's job is to move `maxCapped` and nothing else. */
let calls: Array<{ ledger: MonthlyLedger; ack: boolean | undefined }>;

mock.module(CLIENT_PATH, () => ({ getFinanceClient: () => ({}) }));
mock.module(SONNER_PATH, () => ({
  ...realSonner,
  toast: { ...realSonner.toast, error: toastError, dismiss: toastDismiss },
}));
mock.module("@nafios/finance", () => ({
  ...finance,
  createLedgerCommands: () => ({
    updateLedger: (ledger: MonthlyLedger, ack?: boolean) => {
      calls.push({ ledger, ack });
      return Promise.resolve(answer(ledger, ack));
    },
  }),
}));

// Imported AFTER the mocks are registered so the card binds to the stubs.
const { MetricMaxCapped } = await import(
  "../../src/features/finance/components/ledger/metrics/max-capped.tsx"
);

afterAll(() => {
  mock.module("@nafios/finance", () => finance);
  mock.module(CLIENT_PATH, () => realFinanceClientModule);
  mock.module(SONNER_PATH, () => realSonner);
});

const { moneyFromCents, toCents } = finance;

/** The fixture's persisted cap ($5,000.00) — every revert target below. */
const PERSISTED = 500000;
/** The fixture's persisted opening balance, which every write must forward intact. */
const PERSISTED_BALANCE = 715235;

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
  return { store, queryClient, ...render(<MetricMaxCapped />, { wrapper }) };
}

function field(): HTMLInputElement {
  return screen.getByRole("textbox") as HTMLInputElement;
}

/** Open the field and type an amount into it, in major units. */
function type(amount: string) {
  fireEvent.click(screen.getByRole("button", { name: "edit-maxcapped" }));
  fireEvent.focus(field());
  fireEvent.change(field(), { target: { value: amount } });
}

beforeEach(() => {
  calls = [];
  answer = (ledger) => ({ ok: true, ledger });
  toastError.mockClear();
  toastDismiss.mockClear();
});
afterEach(cleanup);

describe("MetricMaxCapped — display", () => {
  test("renders the caption and the session's cap, formatted to fit the card", () => {
    renderCard();

    expect(screen.getByText("MAX CAPPED")).toBeTruthy();
    expect(screen.getByText("$5,000.00")).toBeTruthy();
  });

  test("renders nothing until the session holds a cap", () => {
    // Null is the pre-read state. A $0.00 card would assert a ceiling nobody read.
    const store = createStore();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(<MetricMaxCapped />, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <Provider store={store}>{children}</Provider>
        </QueryClientProvider>
      ),
    });

    expect(container.firstChild).toBeNull();
  });

  test("tracks the session — a later write to the atom re-renders the figure", () => {
    const { store } = renderCard();

    act(() => store.set(_metrics_maxCapped, moneyFromCents(400000)));

    expect(screen.getByText("$4,000.00")).toBeTruthy();
    expect(screen.queryByText("$5,000.00")).toBeNull();
  });

  test("keeps the exact amount reachable when it abbreviates one", () => {
    // `formatMoneyToFit` trades precision for width; the spec's rule for that trade
    // is that `exact` MUST stay reachable — tooltip for eyes, sr-only for readers.
    const { store } = renderCard();

    act(() => store.set(_metrics_maxCapped, moneyFromCents(12345678900)));

    const abbreviated = screen.getByText("$123.46M");
    expect(abbreviated.closest("code")?.getAttribute("title")).toBe("$123,456,789.00");
    expect(abbreviated.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("$123,456,789.00").className).toContain("sr-only");
  });

  test("adds no tooltip or alternate text when the amount fits as-is", () => {
    const { store } = renderCard();

    act(() => store.set(_metrics_maxCapped, moneyFromCents(23300)));

    expect(screen.getByText("$233.00").closest("code")?.getAttribute("title")).toBeNull();
  });

  test("matches the strip's card height, so it lines up with its siblings", () => {
    const { container } = renderCard();

    expect(container.querySelector(".h-\\[90px\\]")).toBeTruthy();
  });
});

describe("MetricMaxCapped — committing an edit", () => {
  test("Enter commits the typed cap, unacknowledged", async () => {
    renderCard();
    type("1234.56");

    await act(async () => {
      fireEvent.keyDown(field(), { key: "Enter" });
    });

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(cents(calls[0]?.ledger.maxCapped)).toBe(123456);
    // Always false on the first attempt: the amber acknowledgement is a decision the
    // user has not been asked for yet.
    expect(calls[0]?.ack).toBe(false);
  });

  test("sends the opening balance along untouched — the command judges the PAIR", async () => {
    // The card that must NOT move the balance. `updateLedger` takes the whole
    // header, so a card editing the wrong key is a silent cross-field write.
    renderCard();
    type("1234.56");

    await act(async () => {
      fireEvent.keyDown(field(), { key: "Enter" });
    });

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(cents(calls[0]?.ledger.openingBalance)).toBe(PERSISTED_BALANCE);
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

  test("an unchanged cap commits nothing — no write for a no-op edit", async () => {
    // The command has its own no-op fast path, but a round trip that changes nothing
    // would still repaint and re-seed for no reason.
    renderCard();
    type("5000.00");

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

    expect(calls).toHaveLength(0);
  });

  test("a key that is not Enter neither commits nor closes the field", () => {
    renderCard();
    type("1234.56");

    fireEvent.keyDown(field(), { key: "5" });

    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  test("a successful commit replaces the session entity, not just the figure", async () => {
    const written = makeLedger({ maxCapped: moneyFromCents(123456) });
    answer = () => ({ ok: true, ledger: written });
    const { store } = renderCard();
    type("1234.56");

    await act(async () => {
      fireEvent.keyDown(field(), { key: "Enter" });
    });

    await waitFor(() => expect(store.get(_ledgerInSession)).toBe(written));
  });

  test("a commit repaints the cap only — the opening-balance card is untouched", async () => {
    const { store } = renderCard();
    type("1234.56");

    await act(async () => {
      fireEvent.keyDown(field(), { key: "Enter" });
    });

    await waitFor(() => expect(cents(store.get(_metrics_maxCapped))).toBe(123456));
    expect(cents(store.get(_metrics_openingBalance))).toBe(PERSISTED_BALANCE);
  });
});

describe("MetricMaxCapped — abandoning an edit", () => {
  test("blurring reverts the figure to the persisted one and writes nothing", () => {
    // Clicking away is a CANCEL, not a commit: the figure moved into the atom as the
    // user typed, so leaving it there would paint a ceiling nobody saved.
    const { store } = renderCard();
    type("1234.56");
    expect(cents(store.get(_metrics_maxCapped))).toBe(123456);

    fireEvent.blur(field());

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(cents(store.get(_metrics_maxCapped))).toBe(PERSISTED);
    expect(screen.getByText("$5,000.00")).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  test("the tick closes the field without writing — a real click blurs first", () => {
    // `fireEvent.click` does not blur, so this pins ONLY the affordance swapping
    // back: the tick has no commit of its own, and under a real pointer the blur
    // that precedes it is what decides the outcome (a revert). Same shape as the
    // opening-balance card's tick.
    renderCard();
    type("1234.56");

    fireEvent.click(screen.getByRole("button", { name: "save-change-max-capped" }));

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(calls).toHaveLength(0);
    expect(screen.getByRole("button", { name: "edit-maxcapped" })).toBeTruthy();
  });
});

describe("MetricMaxCapped — the overspend acknowledgement", () => {
  /** Commit an amber cap and wait for the dialog. */
  async function commitIntoDialog() {
    answer = (ledger, ack) =>
      ack === true ? { ok: true, ledger } : { ok: false, reason: "overspend_warning" };
    const harness = renderCard();
    type("9999.00");
    await act(async () => {
      fireEvent.keyDown(field(), { key: "Enter" });
    });
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    return harness;
  }

  test("a rejected amber edit raises the dialog, with the figure still on screen", async () => {
    // A cap above the balance is exactly the amber case for THIS card: the month is
    // set up to run at a deficit.
    const { store } = await commitIntoDialog();

    expect(screen.getByText("That leaves your spending cap above your balance")).toBeTruthy();
    // The dialog asks about THIS amount, so it has to stay painted behind it.
    expect(cents(store.get(_metrics_maxCapped))).toBe(999900);
    // A decision, not a failure — the toast lane is for the terminal reasons.
    expect(toastError).not.toHaveBeenCalled();
  });

  test("acknowledging retries with the flag and closes the dialog on its own", async () => {
    const user = userEvent.setup();
    const { store } = await commitIntoDialog();

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.ack).toBe(true);
    expect(cents(calls[1]?.ledger.maxCapped)).toBe(999900);
    // `open` is derived from `pendingAck`, so clearing the decision is what closes it.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(cents(store.get(_metrics_maxCapped))).toBe(999900);
  });

  test("cancelling reverts the figure and leaves the write unmade", async () => {
    const user = userEvent.setup();
    const { store } = await commitIntoDialog();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(cents(store.get(_metrics_maxCapped))).toBe(PERSISTED));
    expect(calls).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("dismissing with Escape reverts too — every decline is the same decline", async () => {
    const user = userEvent.setup();
    const { store } = await commitIntoDialog();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(cents(store.get(_metrics_maxCapped))).toBe(PERSISTED));
    expect(calls).toHaveLength(1);
  });

  test("the close behind an acknowledgement does not roll the saved figure back", async () => {
    // The reason the card wires `onReject` and not `onOpenChange`: the latter also
    // fires on the close Radix runs right after a confirm, which would undo the very
    // value the user just acknowledged.
    const user = userEvent.setup();
    const { store } = await commitIntoDialog();

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(cents(store.get(_metrics_maxCapped))).toBe(999900);
  });
});

describe("MetricMaxCapped — a terminal rejection", () => {
  test("reverts the figure and raises the reason's toast", async () => {
    answer = () => ({ ok: false, reason: "exceeds_hard_cap" });
    const { store } = renderCard();
    type("1234.56");

    await act(async () => {
      fireEvent.keyDown(field(), { key: "Enter" });
    });

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(cents(store.get(_metrics_maxCapped))).toBe(PERSISTED);
    // No decision to make, so no dialog — the toast is the whole response.
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
