import { describe, expect, test } from "bun:test";
import type { PostgrestError } from "@nafios/supabase-core";
import { decodeMoney, decodeMonth } from "../../src/domain";
import type { FinanceClient } from "../../src/internal/client";
import { FinanceDataError } from "../../src/internal/errors";
import {
  createLedgerRepository,
  type LedgerRow,
} from "../../src/internal/repositories/ledger.repo";

// These are UNIT tests over the repository's call-shaping and error-mapping
// against a FAKE client — no live DB. The full §6 behavior (real RLS, real
// constraint failures, two seeded users) is proven by the repo-root live matrix
// (tests/integration/ledger.repo.test.ts).

type QueryResult = { data: unknown; error: PostgrestError | null };

/**
 * A supabase-js-shaped query builder stub. Every chainable method records its
 * call and returns the builder; the builder is thenable, so `await`-ing it at
 * ANY terminal (.single() / .maybeSingle() / .order() / .eq()) resolves to the
 * pre-configured result. This mirrors PostgREST's "await the builder" execution
 * without pulling in the real SDK.
 */
function makeClient(result: QueryResult) {
  const calls: Array<[string, ...unknown[]]> = [];
  const builder: Record<string, unknown> = {};
  for (const method of [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "order",
    "single",
    "maybeSingle",
  ]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  // Intentional thenable: awaiting the builder at any terminal resolves to the
  // configured result — that IS how the real PostgREST builder executes.
  // biome-ignore lint/suspicious/noThenProperty: deliberate query-builder stub
  builder.then = (resolve: (v: QueryResult) => void) => resolve(result);
  const client = {
    from: (...args: unknown[]) => {
      calls.push(["from", ...args]);
      return builder;
    },
    // `.rpc(...)` is thenable like the query builder — awaiting it resolves to the
    // configured result (the get_ledger_summary path uses this, not `.from`).
    rpc: (...args: unknown[]) => {
      calls.push(["rpc", ...args]);
      return builder;
    },
  };
  return { client: client as unknown as FinanceClient, calls };
}

function ledgerRow(overrides: Partial<LedgerRow> = {}): LedgerRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    month: "2027-01-01",
    opening_balance: "7152.35" as unknown as number,
    max_capped: "6415.00" as unknown as number,
    status: "ongoing",
    created_at: "2027-01-01T08:00:00.000Z",
    settled_at: null,
    ...overrides,
  };
}

function pgError(overrides: Partial<PostgrestError>): PostgrestError {
  return {
    name: "PostgrestError",
    message: "",
    details: "",
    hint: "",
    code: "",
    ...overrides,
  } as PostgrestError;
}

const NEW_LEDGER = {
  month: decodeMonth("2027-01-01"),
  openingBalance: decodeMoney("7152.35"),
  maxCapped: decodeMoney("6415.00"),
} as const;

function argsOf(calls: Array<[string, ...unknown[]]>, method: string): unknown[] | undefined {
  return calls.find(([m]) => m === method)?.slice(1);
}

describe("insert", () => {
  test("shapes the write (monthly_ledger, no user_id, reads back) and returns the header", async () => {
    const { client, calls } = makeClient({ data: ledgerRow(), error: null });
    const header = await createLedgerRepository(client).insert(NEW_LEDGER);

    expect(argsOf(calls, "from")).toEqual(["monthly_ledger"]);
    const insertArg = argsOf(calls, "insert")?.[0] as Record<string, unknown>;
    expect(insertArg).not.toHaveProperty("user_id");
    expect(insertArg.month).toBe("2027-01-01");
    expect(insertArg.opening_balance).toBe("7152.35");
    expect(calls.some(([m]) => m === "single")).toBe(true);
    expect(header.id).toBe("11111111-1111-1111-1111-111111111111");
    expect(header.status).toBe("ongoing");
  });

  test("maps a duplicate-month 23505 to FinanceDataError('duplicate_month')", async () => {
    const { client } = makeClient({
      data: null,
      error: pgError({
        code: "23505",
        message: 'violates unique constraint "uq_ledger_user_month"',
      }),
    });
    const promise = createLedgerRepository(client).insert(NEW_LEDGER);
    await expect(promise).rejects.toBeInstanceOf(FinanceDataError);
    await expect(promise).rejects.toMatchObject({ code: "duplicate_month" });
  });
});

describe("findById / findByMonth / findOngoing — null on no row, error mapped", () => {
  test("findById returns the header when found", async () => {
    const { client, calls } = makeClient({ data: ledgerRow(), error: null });
    const header = await createLedgerRepository(client).findById("id-1");
    expect(argsOf(calls, "eq")).toEqual(["id", "id-1"]);
    expect(header?.id).toBe("11111111-1111-1111-1111-111111111111");
  });

  test("findById returns null when no row matches (not owned / not found)", async () => {
    const { client } = makeClient({ data: null, error: null });
    expect(await createLedgerRepository(client).findById("missing")).toBeNull();
  });

  test("findByMonth queries the first-of-month DATE via encodeMonth", async () => {
    const { client, calls } = makeClient({ data: ledgerRow(), error: null });
    await createLedgerRepository(client).findByMonth(decodeMonth("2027-01-01"));
    expect(argsOf(calls, "eq")).toEqual(["month", "2027-01-01"]);
  });

  test("findByMonth returns null when the month has no ledger", async () => {
    const { client } = makeClient({ data: null, error: null });
    expect(await createLedgerRepository(client).findByMonth(decodeMonth("2027-09-01"))).toBeNull();
  });

  test("findOngoing filters status='ongoing' and returns the row", async () => {
    const { client, calls } = makeClient({ data: ledgerRow(), error: null });
    const header = await createLedgerRepository(client).findOngoing();
    expect(argsOf(calls, "eq")).toEqual(["status", "ongoing"]);
    expect(header?.status).toBe("ongoing");
  });

  test("findOngoing returns null when the user has no ongoing ledger", async () => {
    const { client } = makeClient({ data: null, error: null });
    expect(await createLedgerRepository(client).findOngoing()).toBeNull();
  });

  test("a read query failure is mapped to FinanceDataError", async () => {
    const { client } = makeClient({
      data: null,
      error: pgError({ code: "42501", message: "denied" }),
    });
    await expect(createLedgerRepository(client).findById("x")).rejects.toBeInstanceOf(
      FinanceDataError,
    );
  });
});

describe("getLedgerSummary — RPC-backed summary card, null on missing", () => {
  // The get_ledger_summary jsonb payload (money as text, counts as integers,
  // carried_over in the DB's snake_case label). The mapper's exact decoding is
  // covered in ledger-summary.mapper.test.ts; here we assert the call-shaping.
  const summaryPayload = {
    id: "11111111-1111-1111-1111-111111111111",
    month: "2027-01-01",
    status: "ongoing",
    opening_balance: "7152.35",
    max_capped: "6415.00",
    col: "4307.28",
    asm_contribution: "2845.07",
    health_margin: "2107.72",
    is_asm_negative: false,
    outstanding: { count: 3, total: "1200.00" },
    envelope_counts: { total: 12, paid: 5, pending: 3, skipped: 2, carried_over: 2 },
  };

  test("calls the get_ledger_summary RPC with p_ledger_id and maps the payload", async () => {
    const { client, calls } = makeClient({ data: summaryPayload, error: null });
    const card = await createLedgerRepository(client).getLedgerSummary("id-1");
    expect(argsOf(calls, "rpc")).toEqual(["get_ledger_summary", { p_ledger_id: "id-1" }]);
    expect(card?.id).toBe("11111111-1111-1111-1111-111111111111");
    expect(card?.metrics.isAsmNegative).toBe(false);
    expect(card?.counts.carriedOver).toBe(2);
  });

  test("returns null when the RPC yields no payload (missing / not owned)", async () => {
    const { client } = makeClient({ data: null, error: null });
    expect(await createLedgerRepository(client).getLedgerSummary("missing")).toBeNull();
  });

  test("maps an RPC failure to FinanceDataError", async () => {
    const { client } = makeClient({
      data: null,
      error: pgError({ code: "42501", message: "denied" }),
    });
    await expect(createLedgerRepository(client).getLedgerSummary("x")).rejects.toBeInstanceOf(
      FinanceDataError,
    );
  });
});

describe("listPendingRecon — RPC-backed worklist, [] on empty, error-mapped", () => {
  // One get_pending_recon_ledgers row: money as TEXT, counts as integers, month
  // the first-of-month DATE, status the raw 'reconciling' label. The mapper's
  // exact decoding is covered in ledger.mapper.test.ts; here we assert the
  // no-arg RPC call-shaping + the empty-set → [] contract.
  const reconRow = {
    id: "11111111-1111-1111-1111-111111111111",
    month: "2027-01-01",
    status: "reconciling",
    pending_env_counts: 3,
    pending_sum_amount: "1200.00",
  };

  test("calls the get_pending_recon_ledgers RPC with no args and maps every row", async () => {
    const { client, calls } = makeClient({
      data: [reconRow, { ...reconRow, id: "2", month: "2027-02-01" }],
      error: null,
    });
    const rows = await createLedgerRepository(client).listPendingRecon();
    expect(argsOf(calls, "rpc")).toEqual(["get_pending_recon_ledgers"]);
    expect(rows.map((r) => r.id)).toEqual(["11111111-1111-1111-1111-111111111111", "2"]);
    expect(rows[0]?.pendingEnvCounts).toBe(3);
    expect(rows[0]?.status).toBe("reconciling");
    expect(rows[0]?.pendingSumAmount).toEqual(decodeMoney("1200.00"));
  });

  test("returns [] when nothing is reconciling (empty set)", async () => {
    const { client } = makeClient({ data: [], error: null });
    expect(await createLedgerRepository(client).listPendingRecon()).toEqual([]);
  });

  test("returns [] when the RPC yields a null payload", async () => {
    const { client } = makeClient({ data: null, error: null });
    expect(await createLedgerRepository(client).listPendingRecon()).toEqual([]);
  });

  test("maps an RPC failure to FinanceDataError", async () => {
    const { client } = makeClient({
      data: null,
      error: pgError({ code: "42501", message: "denied" }),
    });
    await expect(createLedgerRepository(client).listPendingRecon()).rejects.toBeInstanceOf(
      FinanceDataError,
    );
  });
});

describe("list — chronological, mapped, error-aware", () => {
  test("orders by month ascending and maps every row", async () => {
    const { client, calls } = makeClient({
      data: [ledgerRow(), ledgerRow({ id: "2", month: "2027-03-01" })],
      error: null,
    });
    const rows = await createLedgerRepository(client).list();
    expect(argsOf(calls, "order")).toEqual(["month", { ascending: true }]);
    expect(rows.map((r) => r.id)).toEqual(["11111111-1111-1111-1111-111111111111", "2"]);
  });

  test("propagates a query failure as FinanceDataError", async () => {
    const { client } = makeClient({ data: null, error: pgError({ code: "08006" }) });
    await expect(createLedgerRepository(client).list()).rejects.toBeInstanceOf(FinanceDataError);
  });
});

describe("updateStatus", () => {
  test("updates status, reads back, and returns the updated header", async () => {
    const { client, calls } = makeClient({
      data: ledgerRow({ status: "reconciling" }),
      error: null,
    });
    const header = await createLedgerRepository(client).updateStatus("id-1", "reconciling");
    expect(argsOf(calls, "update")).toEqual([{ status: "reconciling" }]);
    expect(argsOf(calls, "eq")).toEqual(["id", "id-1"]);
    expect(header.status).toBe("reconciling");
  });

  test("maps a failure to FinanceDataError", async () => {
    const { client } = makeClient({
      data: null,
      error: pgError({ code: "23514", message: 'check constraint "ck_x"' }),
    });
    await expect(
      createLedgerRepository(client).updateStatus("id", "reconciling"),
    ).rejects.toMatchObject({
      code: "check_violation",
    });
  });
});

describe("delete", () => {
  test("resolves on success", async () => {
    const { client, calls } = makeClient({ data: null, error: null });
    await createLedgerRepository(client).delete("id-1");
    expect(argsOf(calls, "delete")).toEqual([]);
    expect(argsOf(calls, "eq")).toEqual(["id", "id-1"]);
  });

  test("maps a failure to FinanceDataError", async () => {
    const { client } = makeClient({ data: null, error: pgError({ code: "42501" }) });
    await expect(createLedgerRepository(client).delete("id-1")).rejects.toBeInstanceOf(
      FinanceDataError,
    );
  });
});
