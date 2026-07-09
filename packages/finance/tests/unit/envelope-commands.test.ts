import { describe, expect, test } from "bun:test";
import type { PostgrestError } from "@nafios/supabase-core";
import { decodeMoney } from "../../src/domain";
import type { FinanceClient } from "../../src/internal/client";
import { createEnvelopeCommands } from "../../src/internal/commands/envelope-commands";
import { FinanceDataError } from "../../src/internal/errors";
import type { EnvelopeRow } from "../../src/internal/mappers/envelope.mapper";
import type { LedgerRow } from "../../src/internal/mappers/ledger.mapper";

// UNIT tests over the envelope commands' COMPOSITION + the shared mutability gate
// against a FAKE client — no live DB. They pin every pre-write rejection (no
// write), the paidAt orchestration via applyStatusTransition, and the
// foreign_key_violation throw passing through. The full §6.2 behavior (real RLS,
// real 23503, two seeded users) is proven by the repo-root live matrix
// (tests/integration/envelope-commands.test.ts).

type QueryResult = { data: unknown; error: PostgrestError | null };

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

/**
 * A supabase-js-shaped fake routing each awaited query by (table, chain shape):
 *   - monthly_ledger, any                → ledger.findById  (routes.ledger)
 *   - envelope + insert                  → envelope.insert  (routes.envelopeWrite)
 *   - envelope + update                  → envelope.update / updateStatus (routes.envelopeWrite)
 *   - envelope + delete                  → envelope.delete  (routes.envelopeDelete)
 *   - envelope, otherwise (select)       → envelope.findById (routes.envelopeFind)
 * Records the op order in `ops` and every insert/update payload in `writeArgs`.
 */
function makeClient(routes: {
  ledger?: QueryResult;
  envelopeFind?: QueryResult;
  envelopeWrite?: QueryResult;
  envelopeDelete?: QueryResult;
}) {
  const ops: string[] = [];
  const writeArgs: Array<Record<string, unknown>> = [];
  const client = {
    from: (table: string) => {
      const recorded: Array<{ method: string; args: unknown[] }> = [];
      const builder: Record<string, unknown> = {};
      for (const m of [
        "select",
        "insert",
        "update",
        "delete",
        "eq",
        "order",
        "single",
        "maybeSingle",
      ]) {
        builder[m] = (...args: unknown[]) => {
          recorded.push({ method: m, args });
          return builder;
        };
      }
      // biome-ignore lint/suspicious/noThenProperty: deliberate query-builder stub
      builder.then = (resolve: (v: QueryResult) => void) => {
        const methods = recorded.map((r) => r.method);
        if (table === "monthly_ledger") {
          ops.push("ledger.find");
          return resolve(routes.ledger ?? { data: null, error: null });
        }
        if (methods.includes("insert")) {
          writeArgs.push(
            recorded.find((r) => r.method === "insert")?.args[0] as Record<string, unknown>,
          );
          ops.push("envelope.insert");
          return resolve(routes.envelopeWrite ?? { data: envelopeRow(), error: null });
        }
        if (methods.includes("update")) {
          writeArgs.push(
            recorded.find((r) => r.method === "update")?.args[0] as Record<string, unknown>,
          );
          ops.push("envelope.update");
          return resolve(routes.envelopeWrite ?? { data: envelopeRow(), error: null });
        }
        if (methods.includes("delete")) {
          ops.push("envelope.delete");
          return resolve(routes.envelopeDelete ?? { data: null, error: null });
        }
        ops.push("envelope.find");
        return resolve(routes.envelopeFind ?? { data: null, error: null });
      };
      return builder;
    },
  };
  return { client: client as unknown as FinanceClient, ops, writeArgs };
}

const L = "11111111-1111-1111-1111-111111111111";
const C = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const ENV = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

describe("createEnvelope", () => {
  test("writes a manual, pending line (status pending, paidAt null) on a mutable ledger", async () => {
    const { client, ops, writeArgs } = makeClient({
      ledger: { data: ledgerRow(), error: null },
      envelopeWrite: { data: envelopeRow(), error: null },
    });
    const result = await createEnvelopeCommands(client).createEnvelope({
      ledgerId: L,
      category: C,
      item: "Netflix",
      amount: decodeMoney("19.90"),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.status).toBe("pending");
      expect(result.envelope.paidAt).toBeNull();
    }
    expect(ops).toEqual(["ledger.find", "envelope.insert"]);
    const insert = writeArgs[0];
    expect(insert?.status).toBe("pending");
    expect(insert?.paid_at).toBeNull();
    // Manual-only columns are omitted (the repository never writes them).
    expect(insert).not.toHaveProperty("template_id");
    expect(insert).not.toHaveProperty("original_amount");
  });

  test("rejects ledger_not_found with NO write when the parent ledger is null (RLS)", async () => {
    const { client, ops } = makeClient({ ledger: { data: null, error: null } });
    const result = await createEnvelopeCommands(client).createEnvelope({
      ledgerId: "missing",
      category: C,
      item: "X",
      amount: decodeMoney("10.00"),
    });
    expect(result).toEqual({ ok: false, reason: "ledger_not_found" });
    expect(ops).toEqual(["ledger.find"]); // no insert
  });

  test("rejects ledger_not_mutable with NO write on a settled ledger", async () => {
    const { client, ops } = makeClient({
      ledger: {
        data: ledgerRow({ status: "settled", settled_at: "2027-02-01T00:00:00Z" }),
        error: null,
      },
    });
    const result = await createEnvelopeCommands(client).createEnvelope({
      ledgerId: L,
      category: C,
      item: "X",
      amount: decodeMoney("10.00"),
    });
    expect(result).toEqual({ ok: false, reason: "ledger_not_mutable" });
    expect(ops).toEqual(["ledger.find"]);
  });

  test("rejects negative_amount with NO write (checked via compareMoney)", async () => {
    const { client, ops } = makeClient({ ledger: { data: ledgerRow(), error: null } });
    const result = await createEnvelopeCommands(client).createEnvelope({
      ledgerId: L,
      category: C,
      item: "Bad",
      amount: decodeMoney("-5.00"),
    });
    expect(result).toEqual({ ok: false, reason: "negative_amount" });
    expect(ops).toEqual(["ledger.find"]);
  });

  test("throws FinanceDataError('foreign_key_violation') for a bad/unowned category — not a result", async () => {
    const { client } = makeClient({
      ledger: { data: ledgerRow(), error: null },
      envelopeWrite: {
        data: null,
        error: pgError({
          code: "23503",
          message: 'violates foreign key constraint "fk_envelope_category"',
        }),
      },
    });
    const promise = createEnvelopeCommands(client).createEnvelope({
      ledgerId: L,
      category: "not-owned",
      item: "Y",
      amount: decodeMoney("10.00"),
    });
    await expect(promise).rejects.toBeInstanceOf(FinanceDataError);
    await expect(promise).rejects.toMatchObject({ code: "foreign_key_violation" });
  });
});

describe("editEnvelope", () => {
  test("updates only present line fields on a mutable ledger; never touches status/paidAt", async () => {
    const { client, ops, writeArgs } = makeClient({
      envelopeFind: {
        data: envelopeRow({ status: "paid", paid_at: "2027-01-06T09:00:00Z" }),
        error: null,
      },
      ledger: { data: ledgerRow(), error: null },
      envelopeWrite: {
        data: envelopeRow({ status: "paid", amount: "22.90" as unknown as number }),
        error: null,
      },
    });
    const result = await createEnvelopeCommands(client).editEnvelope({
      envelopeId: ENV,
      amount: decodeMoney("22.90"),
    });
    expect(result.ok).toBe(true);
    expect(ops).toEqual(["envelope.find", "ledger.find", "envelope.update"]);
    const update = writeArgs[0];
    expect(update).toEqual({ amount: "22.90" as unknown as number });
    expect(update).not.toHaveProperty("status");
    expect(update).not.toHaveProperty("paid_at");
  });

  test("rejects envelope_not_found with NO write", async () => {
    const { client, ops } = makeClient({ envelopeFind: { data: null, error: null } });
    const result = await createEnvelopeCommands(client).editEnvelope({
      envelopeId: "missing",
      item: "X",
    });
    expect(result).toEqual({ ok: false, reason: "envelope_not_found" });
    expect(ops).toEqual(["envelope.find"]);
  });

  test("rejects ledger_not_mutable with NO write when the parent is settled", async () => {
    const { client, ops } = makeClient({
      envelopeFind: { data: envelopeRow(), error: null },
      ledger: {
        data: ledgerRow({ status: "settled", settled_at: "2027-02-01T00:00:00Z" }),
        error: null,
      },
    });
    const result = await createEnvelopeCommands(client).editEnvelope({
      envelopeId: ENV,
      item: "X",
    });
    expect(result).toEqual({ ok: false, reason: "ledger_not_mutable" });
    expect(ops).toEqual(["envelope.find", "ledger.find"]);
  });

  test("rejects negative_amount with NO write", async () => {
    const { client, ops } = makeClient({
      envelopeFind: { data: envelopeRow(), error: null },
      ledger: { data: ledgerRow(), error: null },
    });
    const result = await createEnvelopeCommands(client).editEnvelope({
      envelopeId: ENV,
      amount: decodeMoney("-1.00"),
    });
    expect(result).toEqual({ ok: false, reason: "negative_amount" });
    expect(ops).toEqual(["envelope.find", "ledger.find"]);
  });

  test("no-op when no line fields are supplied — returns the found envelope, NO write", async () => {
    const found = envelopeRow({ id: ENV });
    const { client, ops } = makeClient({
      envelopeFind: { data: found, error: null },
      ledger: { data: ledgerRow(), error: null },
    });
    const result = await createEnvelopeCommands(client).editEnvelope({ envelopeId: ENV });
    expect(result.ok).toBe(true);
    expect(result.ok && result.envelope.id).toBe(ENV);
    // No envelope.update — the fast-path returns the found row unchanged.
    expect(ops).toEqual(["envelope.find", "ledger.find"]);
  });
});

describe("setEnvelopeStatus — paidAt via applyStatusTransition", () => {
  test("→ paid sets paidAt to `now`", async () => {
    const { client, writeArgs } = makeClient({
      envelopeFind: { data: envelopeRow({ status: "pending" }), error: null },
      ledger: { data: ledgerRow(), error: null },
      envelopeWrite: {
        data: envelopeRow({ status: "paid", paid_at: "2027-01-06T09:00:00Z" }),
        error: null,
      },
    });
    const result = await createEnvelopeCommands(client).setEnvelopeStatus({
      envelopeId: ENV,
      status: "paid",
      now: "2027-01-06T09:00:00Z",
    });
    expect(result.ok).toBe(true);
    expect(writeArgs[0]).toEqual({ status: "paid", paid_at: "2027-01-06T09:00:00Z" });
  });

  test("→ a non-paid status clears paidAt (and translates carried-over via the seam)", async () => {
    const { client, writeArgs } = makeClient({
      envelopeFind: {
        data: envelopeRow({ status: "paid", paid_at: "2027-01-06T09:00:00Z" }),
        error: null,
      },
      ledger: { data: ledgerRow(), error: null },
      envelopeWrite: { data: envelopeRow({ status: "carried_over" }), error: null },
    });
    const result = await createEnvelopeCommands(client).setEnvelopeStatus({
      envelopeId: ENV,
      status: "carried-over",
      now: "2027-01-31T00:00:00Z",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.status).toBe("carried-over");
      expect(result.envelope.carryOverReason).toBeNull(); // inert label — no reason
    }
    expect(writeArgs[0]).toEqual({ status: "carried_over", paid_at: null });
  });

  test("rejects envelope_not_found with NO write", async () => {
    const { client, ops } = makeClient({ envelopeFind: { data: null, error: null } });
    const result = await createEnvelopeCommands(client).setEnvelopeStatus({
      envelopeId: "missing",
      status: "paid",
      now: "T",
    });
    expect(result).toEqual({ ok: false, reason: "envelope_not_found" });
    expect(ops).toEqual(["envelope.find"]);
  });

  test("rejects ledger_not_mutable with NO write on a settled parent", async () => {
    const { client, ops } = makeClient({
      envelopeFind: { data: envelopeRow(), error: null },
      ledger: {
        data: ledgerRow({ status: "settled", settled_at: "2027-02-01T00:00:00Z" }),
        error: null,
      },
    });
    const result = await createEnvelopeCommands(client).setEnvelopeStatus({
      envelopeId: ENV,
      status: "paid",
      now: "T",
    });
    expect(result).toEqual({ ok: false, reason: "ledger_not_mutable" });
    expect(ops).toEqual(["envelope.find", "ledger.find"]);
  });
});

describe("deleteEnvelope", () => {
  test("deletes on a mutable ledger", async () => {
    const { client, ops } = makeClient({
      envelopeFind: { data: envelopeRow(), error: null },
      ledger: { data: ledgerRow(), error: null },
      envelopeDelete: { data: null, error: null },
    });
    const result = await createEnvelopeCommands(client).deleteEnvelope({ envelopeId: ENV });
    expect(result).toEqual({ ok: true });
    expect(ops).toEqual(["envelope.find", "ledger.find", "envelope.delete"]);
  });

  test("rejects envelope_not_found with NO write", async () => {
    const { client, ops } = makeClient({ envelopeFind: { data: null, error: null } });
    const result = await createEnvelopeCommands(client).deleteEnvelope({ envelopeId: "missing" });
    expect(result).toEqual({ ok: false, reason: "envelope_not_found" });
    expect(ops).toEqual(["envelope.find"]);
  });

  test("rejects ledger_not_mutable with NO write on a settled parent", async () => {
    const { client, ops } = makeClient({
      envelopeFind: { data: envelopeRow(), error: null },
      ledger: {
        data: ledgerRow({ status: "settled", settled_at: "2027-02-01T00:00:00Z" }),
        error: null,
      },
    });
    const result = await createEnvelopeCommands(client).deleteEnvelope({ envelopeId: ENV });
    expect(result).toEqual({ ok: false, reason: "ledger_not_mutable" });
    expect(ops).toEqual(["envelope.find", "ledger.find"]);
  });
});
