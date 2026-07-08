import { describe, expect, test } from "bun:test";
import type { PostgrestError } from "@nafios/supabase-core";
import { decodeMoney, decodeMonth } from "../../src/domain";
import type { FinanceClient } from "../../src/internal/client";
import { FinanceDataError } from "../../src/internal/errors";
import type { LedgerRow } from "../../src/internal/mappers/ledger.mapper";
import { createLedgerRepository } from "../../src/internal/repositories/ledger.repo";

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
