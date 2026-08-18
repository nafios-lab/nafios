import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { monthOf } from "@nafios/datetime";
import { FinanceDataError, type GetLedgerQueryResp } from "@nafios/finance";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { LedgerSheetProvider } from "../../src/features/finance/state/ledger-sheet/ledger-sheet-provider.tsx";
import { makeLedger } from "../ledger-fixtures.ts";

// LedgerSheet is the ORCHESTRATOR for `/finance/ledger/$month`: it owns the read,
// the loading state, the error toast, and the hand-off of the resolved ledger into
// the sheet's Jotai session. So both of its collaborators are mocked to seams —
// the query object (`useLedger`) and `toast` — and the assertions are about the
// decisions it makes between them. The read itself is covered in use-ledger.test.tsx.
//
// `mock.module` is process-global and leaks forward to later files, so the REAL
// modules are captured up front and restored in `afterAll` — create-ledger-form.test.tsx
// renders against the real `toast`.
const HOOK_PATH = "../../src/features/finance/hooks/use-ledger";
const SONNER_PATH = "@nafios/ui/components/ui/sonner";
const realUseLedger = (await import(HOOK_PATH)).useLedger;
const realSonner = { ...(await import(SONNER_PATH)) };

type ToastOptions = {
  id?: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  closeButton?: boolean;
  duration?: number;
};
const toastError = mock((_message: string, _options?: ToastOptions) => "toast-1");

type FakeQuery = {
  isPending?: boolean;
  isError?: boolean;
  error?: unknown;
  data?: GetLedgerQueryResp;
  refetch?: () => void;
};
/** The query object the sheet reads — swapped per test before rendering. */
let query: FakeQuery;
let refetch: ReturnType<typeof mock>;

mock.module(HOOK_PATH, () => ({ useLedger: () => query }));
mock.module(SONNER_PATH, () => ({
  ...realSonner,
  toast: { ...realSonner.toast, error: toastError },
}));

// Imported AFTER the mocks are registered so the component binds to the stubs.
const { LedgerSheet } = await import("../../src/features/finance/components/ledger/index.tsx");

afterAll(() => {
  mock.module(HOOK_PATH, () => ({ useLedger: realUseLedger }));
  mock.module(SONNER_PATH, () => realSonner);
});

const JULY = monthOf("2026-07-01");

/** Render the sheet inside its client-state boundary, the way the route does. */
function renderSheet(month = JULY) {
  return render(
    <LedgerSheetProvider month={month}>
      <LedgerSheet ledgerMonth={month} />
    </LedgerSheetProvider>,
  );
}

/** Silence + capture the diagnostic console.error the error branch emits. */
let consoleError: ReturnType<typeof mock>;
const realConsoleError = console.error;

beforeEach(() => {
  refetch = mock(() => {});
  query = {
    isPending: false,
    isError: false,
    error: null,
    data: { ledger: makeLedger() },
    refetch,
  };
  toastError.mockClear();
  consoleError = mock((..._args: unknown[]) => {});
  console.error = consoleError as unknown as typeof console.error;
});

afterEach(() => {
  console.error = realConsoleError;
  cleanup();
});

describe("LedgerSheet — read states", () => {
  test("pending → the skeleton, and no session is started", () => {
    query = { isPending: true, refetch };
    const { container } = renderSheet();

    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    // The header bar is atom-driven, so "no session yet" shows up as no heading.
    expect(screen.queryByRole("heading")).toBeNull();
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  test("resolved → the header bar, driven by the ledger just put into session", async () => {
    renderSheet();

    // The month on screen comes from `data.ledger.month` via the atom — proof the
    // hand-off ran — not from the `ledgerMonth` prop the sheet was given.
    expect(await screen.findByRole("heading", { name: "July 2026" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(toastError).not.toHaveBeenCalled();
  });

  test("a month with no ledger resolves clean — no toast, no session, no skeleton", () => {
    // `{ ledger: null }` is the roll-forward gap: a NORMAL state, not an error.
    query = { isPending: false, isError: false, error: null, data: { ledger: null }, refetch };
    renderSheet();

    expect(toastError).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
    // Nothing is in session, so the bar renders nothing — the "not opened yet"
    // empty state is still to be built on this branch.
    expect(screen.queryByRole("heading")).toBeNull();
  });

  test("the resolved month drives the heading, not the requested one", async () => {
    query = {
      isPending: false,
      isError: false,
      error: null,
      data: { ledger: makeLedger({ month: monthOf("2026-12-01") }) },
      refetch,
    };
    renderSheet(monthOf("2026-12-01"));

    expect(await screen.findByRole("heading", { name: "December 2026" })).toBeTruthy();
  });
});

describe("LedgerSheet — error handling", () => {
  // The read failure the repository actually throws — an RLS denial classifies
  // as `unknown`, carrying the raw PostgrestError on `cause`.
  const pgError = {
    name: "PostgrestError",
    message: "permission denied for table monthly_ledger",
    details: "",
    hint: "",
    code: "42501",
  };
  const readFailed = new FinanceDataError("unknown", null, { ...pgError, toJSON: () => pgError });

  function failing() {
    query = { isPending: false, isError: true, error: readFailed, refetch };
  }

  test("holds the skeleton rather than swapping in an empty sheet", () => {
    failing();
    renderSheet();

    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByRole("heading")).toBeNull();
  });

  test("raises one toast: user-facing copy, with the diagnostics sent to the console", async () => {
    failing();
    renderSheet();

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    const [message, options] = toastError.mock.calls[0] as [string, ToastOptions];

    // Copy names the month in human form and never leaks the error code.
    expect(message).toBe("Couldn't load your July 2026 ledger");
    expect(message).not.toContain("permission denied");
    expect(options.description).toBe("Nothing was lost. Check your connection and try again.");
    // The FinanceDataError is diagnostics — console only.
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0]?.[1]).toBe(readFailed);
  });

  test("the toast is dismissible, persistent, and keyed per month so retries replace it", async () => {
    failing();
    renderSheet();

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    const options = (toastError.mock.calls[0] as [string, ToastOptions])[1];

    // A stable per-month id → a retry replaces this toast instead of stacking a
    // second one; `Infinity` → it does not vanish before the user can act on it.
    expect(options.id).toBe(`ledger-load-failed:${JULY}`);
    expect(options.duration).toBe(Number.POSITIVE_INFINITY);
    expect(options.closeButton).toBe(true);
  });

  test("the toast's Retry action re-runs the read", async () => {
    failing();
    renderSheet();

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    const options = (toastError.mock.calls[0] as [string, ToastOptions])[1];

    expect(options.action?.label).toBe("Retry");
    options.action?.onClick();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  test("isError with a null error is not toasted — the sheet needs something to log", () => {
    // Defensive: the guard is `isError && error !== null`, so this degenerate
    // state falls through to the loaded branch instead of toasting a blank cause.
    query = { isPending: false, isError: true, error: null, refetch };
    renderSheet();

    expect(toastError).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
