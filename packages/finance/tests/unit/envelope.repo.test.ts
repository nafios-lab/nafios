import { describe, expect, test } from "bun:test";
import type { PostgrestError } from "@nafios/supabase-core";
import { decodeMoney } from "../../src/domain";
import type { FinanceClient } from "../../src/internal/client";
import { FinanceDataError } from "../../src/internal/errors";
import type { EnvelopeRow } from "../../src/internal/mappers/envelope.mapper";
import { createEnvelopeRepository } from "../../src/internal/repositories/envelope.repo";

// UNIT tests over the envelope repository's call-shaping and error-mapping
// against a FAKE client — no live DB. The full §6.1 behavior (real RLS, real
// 23503/23514 constraint failures, two seeded users) is proven by the repo-root
// live matrix (tests/integration/envelope.repo.test.ts).

type QueryResult = { data: unknown; error: PostgrestError | null };

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

function envelopeRow(overrides: Partial<EnvelopeRow> = {}): EnvelopeRow {
  return {
    id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
    ledger_id: "11111111-1111-1111-1111-111111111111",
    category_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    item: "Netflix",
    amount: "19.90" as unknown as number,
    original_amount: null,
    status: "pending",
    paid_at: null,
    payment_source_id: null,
    remark: null,
    linked_member_id: null,
    sort_order: 0,
    template_id: null,
    carried_from_envelope_id: null,
    carry_over_reason: null,
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

function argsOf(calls: Array<[string, ...unknown[]]>, method: string): unknown[] | undefined {
  return calls.find(([m]) => m === method)?.slice(1);
}

function methodsIn(calls: Array<[string, ...unknown[]]>): string[] {
  return calls.map(([m]) => m);
}

const NEW_ENVELOPE = {
  ledgerId: "11111111-1111-1111-1111-111111111111",
  category: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  item: "Netflix",
  amount: decodeMoney("19.90"),
} as const;

describe("insert", () => {
  test("targets the envelope table, sets no user_id, reads back, returns the Envelope", async () => {
    const { client, calls } = makeClient({ data: envelopeRow(), error: null });
    const envelope = await createEnvelopeRepository(client).insert(NEW_ENVELOPE);

    expect(argsOf(calls, "from")).toEqual(["envelope"]);
    const insertArg = argsOf(calls, "insert")?.[0] as Record<string, unknown>;
    expect(insertArg).not.toHaveProperty("user_id");
    expect(insertArg.ledger_id).toBe("11111111-1111-1111-1111-111111111111");
    expect(insertArg.amount).toBe("19.90");
    expect(insertArg.status).toBe("pending");
    expect(methodsIn(calls)).toContain("single");
    expect(envelope.id).toBe("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
    expect(envelope.status).toBe("pending");
  });

  test("maps a bad/unowned category 23503 to FinanceDataError('foreign_key_violation')", async () => {
    const { client } = makeClient({
      data: null,
      error: pgError({
        code: "23503",
        message: 'violates foreign key constraint "fk_envelope_category"',
      }),
    });
    const promise = createEnvelopeRepository(client).insert(NEW_ENVELOPE);
    await expect(promise).rejects.toBeInstanceOf(FinanceDataError);
    await expect(promise).rejects.toMatchObject({
      code: "foreign_key_violation",
      constraint: "fk_envelope_category",
    });
  });
});

describe("findById", () => {
  test("filters by id and returns the mapped envelope", async () => {
    const { client, calls } = makeClient({ data: envelopeRow(), error: null });
    const envelope = await createEnvelopeRepository(client).findById("id-1");
    expect(argsOf(calls, "eq")).toEqual(["id", "id-1"]);
    expect(methodsIn(calls)).toContain("maybeSingle");
    expect(envelope?.id).toBe("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
  });

  test("returns null when no row matches (not found / not owned)", async () => {
    const { client } = makeClient({ data: null, error: null });
    expect(await createEnvelopeRepository(client).findById("missing")).toBeNull();
  });

  test("maps a read failure to FinanceDataError", async () => {
    const { client } = makeClient({ data: null, error: pgError({ code: "42501" }) });
    await expect(createEnvelopeRepository(client).findById("x")).rejects.toBeInstanceOf(
      FinanceDataError,
    );
  });
});

describe("listByLedger", () => {
  test("filters by ledger_id, orders by sort_order then created_at, maps every row", async () => {
    const { client, calls } = makeClient({
      data: [envelopeRow(), envelopeRow({ id: "2", sort_order: 1 })],
      error: null,
    });
    const rows = await createEnvelopeRepository(client).listByLedger("L");
    expect(argsOf(calls, "eq")).toEqual(["ledger_id", "L"]);
    const orderCalls = calls.filter(([m]) => m === "order").map((c) => c.slice(1));
    expect(orderCalls).toEqual([
      ["sort_order", { ascending: true }],
      ["created_at", { ascending: true }],
    ]);
    expect(rows.map((r) => r.id)).toEqual(["eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee", "2"]);
  });

  test("propagates a query failure as FinanceDataError", async () => {
    const { client } = makeClient({ data: null, error: pgError({ code: "08006" }) });
    await expect(createEnvelopeRepository(client).listByLedger("L")).rejects.toBeInstanceOf(
      FinanceDataError,
    );
  });
});

describe("update", () => {
  test("shapes a partial update (encoded amount), reads back, returns the Envelope", async () => {
    const { client, calls } = makeClient({
      data: envelopeRow({ item: "X", amount: "99.99" as unknown as number }),
      error: null,
    });
    const envelope = await createEnvelopeRepository(client).update("id-1", {
      item: "X",
      amount: decodeMoney("99.99"),
    });
    expect(argsOf(calls, "update")).toEqual([{ item: "X", amount: "99.99" as unknown as number }]);
    expect(argsOf(calls, "eq")).toEqual(["id", "id-1"]);
    expect(envelope.item).toBe("X");
  });

  test("maps a failure to FinanceDataError", async () => {
    const { client } = makeClient({ data: null, error: pgError({ code: "23503" }) });
    await expect(
      createEnvelopeRepository(client).update("id", { item: "X" }),
    ).rejects.toMatchObject({ code: "foreign_key_violation" });
  });
});

describe("updateStatus", () => {
  test("writes the (status, paid_at) pair via the seam and returns the Envelope", async () => {
    const { client, calls } = makeClient({
      data: envelopeRow({ status: "carried_over" }),
      error: null,
    });
    const envelope = await createEnvelopeRepository(client).updateStatus("id-1", {
      status: "carried-over",
      paidAt: null,
    });
    expect(argsOf(calls, "update")).toEqual([{ status: "carried_over", paid_at: null }]);
    expect(argsOf(calls, "eq")).toEqual(["id", "id-1"]);
    expect(envelope.status).toBe("carried-over");
  });

  test("maps a ck_env_paid_at 23514 to check_violation", async () => {
    const { client } = makeClient({
      data: null,
      error: pgError({ code: "23514", message: 'check constraint "ck_env_paid_at"' }),
    });
    await expect(
      createEnvelopeRepository(client).updateStatus("id", { status: "paid", paidAt: null }),
    ).rejects.toMatchObject({ code: "check_violation", constraint: "ck_env_paid_at" });
  });
});

describe("delete", () => {
  test("deletes by id and resolves on success", async () => {
    const { client, calls } = makeClient({ data: null, error: null });
    await createEnvelopeRepository(client).delete("id-1");
    expect(argsOf(calls, "delete")).toEqual([]);
    expect(argsOf(calls, "eq")).toEqual(["id", "id-1"]);
  });

  test("maps a failure to FinanceDataError", async () => {
    const { client } = makeClient({ data: null, error: pgError({ code: "42501" }) });
    await expect(createEnvelopeRepository(client).delete("id-1")).rejects.toBeInstanceOf(
      FinanceDataError,
    );
  });
});
