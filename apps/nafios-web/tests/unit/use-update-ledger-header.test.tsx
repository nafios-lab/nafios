import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Money, MonthlyLedger, UpdateLedgerResult } from "@nafios/finance";
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

// The WRITE half of every ledger-header money card, and the only place the
// optimistic contract is pinned. `useUpdateLedgerHeader` is field-PARAMETERIC —
// one hook drives both `openingBalance` and `maxCapped` — so the whole contract is
// run twice, once per field, from a single table. A behaviour that only holds for
// the field the hook was originally written for (opening balance) fails here.
//
// Three seams are mocked and nothing else: the finance browser client (so no
// Supabase env is built), `createLedgerCommands` (so the per-test result is the
// command's answer), and `toast` (so a rejection's copy is assertable). Everything
// in between — the paint, the rollback target, the overspend hand-off, the
// stale-row re-seed — is the hook's own logic under test.
//
// The invariant every test here circles: the atom is the PAINT and
// `_ledgerInSession[field]` is the TRUTH. A rollback must land on the truth, never
// on whatever the input field happened to hold.
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
const toastDismiss = mock((_id?: string | number) => undefined);

/** Per-test: what the stubbed command answers. */
let answer: (
  ledger: MonthlyLedger,
  ack?: boolean,
) => Promise<UpdateLedgerResult> | UpdateLedgerResult;
/** Every call the command received. The WHOLE row is kept: `updateLedger` takes the
 *  full header, so a test asserts both the edited field and the sibling riding
 *  along untouched. */
let calls: Array<{ ledger: MonthlyLedger; ack: boolean | undefined }>;

const updateLedger = (ledger: MonthlyLedger, ack?: boolean) => {
  calls.push({ ledger, ack });
  return Promise.resolve(answer(ledger, ack));
};

mock.module(CLIENT_PATH, () => ({ getFinanceClient: () => ({}) }));
mock.module(SONNER_PATH, () => ({
  ...realSonner,
  toast: { ...realSonner.toast, error: toastError, dismiss: toastDismiss },
}));
mock.module("@nafios/finance", () => ({
  ...finance,
  createLedgerCommands: () => ({ updateLedger }),
}));

// Imported AFTER the mocks are registered so the hook binds to the stubs.
const { useUpdateLedgerHeader } = await import(
  "../../src/features/finance/hooks/use-update-ledger-header.tsx"
);

afterAll(() => {
  mock.module("@nafios/finance", () => finance);
  mock.module(CLIENT_PATH, () => realFinanceClientModule);
  mock.module(SONNER_PATH, () => realSonner);
});

const { moneyFromCents, toCents } = finance;

/** What the user typed. Below the fixture's `maxCapped` ($5,000), so the overspend
 *  guardrail is in play for either field. */
const TYPED = moneyFromCents(123456);

/** Cents out of a nullable Money — `null` stays `null`, never 0. */
function cents(value: Money | null | undefined) {
  return value === null || value === undefined ? null : toCents(value);
}

/**
 * The two header fields the hook serves, each with the atom it paints and the
 * fixture's PERSISTED figure for it — the rollback target every test measures
 * against. Adding a third field to `FIELDS_ATOMS` should add a row here.
 */
const FIELDS = [
  {
    field: "openingBalance" as const,
    atom: _metrics_openingBalance,
    siblingAtom: _metrics_maxCapped,
    persisted: 715235,
    /** The sibling's persisted figure, which every write must forward untouched. */
    siblingPersisted: 500000,
  },
  {
    field: "maxCapped" as const,
    atom: _metrics_maxCapped,
    siblingAtom: _metrics_openingBalance,
    persisted: 500000,
    siblingPersisted: 715235,
  },
];

let queryClient: QueryClient;

/** The hook driven inside one session store, the way `LedgerSheetProvider` scopes it. */
function renderUpdater(
  field: "openingBalance" | "maxCapped",
  { seed = true }: { seed?: boolean } = {},
) {
  const store = createStore();
  if (seed) store.set(_startLedgerSession, makeLedger());

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>{children}</Provider>
    </QueryClientProvider>
  );
  const { result } = renderHook(
    () => ({
      ...useUpdateLedgerHeader({ field }),
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
  answer = (ledger) => ({ ok: true, ledger });
  toastError.mockClear();
  toastDismiss.mockClear();
});
afterEach(cleanup);

describe.each(FIELDS)("useUpdateLedgerHeader($field) — the optimistic paint", ({
  field,
  atom,
  persisted,
}) => {
  test("paints the new amount before the command answers", async () => {
    // `onMutate` runs synchronously inside `mutate`, so the figure moves in the
    // same tick the user committed — that IS the optimistic update.
    let deferred: (r: UpdateLedgerResult) => void = () => {};
    answer = () => new Promise<UpdateLedgerResult>((resolve) => (deferred = resolve));
    const { result, store } = renderUpdater(field);

    act(() => result.current.mutate({ value: TYPED, ack: false }));

    expect(cents(store.get(atom))).toBe(123456);
    // ...and the TRUTH has not moved: nothing is persisted yet.
    expect(cents(store.get(_ledgerInSession)?.[field])).toBe(persisted);

    await act(async () => {
      deferred({ ok: true, ledger: makeLedger({ [field]: TYPED }) });
    });
  });

  test("writes the typed amount into THIS field only, leaving its sibling alone", async () => {
    // The generalization's central risk: one hook, two fields, one `updateLedger`
    // that takes the whole row. Overriding the wrong key would silently edit the
    // card the user was not touching.
    const { result } = renderUpdater(field);

    await act(async () => result.current.mutate({ value: TYPED, ack: false }));

    await waitFor(() => expect(calls).toHaveLength(1));
    const sent = calls[0]?.ledger as MonthlyLedger;
    expect(sent.id).toBe("led_july_2026");
    expect(cents(sent[field])).toBe(123456);
    expect(calls[0]?.ack).toBe(false);
    // The rest of the session row rides along untouched — `updateLedger` judges
    // the PAIR, so a forwarded-but-stale sibling would change the verdict.
    const sibling = field === "openingBalance" ? "maxCapped" : "openingBalance";
    expect(cents(sent[sibling])).toBe(toCents(makeLedger()[sibling]));
    expect(sent.status).toBe("ongoing");
  });

  test("no ledger in session → the mutation faults instead of writing blind", async () => {
    // The card gates on `baseLedger` before calling, so this is the belt to that
    // brace: a write with no target must never reach the command surface.
    const { result, store } = renderUpdater(field, { seed: false });

    await act(async () => result.current.mutate({ value: TYPED, ack: false }));

    await waitFor(() => expect(result.current.pendingAck).toBeNull());
    expect(calls).toHaveLength(0);
    // Nothing persisted, so the paint rolls back to the only truth there is: null.
    expect(store.get(atom)).toBeNull();
  });
});

describe.each(FIELDS)("useUpdateLedgerHeader($field) — a successful write", ({
  field,
  atom,
  siblingAtom,
}) => {
  test("replaces the session copy with the header AS WRITTEN, not the typed value", async () => {
    // The command reads the row back, so the server's figure wins — a DB-side
    // rounding or clamp would otherwise be invisible until the next full read.
    const written = makeLedger({ [field]: moneyFromCents(120000) });
    answer = () => ({ ok: true, ledger: written });
    const { result, store } = renderUpdater(field);

    await act(async () => result.current.mutate({ value: TYPED, ack: false }));

    await waitFor(() => expect(cents(store.get(atom))).toBe(120000));
    expect(store.get(_ledgerInSession)).toBe(written);
  });

  test("repaints only this field's atom — the sibling card is left as it was", async () => {
    // `onSuccess` re-seats `_ledgerInSession` but sets only `FIELDS_ATOMS[field]`.
    // Pinned so a future "just re-seed everything" shortcut has to be deliberate:
    // it would blow away an in-progress edit on the other card.
    const written = makeLedger({ [field]: moneyFromCents(120000) });
    answer = () => ({ ok: true, ledger: written });
    const { result, store } = renderUpdater(field);
    const midEdit = moneyFromCents(999999);
    act(() => store.set(siblingAtom, midEdit));

    await act(async () => result.current.mutate({ value: TYPED, ack: false }));

    await waitFor(() => expect(cents(store.get(atom))).toBe(120000));
    expect(cents(store.get(siblingAtom))).toBe(999999);
  });

  test("seeds the read's cache with the written header, so a remount agrees", async () => {
    // The sheet seeds its session ONCE (a ref), so the query cache is the only
    // thing a remount reads. Leaving it stale would resurrect the old figure.
    const written = makeLedger({ [field]: moneyFromCents(120000) });
    answer = () => ({ ok: true, ledger: written });
    const { result } = renderUpdater(field);

    await act(async () => result.current.mutate({ value: TYPED, ack: false }));

    await waitFor(() =>
      expect(queryClient.getQueryData<unknown>(["finance", "ledger", written.month])).toEqual({
        ledger: written,
      }),
    );
  });

  test("raises no toast and no dialog", async () => {
    const { result } = renderUpdater(field);

    await act(async () => result.current.mutate({ value: TYPED, ack: false }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(toastError).not.toHaveBeenCalled();
    expect(result.current.pendingAck).toBeNull();
  });
});

describe.each(FIELDS)("useUpdateLedgerHeader($field) — terminal rejections", ({
  field,
  atom,
  persisted,
}) => {
  test("rolls the paint back to the PERSISTED figure, not to the typed one", async () => {
    answer = () => ({ ok: false, reason: "negative_amount" });
    const { result, store } = renderUpdater(field);

    await act(async () => result.current.mutate({ value: TYPED, ack: false }));

    await waitFor(() => expect(cents(store.get(atom))).toBe(persisted));
    // Nothing was written, so the entity must be untouched too.
    expect(cents(store.get(_ledgerInSession)?.[field])).toBe(persisted);
  });

  test("raises the reason's copy as one persistent, keyed, dismissible toast", async () => {
    answer = () => ({ ok: false, reason: "exceeds_hard_cap" });
    const { result } = renderUpdater(field);

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
    const { result } = renderUpdater(field);

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
    const { result, store } = renderUpdater(field);

    await act(async () => result.current.mutate({ value: TYPED, ack: false }));

    await waitFor(() => expect(cents(store.get(atom))).toBe(persisted));
  });
});

describe.each(FIELDS)("useUpdateLedgerHeader($field) — a stale row", ({
  field,
  persisted,
  atom,
}) => {
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
    const { result, store } = renderUpdater(field);

    await act(async () => result.current.mutate({ value: TYPED, ack: false }));

    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
    const options = refetch.mock.calls[0]?.[0] as { queryKey: unknown[]; staleTime: number };
    expect(options.queryKey).toEqual(["finance", "ledger", fresh.month]);
    // REQUIRED: the read's own options say `staleTime: Infinity`, under which
    // fetchQuery is a cache read and would hand back the very row that failed.
    expect(options.staleTime).toBe(0);

    await waitFor(() => expect(store.get(_ledgerInSession)).toBe(fresh));
    // A re-seed is the whole session, not just the one figure the user touched —
    // which is exactly why it is safe to run from either card.
    expect(cents(store.get(_metrics_openingBalance))).toBe(900000);
    expect(cents(store.get(_metrics_maxCapped))).toBe(400000);
    refetch.mockRestore();
  });

  test("a month that resolves to no ledger leaves the rolled-back session standing", async () => {
    // The row is gone server-side. There is nothing to re-seed FROM, and blanking
    // the session would be worse than holding the last figure behind its toast.
    const refetch = spyOn(queryClient, "fetchQuery").mockResolvedValue({ ledger: null });
    answer = () => ({ ok: false, reason: "ledger_not_found" });
    const { result, store } = renderUpdater(field);

    await act(async () => result.current.mutate({ value: TYPED, ack: false }));

    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
    expect(cents(store.get(atom))).toBe(persisted);
    expect(toastError).toHaveBeenCalledTimes(1);
    refetch.mockRestore();
  });
});

describe.each(FIELDS)("useUpdateLedgerHeader($field) — the overspend acknowledgement", ({
  field,
  atom,
  persisted,
}) => {
  /** Drive a fresh hook up to the point where the dialog is open. */
  async function upToDialog() {
    answer = () => ({ ok: false, reason: "overspend_warning" });
    const harness = renderUpdater(field);
    await act(async () => harness.result.current.mutate({ value: TYPED, ack: false }));
    await waitFor(() => expect(harness.result.current.pendingAck).not.toBeNull());
    return harness;
  }

  test("raises the decision as state and KEEPS the paint on screen", async () => {
    const { result, store } = await upToDialog();

    // The dialog asks about the value the user is looking at, so rolling back here
    // would pull the figure out from under the question.
    expect(cents(store.get(atom))).toBe(123456);
    expect(cents(result.current.pendingAck?.value ?? null)).toBe(123456);
    expect(cents(result.current.pendingAck?.previous ?? null)).toBe(persisted);
    // A decision, not a failure — no toast.
    expect(toastError).not.toHaveBeenCalled();
  });

  test("acknowledging retries the SAME amount with the flag set", async () => {
    const { result } = await upToDialog();
    answer = (ledger) => ({ ok: true, ledger });

    await act(async () => result.current.confirmAck());

    await waitFor(() => expect(calls).toHaveLength(2));
    // `pendingAck.value`, not the input — the user may have moved on from the
    // field while the dialog was open.
    expect(cents(calls[1]?.ledger[field] ?? null)).toBe(123456);
    expect(calls[1]?.ack).toBe(true);
    expect(result.current.pendingAck).toBeNull();
  });

  test("a second acknowledgement in the same tick is swallowed — one retry only", async () => {
    // The claim is a ref precisely for this: `setPendingAck(null)` is invisible to
    // closures built in the current render, so a double-click would fire twice.
    const { result } = await upToDialog();
    answer = (ledger) => ({ ok: true, ledger });

    await act(async () => {
      result.current.confirmAck();
      result.current.confirmAck();
    });

    await waitFor(() => expect(result.current.pendingAck).toBeNull());
    expect(calls).toHaveLength(2);
  });

  test("declining rolls back to the persisted figure and writes nothing", async () => {
    const { result, store } = await upToDialog();

    await act(async () => result.current.declineAck());

    expect(cents(store.get(atom))).toBe(persisted);
    expect(result.current.pendingAck).toBeNull();
    // The decline IS the end of it — no second round trip.
    expect(calls).toHaveLength(1);
  });

  test("a decline after the decision is spent is a no-op, not a second rollback", async () => {
    // `ConfirmDialog` promises at most one `onReject` per open cycle, but the hook
    // must not depend on that to stay correct.
    const { result, store } = await upToDialog();

    await act(async () => result.current.declineAck());
    act(() => store.set(atom, moneyFromCents(999999)));
    await act(async () => result.current.declineAck());

    expect(cents(store.get(atom))).toBe(999999);
  });

  test("a decline behind an acknowledgement cannot undo the retry", async () => {
    // The nightmare ordering: confirm, then the dialog's close reports a reject.
    // The claim is already spent, so the rollback never fires.
    const { result } = await upToDialog();
    answer = (ledger) => ({ ok: true, ledger });

    await act(async () => {
      result.current.confirmAck();
      result.current.declineAck();
    });

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.ack).toBe(true);
  });

  test("acknowledging with no decision pending does nothing", async () => {
    const { result } = renderUpdater(field);

    await act(async () => result.current.confirmAck());

    expect(calls).toHaveLength(0);
  });

  test("an acknowledged retry that still rejects rolls back and toasts", async () => {
    // Acknowledgement lifts amber and amber ONLY — a blocked value is still blocked.
    const { result, store } = await upToDialog();
    answer = () => ({ ok: false, reason: "exceeds_hard_cap" });

    await act(async () => result.current.confirmAck());

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(cents(store.get(atom))).toBe(persisted);
  });
});

describe.each(FIELDS)("useUpdateLedgerHeader($field) — cancelling an in-flight edit", ({
  field,
  atom,
  persisted,
}) => {
  test("restores the session figure from the persisted header", async () => {
    // The card calls this on blur: the field is abandoned, so whatever the user
    // typed into the atom has to give way to the truth again.
    const { result, store } = renderUpdater(field);
    act(() => result.current.setFieldValue(moneyFromCents(1)));

    act(() => result.current.cancelUpdate());

    expect(cents(store.get(atom))).toBe(persisted);
  });

  test("is a no-op with no ledger in session — nothing to restore to", async () => {
    const { result, store } = renderUpdater(field, { seed: false });
    act(() => result.current.setFieldValue(moneyFromCents(1)));

    act(() => result.current.cancelUpdate());

    // Deliberately NOT blanked: with no truth to fall back on, the typed figure is
    // the only thing on screen and clearing it would just flicker.
    expect(cents(store.get(atom))).toBe(1);
  });

  test("exposes the session ledger as `baseLedger`, the card's own precondition", () => {
    const { result, store } = renderUpdater(field);

    expect(result.current.baseLedger).toBe(store.get(_ledgerInSession));
  });

  test("`fieldValue` mirrors THIS field's atom, not the sibling's", () => {
    // The one-line difference between the two cards, and the thing that would make
    // both of them show the same number if `FIELDS_ATOMS` were misread.
    const { result, store } = renderUpdater(field);

    act(() => store.set(atom, moneyFromCents(4242)));

    expect(cents(result.current.fieldValue)).toBe(4242);
  });
});

describe("useUpdateLedgerHeader — the shared rejection toast", () => {
  // The dismissal is CROSS-CARD by design: the module-scope toast id means fixing
  // the opening balance is what clears an `exceeds_hard_cap` complaint the
  // max-capped card raised. That coupling is the whole point, so it is pinned here
  // rather than inside either field's block.

  test("a successful write dismisses the rejection toast still on screen", async () => {
    answer = () => ({ ok: false, reason: "exceeds_hard_cap" });
    const { result } = renderUpdater("maxCapped");
    await act(async () => result.current.mutate({ value: TYPED, ack: false }));
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));

    answer = (ledger) => ({ ok: true, ledger });
    await act(async () => result.current.mutate({ value: TYPED, ack: false }));

    // `duration: Infinity` means nothing else would ever take it down.
    await waitFor(() => expect(toastDismiss).toHaveBeenCalledWith("toast-1"));
  });

  test("the other card's success clears it too — the id is module-scoped", async () => {
    answer = () => ({ ok: false, reason: "exceeds_hard_cap" });
    const capped = renderUpdater("maxCapped");
    await act(async () => capped.result.current.mutate({ value: TYPED, ack: false }));
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));

    // `exceeds_hard_cap` is the cap-vs-balance PAIR failing, so raising the opening
    // balance is a legitimate way to answer a complaint the cap card raised.
    answer = (ledger) => ({ ok: true, ledger });
    const balance = renderUpdater("openingBalance");
    await act(async () => balance.result.current.mutate({ value: TYPED, ack: false }));

    await waitFor(() => expect(toastDismiss).toHaveBeenCalledWith("toast-1"));
  });
});
