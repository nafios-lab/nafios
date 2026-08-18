import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { CreateLedgerInput, CreateLedgerResult, MonthlyLedger } from "@nafios/finance";
import * as finance from "@nafios/finance";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

// The hook composes the real `createLedgerCommands` over the finance browser
// client, so we mock both seams: `finance-client` to a dummy (no Supabase env /
// browser client is built), and `createLedgerCommands` to a stub whose
// `createLedger` returns the per-test result (or throws). That isolates the
// hook's own logic — the result branching + cache-invalidation policy.
//
// `mock.module` is process-global and leaks forward, so we restore both seams in
// `afterAll` — finance-home.test.tsx embeds the real form and must see the reals.
const CLIENT_PATH = "../../src/features/finance/lib/finance-client";

/** Per-test: the result the stubbed `createLedger` resolves — or throws if set. */
let createLedger: (input: CreateLedgerInput) => Promise<CreateLedgerResult>;

mock.module(CLIENT_PATH, () => ({ getFinanceClient: () => ({}) }));
mock.module("@nafios/finance", () => ({
  ...finance,
  createLedgerCommands: () => ({ createLedger }),
}));

// Imported AFTER the mocks are registered so the hook binds to the stubs.
const { useCreateLedger } = await import("../../src/features/finance/hooks/use-create-ledger.ts");

afterAll(() => {
  mock.module("@nafios/finance", () => finance);
});

const { moneyFromCents, monthOf } = finance;

const INPUT: CreateLedgerInput = {
  month: monthOf("2026-08-01"),
  openingBalance: moneyFromCents(715235),
  maxCapped: moneyFromCents(500000),
  acknowledgedOverspend: false,
};

let queryClient: QueryClient;
let invalidate: ReturnType<typeof spyOn>;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  invalidate = spyOn(queryClient, "invalidateQueries");
  createLedger = () => Promise.resolve({ ok: false, reason: "overspend_warning" });
});
afterEach(cleanup);

describe("useCreateLedger", () => {
  test("a pre-write rejection resolves the reason and leaves the cache untouched", async () => {
    createLedger = () => Promise.resolve({ ok: false, reason: "overspend_warning" });
    const { result } = renderHook(() => useCreateLedger(), { wrapper });

    const res = await result.current.mutateAsync(INPUT);

    expect(res).toEqual({ ok: false, reason: "overspend_warning" });
    // A rejection wrote nothing — no Finance-Home reread.
    expect(invalidate).not.toHaveBeenCalled();
  });

  test("a successful open invalidates the Finance-Home slice", async () => {
    createLedger = () =>
      Promise.resolve({ ok: true, ledger: {} as MonthlyLedger, parkedLedgerId: null });
    const { result } = renderHook(() => useCreateLedger(), { wrapper });

    const res = await result.current.mutateAsync(INPUT);

    expect(res.ok).toBe(true);
    // A real open changes server state — reresolve every Finance-Home day slice.
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["finance", "home"] }));
  });

  test("a genuine DB fault rejects and does not touch the cache", async () => {
    createLedger = () => Promise.reject(new Error("db fault"));
    const { result } = renderHook(() => useCreateLedger(), { wrapper });

    await expect(result.current.mutateAsync(INPUT)).rejects.toThrow("db fault");
    // onError is the global-fault seam (not a user rejection) — cache untouched.
    expect(invalidate).not.toHaveBeenCalled();
  });
});
