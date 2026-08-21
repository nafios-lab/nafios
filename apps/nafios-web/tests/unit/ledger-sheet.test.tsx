import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { monthOf } from "@nafios/datetime";
import { FinanceDataError, type GetLedgerQueryResp, moneyFromCents } from "@nafios/finance";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
const realLedgerHooks = { ...(await import(HOOK_PATH)) };
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

// Only `useLedger` is stubbed: `ledgerQueryOptions` lives in the same module and
// the metric strip's write hook imports it, so replacing the whole module would
// hand that hook an `undefined`.
mock.module(HOOK_PATH, () => ({ ...realLedgerHooks, useLedger: () => query }));
mock.module(SONNER_PATH, () => ({
  ...realSonner,
  toast: { ...realSonner.toast, error: toastError },
}));

// Imported AFTER the mocks are registered so the component binds to the stubs.
const { LedgerSheet } = await import("../../src/features/finance/components/ledger/index.tsx");

afterAll(() => {
  mock.module(HOOK_PATH, () => realLedgerHooks);
  mock.module(SONNER_PATH, () => realSonner);
});

const JULY = monthOf("2026-07-01");

/** Render the sheet inside its client-state boundary, the way the route does.
 *  `useLedger` is stubbed out, but the summary strip's opening-balance card now
 *  owns a mutation of its own, so the tree still needs a real QueryClient — the
 *  route gets it from the router's Wrap. */
function renderSheet(month = JULY) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LedgerSheetProvider month={month}>
        <LedgerSheet ledgerMonth={month} />
      </LedgerSheetProvider>
    </QueryClientProvider>,
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

describe("LedgerSheet — composition off one session", () => {
  // The sheet renders the bar and the status banner as SIBLINGS, both reading the
  // same atom. These are the tests that catch a child being dropped from the tree
  // or wired to the seed query instead of the working copy (ADR-0030 rule 5):
  // one resolved ledger must produce one internally-consistent header.

  test("an ongoing ledger: badged ON-GOING, with no status banner", async () => {
    query = {
      isPending: false,
      isError: false,
      error: null,
      data: { ledger: makeLedger({ status: "ongoing" }) },
      refetch,
    };
    renderSheet();

    expect(await screen.findByText("ON-GOING")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("a reconciling ledger: the banner appears and the ON-GOING pill does not", async () => {
    // The pair that must never disagree — a banner saying "reconciling" beside a
    // pill saying "ON-GOING" is the exact contradiction a shared session prevents.
    query = {
      isPending: false,
      isError: false,
      error: null,
      data: { ledger: makeLedger({ status: "reconciling" }) },
      refetch,
    };
    renderSheet();

    expect(await screen.findByText("This ledger is in reconciliation")).toBeTruthy();
    expect(screen.queryByText("ON-GOING")).toBeNull();
    // Still fully navigable: the heading is not collateral of a non-ongoing month.
    expect(screen.getByRole("heading", { name: "July 2026" })).toBeTruthy();
  });

  test("a settled ledger: the settled banner, no pill", async () => {
    query = {
      isPending: false,
      isError: false,
      error: null,
      data: {
        ledger: makeLedger({ status: "settled", settledAt: "2026-08-01T09:15:00.000Z" }),
      },
      refetch,
    };
    renderSheet();

    expect(await screen.findByText(/This ledger is settled as of/)).toBeTruthy();
    expect(screen.queryByText("ON-GOING")).toBeNull();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  test("pending → neither child renders, so no banner flashes before the read lands", () => {
    query = { isPending: true, refetch };
    renderSheet();

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("ON-GOING")).toBeNull();
  });

  test("a month with no ledger renders no banner either", () => {
    query = { isPending: false, isError: false, error: null, data: { ledger: null }, refetch };
    renderSheet();

    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("the resolved sheet carries the summary strip beside the bar", async () => {
    // The strip is atom-driven, so it renders a figure only if the SAME session
    // hand-off that fed the header bar also seeded the metrics. One assertion
    // therefore covers both: the child is in the tree, and it is reading the
    // session rather than a prop the sheet never passes it.
    renderSheet();

    await screen.findByRole("heading", { name: "July 2026" });
    expect(screen.getByText("OPENING BAL")).toBeTruthy();
    // The fixture's opening balance ($7,152.35), straight off the resolved ledger.
    expect(screen.getByText("$7,152.35")).toBeTruthy();
  });

  test("a month with no ledger renders an empty strip, not a $0.00 card", async () => {
    // Nothing was read, so the metrics stay null and the strip stays blank —
    // the same "not opened yet" branch the header bar takes.
    query = { isPending: false, isError: false, error: null, data: { ledger: null }, refetch };
    const { container } = renderSheet();

    expect(container.querySelector(".grid-cols-5")?.children).toHaveLength(0);
    expect(screen.queryByText("OPENING BAL")).toBeNull();
  });

  test("seeds the session ONCE — a later read cannot clobber an in-flight edit", async () => {
    // The seed is guarded by a ref, not by a dependency comparison. That guard is
    // what makes the session authoritative: a background refetch (or a re-seed
    // after any write) must not reach in and reset the working copy the user is
    // editing. Proven by handing the mounted sheet a DIFFERENT ledger and finding
    // the strip unmoved — every child reads the session, so nothing else could.
    query = {
      isPending: false,
      isError: false,
      error: null,
      data: { ledger: makeLedger() },
      refetch,
    };
    const { rerender } = renderSheet();
    expect(await screen.findByText("$7,152.35")).toBeTruthy();

    query = {
      isPending: false,
      isError: false,
      error: null,
      data: { ledger: makeLedger({ openingBalance: moneyFromCents(900000) }) },
      refetch,
    };
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <LedgerSheetProvider month={JULY}>
          <LedgerSheet ledgerMonth={JULY} />
        </LedgerSheetProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText("$7,152.35")).toBeTruthy());
    expect(screen.queryByText("$9,000.00")).toBeNull();
  });

  test("the seed still lands on the FIRST read to resolve, after a pending render", async () => {
    // The ref must not be tripped by the pending pass — the guard is "already
    // seeded", not "already rendered".
    query = { isPending: true, refetch };
    const { rerender } = renderSheet();
    expect(screen.queryByText("OPENING BAL")).toBeNull();

    query = {
      isPending: false,
      isError: false,
      error: null,
      data: { ledger: makeLedger() },
      refetch,
    };
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <LedgerSheetProvider month={JULY}>
          <LedgerSheet ledgerMonth={JULY} />
        </LedgerSheetProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("$7,152.35")).toBeTruthy();
  });

  test("pending → no summary strip; the skeleton owns that space instead", () => {
    query = { isPending: true, refetch };
    const { container } = renderSheet();

    // Both trees draw a five-column strip, so "is it the skeleton's?" is the real
    // question: the loaded cards never pulse.
    for (const card of container.querySelectorAll(".grid-cols-5 > *")) {
      expect(card.querySelector(".animate-pulse")).not.toBeNull();
    }
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
