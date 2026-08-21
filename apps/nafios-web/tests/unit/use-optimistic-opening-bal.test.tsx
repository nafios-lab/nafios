import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Money, UpdateLedgerResult } from "@nafios/finance";
import * as finance from "@nafios/finance";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider, useAtomValue } from "jotai";
import type { ReactNode } from "react";
import {
  _ledgerInSession,
  _metrics_maxCapped,
  _metrics_openingBalance,
  _startLedgerSession,
} from "../../src/features/finance/state/ledger-sheet/ledger-sheet.atoms.ts";
import { makeLedger } from "../ledger-fixtures.ts";

// The WRITE half of the opening-balance metric, and the only place the optimistic
// contract is pinned. Three seams are mocked and nothing else: the finance browser
// client (so no Supabase env is built), `createLedgerCommands` (so the per-test
// result is the command's answer), and `toast` (so a rejection's copy is
// assertable). Everything in between — the paint, the rollback target, the
// overspend hand-off, the stale-row re-seed — is the hook's own logic under test.
//
// The invariant every test here circles: the atom is the PAINT and
// `_ledgerInSession.openingBalance` is the TRUTH. A rollback must land on the
// truth, never on whatever the input field happened to hold.
//
// `mock.module` is process-global and leaks forward, so all three seams are
// restored in `afterAll`.
const CLIENT_PATH = "../../src/features/finance/lib/finance-client";
const SONNER_PATH = "@nafios/ui/components/ui/sonner";
// Captured BEFORE the stubs go in. `getFinanceClient` memoizes its client, so a
// leaked stub does not merely mock the next suite's seam — it hands that suite a
// client with no query builder at all, and its reads hang to the timeout.
const realFinanceClientModule = { ...(await import(CLIENT_PATH)) };
const realSonner = { ...(await import(SONNER_PATH)) };

type ToastOptions = { id?: string; description?: string; closeButton?: boolean; duration?: number };
const toastError = mock((_message: string, _options?: ToastOptions) => "toast-1");

/** Per-test: what the stubbed command answers, and every call it received. */
let answer: (
  id: string,
  value: Money,
  ack?: boolean,
) => Promise<UpdateLedgerResult> | UpdateLedgerResult;
let calls: Array<{ id: string; value: Money; ack: boolean | undefined }>;

const updateOpeningBalance = (id: string, value: Money, ack?: boolean) => {
  calls.push({ id, value, ack });
  return Promise.resolve(answer(id, value, ack));
};

mock.module(CLIENT_PATH, () => ({ getFinanceClient: () => ({}) }));
mock.module(SONNER_PATH, () => ({
  ...realSonner,
  toast: { ...realSonner.toast, error: toastError },
}));
mock.module("@nafios/finance", () => ({
  ...finance,
  createLedgerCommands: () => ({ updateOpeningBalance }),
}));

// Imported AFTER the mocks are registered so the hook binds to the stubs.
const { useOptimisticOpeningBal } = await import(
  "../../src/features/finance/hooks/use-optimistic-opening-bal.ts"
);

afterAll(() => {
  mock.module("@nafios/finance", () => finance);
  mock.module(CLIENT_PATH, () => realFinanceClientModule);
  mock.module(SONNER_PATH, () => realSonner);
});

const { moneyFromCents, toCents } = finance;

/** The session's persisted figure — the rollback target every test measures against. */
const PERSISTED = 715235;
/** What the user typed. Below `maxCapped` ($5,000), so the guardrail is in play. */
const TYPED = moneyFromCents(123456);

/** Cents out of a nullable Money — `null` stays `null`, never 0. */
function cents(value: Money | null | undefined) {
  return value === null || value === undefined ? null : toCents(value);
}

let queryClient: QueryClient;

/** The hook driven inside one session store, the way `LedgerSheetProvider` scopes it. */
function renderUpdater({ seed = true }: { seed?: boolean } = {}) {
  const store = createStore();
  if (seed) store.set(_startLedgerSession, makeLedger());

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>{children}</Provider>
    </QueryClientProvider>
  );
  const { result } = renderHook(
    () => ({
      ...useOptimisticOpeningBal(),
      /** Read through a subscription so a store-side write re-renders the harness. */
      session: useAtomValue(_ledgerInSession),
    }),
    { wrapper },
  );
  return { store, result };
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  calls = [];
  answer = () => ({ ok: true, ledger: makeLedger({ openingBalance: TYPED }) });
  toastError.mockClear();
});
afterEach(cleanup);

describe("useOptimisticOpeningBal — the optimistic paint", () => {
  test("paints the new amount before the command answers", async () => {
    // `onMutate` runs synchronously inside `mutate`, so the figure moves in the
    // same tick the user committed — that IS the optimistic update.
    let deferred: (r: UpdateLedgerResult) => void = () => {};
    answer = () => new Promise<UpdateLedgerResult>((resolve) => (deferred = resolve));
    const { result, store } = renderUpdater();

    act(() => result.current.mutate({ value: TYPED, ack: false }));

    expect(cents(store.get(_metrics_openingBalance))).toBe(123456);
    // ...and the TRUTH has not moved: nothing is persisted yet.
    expect(cents(store.get(_ledgerInSession)?.openingBalance)).toBe(PERSISTED);

    await act(async () => {
      deferred({ ok: true, ledger: makeLedger({ openingBalance: TYPED }) });
    });
  });

  test("sends the ledger's id and the acknowledgement flag through unchanged", async () => {
    const { result } = renderUpdater();

    await act(async () => result.current.mutate({ value: TYPED, ack: false }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.id).toBe("led_july_2026");
    expect(cents(calls[0]?.value ?? null)).toBe(123456);
    expect(calls[0]?.ack).toBe(false);
  });

  test("no ledger in session → the mutation faults instead of writing blind", async () => {
    // The card gates on `baseLedger` before calling, so this is the belt to that
    // brace: a write with no target must never reach the command surface.
    const { result, store } = renderUpdater({ seed: false });

    await act(async () => result.current.mutate({ value: TYPED, ack: false }));

    await waitFor(() => expect(result.current.pendingAck).toBeNull());
    expect(calls).toHaveLength(0);
    // Nothing persisted, so the paint rolls back to the only truth there is: null.
    expect(store.get(_metrics_openingBalance)).toBeNull();
  });
});

describe("useOptimisticOpeningBal — a successful write", () => {
  test("replaces the session copy with the header AS WRITTEN, not the typed value", async () => {
    // The command reads the row back, so the server's figure wins — a DB-side
    // rounding or clamp would otherwise be invisible until the next full read.
    const written = makeLedger({ openingBalance: moneyFromCents(120000) });
    answer = () => ({ ok: true, ledger: written });
    const { result, store } = renderUpdater();

    await act(async () => result.current.mutate({ value: TYPED, ack: false }));

    await waitFor(() => expect(cents(store.get(_metrics_openingBalance))).toBe(120000));
    expect(store.get(_ledgerInSession)).toBe(written);
  });

  test("seeds the read's cache with the written header, so a remount agrees", async () => {
    // The sheet seeds its session ONCE (a ref), so the query cache is the only
    // thing a remount reads. Leaving it stale would resurrect the old figure.
    const written = makeLedger({ openingBalance: moneyFromCents(120000) });
    answer = () => ({ ok: true, ledger: written });
    const { result } = renderUpdater();

    await act(async () => result.current.mutate({ value: TYPED, ack: false }));

    await waitFor(() =>
      expect(queryClient.getQueryData<unknown>(["finance", "ledger", written.month])).toEqual({
        ledger: written,
      }),
    );
  });

  test("raises no toast and no dialog", async () => {
    const { result } = renderUpdater();

    await act(async () => result.current.mutate({ value: TYPED, ack: false }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(toastError).not.toHaveBeenCalled();
    expect(result.current.pendingAck).toBeNull();
  });
});

describe("useOptimisticOpeningBal — terminal rejections", () => {
  test("rolls the paint back to the PERSISTED figure, not to the typed one", async () => {
    answer = () => ({ ok: false, reason: "negative_amount" });
    const { result, store } = renderUpdater();

    await act(async () => result.current.mutate({ value: TYPED, ack: false }));

    await waitFor(() => expect(cents(store.get(_metrics_openingBalance))).toBe(PERSISTED));
    // Nothing was written, so the entity must be untouched too.
    expect(cents(store.get(_ledgerInSession)?.openingBalance)).toBe(PERSISTED);
  });

  test("raises the reason's copy as one persistent, keyed, dismissible toast", async () => {
    answer = () => ({ ok: false, reason: "exceeds_hard_cap" });
    const { result } = renderUpdater();

    await act(async () => result.current.mutate({ value: TYPED, ack: false }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    const [message, options] = toastError.mock.calls[0] as [string, ToastOptions];
    expect(message).toBe("That's too low for your current spending cap");
    // A stable per-reason id → a retry replaces the toast instead of stacking one.
    expect(options.id).toBe("opening-bal-rejected:exceeds_hard_cap");
    expect(options.closeButton).toBe(true);
    expect(options.duration).toBe(Infinity);
    expect(options.description).toContain("lower the cap first");
  });

  test("a guardrail rejection leaves the read's cache alone — our row is still right", async () => {
    const refetch = spyOn(queryClient, "fetchQuery");
    answer = () => ({ ok: false, reason: "negative_amount" });
    const { result } = renderUpdater();

    await act(async () => result.current.mutate({ value: TYPED, ack: false }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(refetch).not.toHaveBeenCalled();
    refetch.mockRestore();
  });

  test("a thrown DB fault rolls back too — the paint never survives a failure", async () => {
    // What the repository actually throws on a DB/RLS failure, as opposed to the
    // `{ ok: false }` rejections above: it lands in `onError`, not `onSuccess`.
    const pgError = {
      name: "PostgrestError",
      message: "permission denied for table monthly_ledger",
      details: "",
      hint: "",
      code: "42501",
    };
    answer = () => {
      throw new finance.FinanceDataError("unknown", null, {
        ...pgError,
        toJSON: () => pgError,
      });
    };
    const { result, store } = renderUpdater();

    await act(async () => result.current.mutate({ value: TYPED, ack: false }));

    await waitFor(() => expect(cents(store.get(_metrics_openingBalance))).toBe(PERSISTED));
  });
});

describe("useOptimisticOpeningBal — a stale row", () => {
  // `ledger_not_ongoing` / `ledger_not_found` mean the row we hold is wrong, not
  // that the input was. The sheet's seed-once ref will never re-seed for us, so
  // the hook has to refetch and re-seed the session by hand.

  test("refetches past the cache and re-seeds the whole session", async () => {
    const fresh = makeLedger({
      openingBalance: moneyFromCents(900000),
      maxCapped: moneyFromCents(400000),
    });
    const refetch = spyOn(queryClient, "fetchQuery").mockResolvedValue({ ledger: fresh });
    answer = () => ({ ok: false, reason: "ledger_not_ongoing" });
    const { result, store } = renderUpdater();

    await act(async () => result.current.mutate({ value: TYPED, ack: false }));

    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
    const options = refetch.mock.calls[0]?.[0] as { queryKey: unknown[]; staleTime: number };
    expect(options.queryKey).toEqual(["finance", "ledger", fresh.month]);
    // REQUIRED: the read's own options say `staleTime: Infinity`, under which
    // fetchQuery is a cache read and would hand back the very row that failed.
    expect(options.staleTime).toBe(0);

    await waitFor(() => expect(store.get(_ledgerInSession)).toBe(fresh));
    // A re-seed is the whole session, not just the one figure the user touched.
    expect(cents(store.get(_metrics_openingBalance))).toBe(900000);
    expect(cents(store.get(_metrics_maxCapped))).toBe(400000);
    refetch.mockRestore();
  });

  test("a month that resolves to no ledger leaves the rolled-back session standing", async () => {
    // The row is gone server-side. There is nothing to re-seed FROM, and blanking
    // the session would be worse than holding the last figure behind its toast.
    const refetch = spyOn(queryClient, "fetchQuery").mockResolvedValue({ ledger: null });
    answer = () => ({ ok: false, reason: "ledger_not_found" });
    const { result, store } = renderUpdater();

    await act(async () => result.current.mutate({ value: TYPED, ack: false }));

    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
    expect(cents(store.get(_metrics_openingBalance))).toBe(PERSISTED);
    expect(toastError).toHaveBeenCalledTimes(1);
    refetch.mockRestore();
  });
});

describe("useOptimisticOpeningBal — the overspend acknowledgement", () => {
  /** Drive a fresh hook up to the point where the dialog is open. */
  async function upToDialog() {
    answer = () => ({ ok: false, reason: "overspend_warning" });
    const harness = renderUpdater();
    await act(async () => harness.result.current.mutate({ value: TYPED, ack: false }));
    await waitFor(() => expect(harness.result.current.pendingAck).not.toBeNull());
    return harness;
  }

  test("raises the decision as state and KEEPS the paint on screen", async () => {
    const { result, store } = await upToDialog();

    // The dialog asks about the value the user is looking at, so rolling back here
    // would pull the figure out from under the question.
    expect(cents(store.get(_metrics_openingBalance))).toBe(123456);
    expect(cents(result.current.pendingAck?.value ?? null)).toBe(123456);
    expect(cents(result.current.pendingAck?.previous ?? null)).toBe(PERSISTED);
    // A decision, not a failure — no toast.
    expect(toastError).not.toHaveBeenCalled();
  });

  test("acknowledging retries the SAME amount with the flag set", async () => {
    const { result } = await upToDialog();
    answer = () => ({ ok: true, ledger: makeLedger({ openingBalance: TYPED }) });

    await act(async () => result.current.confirmOverspend());

    await waitFor(() => expect(calls).toHaveLength(2));
    // `pendingAck.value`, not the input — the user may have moved on from the
    // field while the dialog was open.
    expect(cents(calls[1]?.value ?? null)).toBe(123456);
    expect(calls[1]?.ack).toBe(true);
    expect(result.current.pendingAck).toBeNull();
  });

  test("a second acknowledgement in the same tick is swallowed — one retry only", async () => {
    // The claim is a ref precisely for this: `setPendingAck(null)` is invisible to
    // closures built in the current render, so a double-click would fire twice.
    const { result } = await upToDialog();
    answer = () => ({ ok: true, ledger: makeLedger({ openingBalance: TYPED }) });

    await act(async () => {
      result.current.confirmOverspend();
      result.current.confirmOverspend();
    });

    await waitFor(() => expect(result.current.pendingAck).toBeNull());
    expect(calls).toHaveLength(2);
  });

  test("declining rolls back to the persisted figure and writes nothing", async () => {
    const { result, store } = await upToDialog();

    await act(async () => result.current.declineOverspend());

    expect(cents(store.get(_metrics_openingBalance))).toBe(PERSISTED);
    expect(result.current.pendingAck).toBeNull();
    // The decline IS the end of it — no second round trip.
    expect(calls).toHaveLength(1);
  });

  test("a decline after the decision is spent is a no-op, not a second rollback", async () => {
    // `ConfirmDialog` promises at most one `onReject` per open cycle, but the
    // hook must not depend on that to stay correct.
    const { result, store } = await upToDialog();

    await act(async () => result.current.declineOverspend());
    act(() => store.set(_metrics_openingBalance, moneyFromCents(999999)));
    await act(async () => result.current.declineOverspend());

    expect(cents(store.get(_metrics_openingBalance))).toBe(999999);
  });

  test("a decline behind an acknowledgement cannot undo the retry", async () => {
    // The nightmare ordering: confirm, then the dialog's close reports a reject.
    // The claim is already spent, so the rollback never fires.
    const { result } = await upToDialog();
    answer = () => ({ ok: true, ledger: makeLedger({ openingBalance: TYPED }) });

    await act(async () => {
      result.current.confirmOverspend();
      result.current.declineOverspend();
    });

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.ack).toBe(true);
  });

  test("acknowledging with no decision pending does nothing", async () => {
    const { result } = renderUpdater();

    await act(async () => result.current.confirmOverspend());

    expect(calls).toHaveLength(0);
  });

  test("an acknowledged retry that still rejects rolls back and toasts", async () => {
    // Acknowledgement lifts amber and amber ONLY — a blocked value is still blocked.
    const { result, store } = await upToDialog();
    answer = () => ({ ok: false, reason: "exceeds_hard_cap" });

    await act(async () => result.current.confirmOverspend());

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(cents(store.get(_metrics_openingBalance))).toBe(PERSISTED);
  });
});

describe("useOptimisticOpeningBal — cancelling an in-flight edit", () => {
  test("restores the session figure from the persisted header", async () => {
    // The card calls this on blur: the field is abandoned, so whatever the user
    // typed into the atom has to give way to the truth again.
    const { result, store } = renderUpdater();
    act(() => result.current.setOpeningBalance(moneyFromCents(1)));

    act(() => result.current.cancelUpdate());

    expect(cents(store.get(_metrics_openingBalance))).toBe(PERSISTED);
  });

  test("is a no-op with no ledger in session — nothing to restore to", async () => {
    const { result, store } = renderUpdater({ seed: false });
    act(() => result.current.setOpeningBalance(moneyFromCents(1)));

    act(() => result.current.cancelUpdate());

    // Deliberately NOT blanked: with no truth to fall back on, the typed figure
    // is the only thing on screen and clearing it would just flicker.
    expect(cents(store.get(_metrics_openingBalance))).toBe(1);
  });

  test("exposes the session ledger as `baseLedger`, the card's own precondition", () => {
    const { result, store } = renderUpdater();

    expect(result.current.baseLedger).toBe(store.get(_ledgerInSession));
  });
});
