import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { monthOf } from "@nafios/datetime";
import { type FinanceClient, FinanceDataError, toCents } from "@nafios/finance";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode, useState } from "react";

// The single-ledger read, exercised against a FAKE finance browser client. The
// real `createLedgerQueries` + repository + mapper all run — only the SDK
// round-trip is stubbed — so `data.ledger` is a genuinely MAPPED `MonthlyLedger`
// (Money/Month codecs included) rather than a hand-written object.
//
// The seam is the app's `getFinanceClient`, NOT `@nafios/finance`'s
// `createBrowserClient` (the seam use-finance-home-state.test.tsx uses): that
// singleton is memoized process-wide, so two suites stubbing the SDK factory
// would share whichever fake happened to build the client first. Stubbing the
// accessor keeps this suite's client its own. `mock.module` is process-global and
// leaks forward, so the real module is captured up front and restored in `afterAll`.
const CLIENT_PATH = "../../src/features/finance/lib/finance-client";
const realFinanceClientModule = { ...(await import(CLIENT_PATH)) };

type QueryResult = { data: unknown; error: unknown };

/** The row (or error) the fake client resolves to — swapped per test. Read at
 *  await-time, so one client instance serves every case. */
let nextResult: QueryResult = { data: null, error: null };
/** Every `.eq(column, value)` the read chains, so the month filter is assertable. */
let filters: Array<[string, unknown]> = [];

/** A supabase-js-shaped, thenable builder — the shared repo-test idiom.
 *  `findByMonth` chains `from().select().eq().eq().maybeSingle()`. */
function fakeBrowserClient() {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "order", "maybeSingle", "single", "insert", "update", "delete"]) {
    builder[m] = () => builder;
  }
  builder.eq = (column: string, value: unknown) => {
    filters.push([column, value]);
    return builder;
  };
  // biome-ignore lint/suspicious/noThenProperty: deliberate query-builder stub
  builder.then = (resolve: (v: QueryResult) => void) => resolve(nextResult);
  return { from: () => builder, rpc: () => builder } as unknown as FinanceClient;
}

const fakeClient = fakeBrowserClient();

mock.module(CLIENT_PATH, () => ({ getFinanceClient: () => fakeClient }));

// Imported AFTER the mock is registered so the hook's queryFn reaches the stub.
const { useLedger } = await import("../../src/features/finance/hooks/use-ledger");

afterAll(() => {
  mock.module(CLIENT_PATH, () => realFinanceClientModule);
});

/** A monthly_ledger row (numeric columns arrive as strings from the SDK). */
function ledgerRow(month: string) {
  return {
    id: `id-${month}`,
    month,
    opening_balance: "7152.35",
    max_capped: "5000.00",
    status: "ongoing",
    created_at: "2026-07-01T08:00:00.000Z",
    settled_at: null,
  };
}

/** Fresh QueryClient per renderHook (pinned via useState so a wrapper re-render
 *  never discards the in-flight query) → no cache leaks across tests. */
function Wrapper({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  nextResult = { data: null, error: null };
  filters = [];
});
afterEach(cleanup);

describe("useLedger", () => {
  test("resolves the month's ledger, mapped to the domain shape", async () => {
    nextResult = { data: ledgerRow("2026-07-01"), error: null };
    const { result } = renderHook(() => useLedger(monthOf("2026-07-01")), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const ledger = result.current.data?.ledger;
    expect(ledger?.id).toBe("id-2026-07-01");
    expect(ledger?.month).toBe(monthOf("2026-07-01"));
    // Mapped through the Money codec, not passed through as the SDK's string.
    expect(toCents(ledger?.openingBalance as never)).toBe(715235);
    expect(ledger?.status).toBe("ongoing");
  });

  test("reads by MONTH — the month is the filter, no id round-trip", async () => {
    nextResult = { data: ledgerRow("2026-07-01"), error: null };
    const { result } = renderHook(() => useLedger(monthOf("2026-07-01")), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // `(user_id, month)` is the natural key, so the route's own param resolves the
    // page. A regression to an id lookup would drop the month filter entirely.
    expect(filters.some(([column]) => column === "month")).toBe(true);
  });

  test("a month the user never opened is `{ ledger: null }` — success, not an error", async () => {
    // The roll-forward gap: `maybeSingle()` finds no row.
    nextResult = { data: null, error: null };
    const { result } = renderHook(() => useLedger(monthOf("2026-09-01")), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.ledger).toBeNull();
    expect(result.current.isError).toBe(false);
  });

  test("each month caches independently — the key carries the month", async () => {
    // One client across both renders: if `month` were missing from `queryKey`,
    // the second read would serve July's cached entry instead of fetching August.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function SharedWrapper({ children }: { children: ReactNode }) {
      return createElement(QueryClientProvider, { client: queryClient }, children);
    }

    nextResult = { data: ledgerRow("2026-07-01"), error: null };
    const july = renderHook(() => useLedger(monthOf("2026-07-01")), { wrapper: SharedWrapper });
    await waitFor(() => expect(july.result.current.isSuccess).toBe(true));

    nextResult = { data: ledgerRow("2026-08-01"), error: null };
    const august = renderHook(() => useLedger(monthOf("2026-08-01")), { wrapper: SharedWrapper });
    await waitFor(() => expect(august.result.current.isSuccess).toBe(true));

    expect(august.result.current.data?.ledger?.month).toBe(monthOf("2026-08-01"));
    // July's entry is untouched — no stale-sibling read in either direction.
    expect(queryClient.getQueryData(["finance", "ledger", monthOf("2026-07-01")])).toBeDefined();
  });

  test("a repository read failure surfaces isError with a FinanceDataError", async () => {
    nextResult = {
      data: null,
      error: { name: "PostgrestError", message: "denied", details: "", hint: "", code: "42501" },
    };
    const { result } = renderHook(() => useLedger(monthOf("2026-07-01")), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(FinanceDataError);
  });
});
