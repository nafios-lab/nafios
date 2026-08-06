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
// The `get_ledger_summary` RPC payload for the ongoing ledger — swapped per test
// the same way. Defaults to a NULL summary (no ongoing ledger consults it).
let nextSummary: QueryResult = { data: null, error: null };

/** The `get_ledger_summary` jsonb payload (money as text, carried_over in the
 *  DB's snake_case label) the RPC returns for an ongoing ledger. The mapping is
 *  covered in the finance package; here we only need a valid shape to prove it
 *  reaches the hook's `activeLedgerSummary`. */
const summaryPayload = {
  id: "id-2026-06-01",
  month: "2026-06-01",
  status: "ongoing",
  opening_balance: "1000.00",
  max_capped: "1500.00",
  col: "800.00",
  asm_contribution: "200.00",
  health_margin: "500.00",
  is_asm_negative: false,
  outstanding: { count: 1, total: "100.00" },
  envelope_counts: { total: 4, paid: 2, pending: 1, skipped: 1, carried_over: 0 },
};

/** A supabase-js-shaped, thenable builder — the shared repo-test idiom. `list()`
 *  chains `from().select().order()`; `getLedgerSummary` reads through `.rpc(...)`
 *  (thenable the same way), resolving to `nextSummary`. */
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
  const rpcResult: Record<string, unknown> = {
    // biome-ignore lint/suspicious/noThenProperty: deliberate rpc-result stub
    then: (resolve: (v: QueryResult) => void) => resolve(nextSummary),
  };
  return { from: () => builder, rpc: () => rpcResult };
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
  nextSummary = { data: null, error: null };
});
afterEach(cleanup);

describe("useFinanceHomeState", () => {
  test("no ledgers → success with fresh_start_ledger true and a resolved month pair", async () => {
    nextResult = { data: [], error: null };
    const { result } = renderHook(() => useFinanceHomeState(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.fresh_start_ledger).toBe(true);
    // Months resolve from the browser-local clock; assert shape (the exact
    // Lead-Day boundary is pinned deterministically in the BE unit test).
    expect(result.current.data?.currentMonth).toMatch(/^\d{4}-\d{2}$/);
    expect(result.current.data?.nextMonth).toMatch(/^\d{4}-\d{2}$/);
    expect(result.current.data?.nextMonth ?? "").toBeTruthy();
    expect(typeof result.current.data?.isWithinLeadDay).toBe("boolean");
  });

  test("an ongoing ledger → not fresh start with its summary card", async () => {
    nextResult = { data: [ledgerRow("2026-06-01", "ongoing")], error: null };
    nextSummary = { data: summaryPayload, error: null };
    const { result } = renderHook(() => useFinanceHomeState(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.fresh_start_ledger).toBe(false);
    // The ongoing ledger's get_ledger_summary payload is awaited and mapped
    // through onto the hook state (not left null).
    expect(result.current.data?.activeLedgerSummary).not.toBeNull();
    expect(result.current.data?.activeLedgerSummary?.id).toBe(summaryPayload.id);
    expect(result.current.data?.activeLedgerSummary?.counts.paid).toBe(2);
  });

  test("only non-ongoing ledgers → not fresh start, no active summary", async () => {
    nextResult = {
      data: [ledgerRow("2026-05-01", "reconciling"), ledgerRow("2026-06-01", "settled")],
      error: null,
    };
    const { result } = renderHook(() => useFinanceHomeState(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Ledgers exist (just none ongoing) → not a fresh start, yet no summary.
    expect(result.current.data?.fresh_start_ledger).toBe(false);
    expect(result.current.data?.activeLedgerSummary).toBeNull();
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
