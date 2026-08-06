import { describe, expect, test } from "bun:test";
import type { PostgrestError } from "@nafios/supabase-core";
import { addMonths, isWithinCreationWindow, monthOf } from "../../src/domain";
import type { FinanceClient } from "../../src/internal/client";
import { FinanceDataError } from "../../src/internal/errors";
import { createLedgerQueries } from "../../src/internal/queries/ledger-queries";
import type { LedgerRow } from "../../src/internal/repositories/ledger.repo";

// UNIT tests over the Finance-Home read surface against a FAKE client — no live
// DB. The read runs the real internal repository (`list()`) + the pure resolver;
// only the SDK query builder is stubbed. The live §6 behavior (real RLS, a real
// monthly_ledger row, cross-user isolation) is proven by the repo-root matrix
// (tests/integration/ledger-queries.test.ts).

type QueryResult = { data: unknown; error: PostgrestError | null };

/** The `get_ledger_summary` jsonb payload (money as text, counts as integers,
 *  carried_over in the DB's snake_case label) that the RPC returns for the
 *  ongoing ledger. The mapper's decoding is covered in ledger.repo.test.ts; here
 *  we only need a valid shape to prove it reaches `activeLedgerSummary`. */
const summaryPayload = {
  id: "id-2026-06-01-ongoing",
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

/** A supabase-js-shaped, thenable query-builder stub — the `ledger.repo.test.ts`
 *  idiom. `list()` chains `from().select().order()`; awaiting any terminal
 *  resolves to the pre-configured `{ data, error }`. `getLedgerSummary` reads
 *  through `.rpc(...)` (thenable the same way), which resolves to `summary`. */
function makeClient(result: QueryResult, summary: QueryResult = { data: null, error: null }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "order", "eq", "maybeSingle", "single", "insert", "update"]) {
    builder[method] = () => builder;
  }
  // biome-ignore lint/suspicious/noThenProperty: deliberate query-builder stub
  builder.then = (resolve: (v: QueryResult) => void) => resolve(result);

  const rpcResult: Record<string, unknown> = {
    // biome-ignore lint/suspicious/noThenProperty: deliberate rpc-result stub
    then: (resolve: (v: QueryResult) => void) => resolve(summary),
  };
  return { from: () => builder, rpc: () => rpcResult } as unknown as FinanceClient;
}

/** A monthly_ledger row for a given month/status (numeric columns arrive as
 *  strings from the SDK, mirroring the mapper's reality). */
function ledgerRow(month: string, status: LedgerRow["status"]): LedgerRow {
  return {
    id: `id-${month}-${status}`,
    month,
    opening_balance: "1000.00" as unknown as number,
    max_capped: "1500.00" as unknown as number,
    status,
    created_at: "2026-07-01T08:00:00.000Z",
    settled_at: status === "settled" ? "2026-07-31T00:00:00.000Z" : null,
  };
}

function withLedgers(rows: LedgerRow[], summary: QueryResult = { data: null, error: null }) {
  return makeClient({ data: rows, error: null }, summary);
}

describe("getFinanceHomeState — fresh start & active ledger summary", () => {
  test("S1: no ledgers → fresh_start_ledger true, no active summary; window + openable per the Lead-Day rule", async () => {
    // 2026-07-10 is OUTSIDE July's Lead-Day window (31 − 10 = 21, not < 7).
    const state = await createLedgerQueries(withLedgers([])).getFinanceHomeState("2026-07-10");

    // Zero ledgers ever created → the user starts fresh.
    expect(state.fresh_start_ledger).toBe(true);
    expect(state.isWithinLeadDay).toBe(isWithinCreationWindow("2026-07-10", 7));
    expect(state.isWithinLeadDay).toBe(false);
    expect(state.currentMonth).toBe(monthOf("2026-07-01"));
    expect(state.nextMonth).toBe(monthOf("2026-08-01"));
    // Current month is free → openable; next is null outside the window.
    expect(state.openable.current).toBe(monthOf("2026-07-01"));
    expect(state.openable.next).toBeNull();
    // No ongoing ledger → no summary, and the RPC is never consulted.
    expect(state.activeLedgerSummary).toBeNull();
  });

  test("S2: a status:'ongoing' ledger → not fresh start + its summary card", async () => {
    const state = await createLedgerQueries(
      withLedgers([ledgerRow("2026-06-01", "ongoing")], { data: summaryPayload, error: null }),
    ).getFinanceHomeState("2026-07-10");

    // A ledger exists → the user is not starting fresh.
    expect(state.fresh_start_ledger).toBe(false);
    // The ongoing ledger's get_ledger_summary payload is awaited and mapped onto
    // the state (the forEach-vs-await regression: it must NOT be null here).
    expect(state.activeLedgerSummary).not.toBeNull();
    expect(state.activeLedgerSummary?.id).toBe(summaryPayload.id);
    expect(state.activeLedgerSummary?.metrics.isAsmNegative).toBe(false);
    expect(state.activeLedgerSummary?.counts.paid).toBe(2);
  });

  test("S3: only non-ongoing ledgers (reconciling / settled) → not fresh start, no active summary", async () => {
    const state = await createLedgerQueries(
      withLedgers([ledgerRow("2026-05-01", "reconciling"), ledgerRow("2026-06-01", "settled")]),
    ).getFinanceHomeState("2026-07-10");

    // Ledgers exist (just none ongoing) → not a fresh start, yet no active summary.
    expect(state.fresh_start_ledger).toBe(false);
    expect(state.activeLedgerSummary).toBeNull();
  });
});

describe("getFinanceHomeState — Lead-Day boundary (July, 31 days)", () => {
  test("2026-07-24 is outside the window → isWithinLeadDay false, next not openable", async () => {
    const state = await createLedgerQueries(withLedgers([])).getFinanceHomeState("2026-07-24");
    expect(state.isWithinLeadDay).toBe(false);
    expect(state.openable.next).toBeNull();
  });

  test("2026-07-25 is inside the window → isWithinLeadDay true, next openable", async () => {
    const state = await createLedgerQueries(withLedgers([])).getFinanceHomeState("2026-07-25");
    expect(state.isWithinLeadDay).toBe(true);
    // In-window and August is free → openable.next is the next month.
    expect(state.openable.next).toBe(addMonths(monthOf("2026-07-01"), 1));
    expect(state.nextMonth).toBe(monthOf("2026-08-01"));
  });
});

describe("getFinanceHomeState — error propagation", () => {
  test("a repository read failure rejects with FinanceDataError (propagated unchanged)", async () => {
    const client = makeClient({
      data: null,
      error: {
        name: "PostgrestError",
        message: "denied",
        details: "",
        hint: "",
        code: "42501",
      } as PostgrestError,
    });
    await expect(
      createLedgerQueries(client).getFinanceHomeState("2026-07-10"),
    ).rejects.toBeInstanceOf(FinanceDataError);
  });
});
