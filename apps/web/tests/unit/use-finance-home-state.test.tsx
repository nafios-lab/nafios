import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as financeReal from "@nafios/finance";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode, useState } from "react";

// The finance-home read hook, exercised against a FAKE finance browser client.
//
// We partial-mock `@nafios/finance`: spread the REAL barrel (so `monthOf`,
// `FinanceHomeState`, and the real `createLedgerQueries` + resolver all still run
// — mock.module is process-global, so other suites keep the real exports) and
// override ONLY `createBrowserClient` to return a list-capable thenable builder.
// The real `getFinanceClient()` → `createLedgerQueries(...).getFinanceHomeState()`
// path runs end-to-end; only the SDK round-trip is stubbed. (tests/setup.ts's
// `asDb` passthrough still applies — the real barrel links it.)

type QueryResult = { data: unknown; error: unknown };

// The result the fake browser client resolves to — swapped per test. Read at
// await-time, so the memoized `getFinanceClient()` singleton stays correct.
let nextResult: QueryResult = { data: [], error: null };

/** A supabase-js-shaped, thenable builder — the shared repo-test idiom. */
function fakeBrowserClient() {
  const builder: Record<string, unknown> = {};
  for (const m of [
    "select",
    "order",
    "eq",
    "maybeSingle",
    "single",
    "insert",
    "update",
    "delete",
  ]) {
    builder[m] = () => builder;
  }
  // biome-ignore lint/suspicious/noThenProperty: deliberate query-builder stub
  builder.then = (resolve: (v: QueryResult) => void) => resolve(nextResult);
  return { from: () => builder };
}

mock.module("@nafios/finance", () => ({
  ...financeReal,
  createBrowserClient: () => fakeBrowserClient(),
}));

// Imported AFTER the mock is registered; the hook constructs the client lazily
// (at queryFn time), so the stubbed `createBrowserClient` is what it reaches.
const { useFinanceHomeState } = await import(
  "../../src/features/finance/hooks/use-finance-home-state"
);

/** A monthly_ledger row (numeric columns arrive as strings from the SDK). */
function ledgerRow(month: string, status: "ongoing" | "reconciling" | "settled") {
  return {
    id: `id-${month}`,
    month,
    opening_balance: "1000.00",
    max_capped: "1500.00",
    status,
    created_at: "2026-07-01T08:00:00.000Z",
    settled_at: status === "settled" ? "2026-07-31T00:00:00.000Z" : null,
  };
}

/** Fresh QueryClient per renderHook call (pinned via useState so a wrapper
 *  re-render never discards the in-flight query) → today-keyed cache never leaks
 *  across tests. */
function Wrapper({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  nextResult = { data: [], error: null };
});
afterEach(cleanup);

describe("useFinanceHomeState", () => {
  test("no ledgers → success with hasActiveLedger false and a resolved month pair", async () => {
    nextResult = { data: [], error: null };
    const { result } = renderHook(() => useFinanceHomeState(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.hasActiveLedger).toBe(false);
    // Months resolve from the browser-local clock; assert shape (the exact
    // Lead-Day boundary is pinned deterministically in the BE unit test).
    expect(result.current.data?.currentMonth).toMatch(/^\d{4}-\d{2}$/);
    expect(result.current.data?.nextMonth).toMatch(/^\d{4}-\d{2}$/);
    expect(result.current.data?.nextMonth ?? "").toBeTruthy();
    expect(typeof result.current.data?.isWithinLeadDay).toBe("boolean");
  });

  test("an ongoing ledger → hasActiveLedger true", async () => {
    nextResult = { data: [ledgerRow("2026-06-01", "ongoing")], error: null };
    const { result } = renderHook(() => useFinanceHomeState(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.hasActiveLedger).toBe(true);
  });

  test("only non-ongoing ledgers → hasActiveLedger false", async () => {
    nextResult = {
      data: [ledgerRow("2026-05-01", "reconciling"), ledgerRow("2026-06-01", "settled")],
      error: null,
    };
    const { result } = renderHook(() => useFinanceHomeState(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.hasActiveLedger).toBe(false);
  });

  test("a repository read failure surfaces isError with a FinanceDataError", async () => {
    nextResult = {
      data: null,
      error: { name: "PostgrestError", message: "denied", details: "", hint: "", code: "42501" },
    };
    const { result } = renderHook(() => useFinanceHomeState(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(financeReal.FinanceDataError);
  });
});
