import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as financeReal from "@nafios/finance";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode, useState } from "react";

// The reconciliation-worklist read hook, exercised against a FAKE finance client.
//
// We mock the LOCAL `finance-client` module (not `@nafios/finance`): `getFinanceClient`
// memoizes a process-wide singleton, and use-finance-home-state.test.tsx runs first
// and locks it to ITS fake client — so overriding `createBrowserClient` here would
// be a no-op. Overriding `getFinanceClient` to hand back our own thenable stub
// sidesteps the singleton. The real `createLedgerQueries` + repository + mapper
// still run end-to-end; only the SDK round-trip (the RPC) is stubbed.
//
// `mock.module` is process-global, so we capture the real module and restore it in
// `afterAll` for any later file.
const FC_PATH = "../../src/features/finance/lib/finance-client";
const realFinanceClient = await import(FC_PATH);

type QueryResult = { data: unknown; error: unknown };

// The result the fake RPC resolves to — swapped per test.
let nextRpc: QueryResult = { data: [], error: null };

/** One `get_pending_recon_ledgers` row (money as text, counts as integers). */
const reconDto = {
  id: "id-2026-05-01",
  month: "2026-05-01",
  status: "reconciling",
  pending_env_counts: 3,
  pending_sum_amount: "1284.50",
};

/** A supabase-js-shaped, thenable stub. `listPendingRecon` reads through
 *  `.rpc("get_pending_recon_ledgers")` (thenable), resolving to `nextRpc`. */
function fakeBrowserClient() {
  const rpcResult: Record<string, unknown> = {
    // biome-ignore lint/suspicious/noThenProperty: deliberate rpc-result stub
    then: (resolve: (v: QueryResult) => void) => resolve(nextRpc),
  };
  return { from: () => ({}), rpc: () => rpcResult };
}

mock.module(FC_PATH, () => ({
  ...realFinanceClient,
  getFinanceClient: () => fakeBrowserClient(),
}));

// Imported AFTER the mock is registered so the hook binds to the stubbed client.
const { useReconPendingLedgers } = await import(
  "../../src/features/finance/hooks/use-recon-pending-ledgers"
);

afterAll(() => {
  mock.module(FC_PATH, () => realFinanceClient);
});

/** Fresh QueryClient per renderHook call (pinned via useState so a wrapper
 *  re-render never discards the in-flight query). */
function Wrapper({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  nextRpc = { data: [], error: null };
});
afterEach(cleanup);

describe("useReconPendingLedgers", () => {
  test("reconciling ledgers → success with a decoded { ledgers } worklist", async () => {
    nextRpc = { data: [reconDto], error: null };
    const { result } = renderHook(() => useReconPendingLedgers(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.ledgers).toHaveLength(1);
    expect(result.current.data?.ledgers[0]?.id).toBe(reconDto.id);
    expect(result.current.data?.ledgers[0]?.month).toBe(financeReal.monthOf("2026-05-01"));
    expect(result.current.data?.ledgers[0]?.pendingEnvCounts).toBe(3);
    // Money crosses the wire as text and decodes to exact cents (EF3.1).
    expect(result.current.data?.ledgers[0]?.pendingSumAmount).toBe(
      financeReal.moneyFromCents(128450),
    );
  });

  test("nothing reconciling → success with an empty { ledgers: [] }", async () => {
    nextRpc = { data: [], error: null };
    const { result } = renderHook(() => useReconPendingLedgers(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.ledgers).toEqual([]);
  });

  test("a repository read failure surfaces isError with a FinanceDataError", async () => {
    nextRpc = {
      data: null,
      error: { name: "PostgrestError", message: "denied", details: "", hint: "", code: "42501" },
    };
    const { result } = renderHook(() => useReconPendingLedgers(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(financeReal.FinanceDataError);
  });
});
