import { describe, expect, test } from "bun:test";
import type { PostgrestError } from "@nafios/supabase-core";
import { CodecError, decodeMoney, decodeMonth } from "../../src/domain";
import type { FinanceClient } from "../../src/internal/client";
import { createLedgerCommands } from "../../src/internal/commands/create-ledger";
import { FinanceDataError } from "../../src/internal/errors";
import type { LedgerRow } from "../../src/internal/mappers/ledger.mapper";

// UNIT tests over the create-ledger command's COMPOSITION + ORDERING against a
// FAKE client — no live DB. They pin the three pre-write rejections (no write),
// the fresh-insert vs park-then-insert shapes, and the compensation-on-failure
// path (revert the park, re-throw the ORIGINAL insert error). The full §6
// behavior (real RLS, real 23505 split, the atomic transition end-to-end against
// two seeded users) is proven by the repo-root live matrix
// (tests/integration/create-ledger.test.ts).

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
 * A supabase-js-shaped fake client that routes each awaited query to a result by
 * the SHAPE of the chain the command builds (the same disambiguation the repo
 * uses): `.insert()` → insert; `.update()` → updateStatus (keyed by the target
 * status, so the park and the compensation revert can be configured
 * independently); `.order()` → list; otherwise `.maybeSingle()` → findOngoing.
 * Records the operation order in `ops` and the insert payloads in `insertArgs`.
 */
function makeClient(config: {
  list?: QueryResult;
  findOngoing?: QueryResult;
  insert?: QueryResult;
  updateStatus?: { reconciling?: QueryResult; ongoing?: QueryResult };
}) {
  const ops: string[] = [];
  const insertArgs: Array<Record<string, unknown>> = [];
  const client = {
    from: (_table: string) => {
      const recorded: Array<{ method: string; args: unknown[] }> = [];
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "insert", "update", "eq", "order", "single", "maybeSingle"]) {
        builder[method] = (...args: unknown[]) => {
          recorded.push({ method, args });
          return builder;
        };
      }
      // Thenable: awaiting the builder at any terminal resolves to the routed
      // result — that IS how the real PostgREST builder executes.
      // biome-ignore lint/suspicious/noThenProperty: deliberate query-builder stub
      builder.then = (resolve: (v: QueryResult) => void) => {
        const methods = recorded.map((r) => r.method);
        if (methods.includes("insert")) {
          insertArgs.push(
            recorded.find((r) => r.method === "insert")?.args[0] as Record<string, unknown>,
          );
          ops.push("insert");
          return resolve(config.insert ?? { data: ledgerRow(), error: null });
        }
        if (methods.includes("update")) {
          const status = (
            recorded.find((r) => r.method === "update")?.args[0] as {
              status: LedgerRow["status"];
            }
          ).status;
          ops.push(`update:${status}`);
          const configured =
            status === "reconciling"
              ? config.updateStatus?.reconciling
              : config.updateStatus?.ongoing;
          return resolve(configured ?? { data: ledgerRow({ status }), error: null });
        }
        if (methods.includes("order")) {
          ops.push("list");
          return resolve(config.list ?? { data: [], error: null });
        }
        ops.push("findOngoing");
        return resolve(config.findOngoing ?? { data: null, error: null });
      };
      return builder;
    },
  };
  return { client: client as unknown as FinanceClient, ops, insertArgs };
}

const JAN = decodeMonth("2027-01-01");
const FEB = decodeMonth("2027-02-01");
const SEP = decodeMonth("2027-09-01");

const OPENING = decodeMoney("7152.35");
const MAXCAP = decodeMoney("6415.00");
const AMBER = decodeMoney("7500.00"); // > opening, ≤ 2× → amber (draw 347.65)
const BLOCKED = decodeMoney("20000.00"); // > 2× opening → blocked
const NEGATIVE = decodeMoney("-1.00");

const CURRENT_DAY = "2027-01-15"; // current Jan; next Feb NOT in window
const IN_WINDOW = "2027-01-28"; // next Feb IN window (31−28=3 < 7)

const BASE = { month: JAN, openingBalance: OPENING, maxCapped: MAXCAP, confirmed: false } as const;

// ─────────────────── Pre-write rejections — no write ───────────────────

describe("pre-write validation — returns { ok:false }, performs no write", () => {
  test("negative openingBalance → negative_amount, guardrail null, no query issued", async () => {
    const { client, ops } = makeClient({});
    const result = await createLedgerCommands(client).createLedger({
      ...BASE,
      openingBalance: NEGATIVE,
      today: CURRENT_DAY,
    });
    if (result.ok) throw new Error("expected rejection");
    expect(result.reason).toBe("negative_amount");
    expect(result.guardrail).toBeNull();
    expect(ops).toEqual([]); // no read, no write — the check is pure and first
  });

  test("negative maxCapped → negative_amount (second operand of the sign check)", async () => {
    const { client } = makeClient({});
    const result = await createLedgerCommands(client).createLedger({
      ...BASE,
      maxCapped: NEGATIVE,
      today: CURRENT_DAY,
    });
    if (result.ok) throw new Error("expected rejection");
    expect(result.reason).toBe("negative_amount");
  });

  test("amber maxCapped, not confirmed → requires_confirmation, guardrail travels, no query", async () => {
    const { client, ops } = makeClient({});
    const result = await createLedgerCommands(client).createLedger({
      ...BASE,
      maxCapped: AMBER,
      confirmed: false,
      today: CURRENT_DAY,
    });
    if (result.ok) throw new Error("expected rejection");
    expect(result.reason).toBe("requires_confirmation");
    expect(result.guardrail?.zone).toBe("amber");
    expect(ops).toEqual([]);
  });

  test("blocked maxCapped, confirmed:true → exceeds_hard_cap, NO override", async () => {
    const { client } = makeClient({});
    const result = await createLedgerCommands(client).createLedger({
      ...BASE,
      maxCapped: BLOCKED,
      confirmed: true,
      today: CURRENT_DAY,
    });
    if (result.ok) throw new Error("expected rejection");
    expect(result.reason).toBe("exceeds_hard_cap");
    expect(result.guardrail?.zone).toBe("blocked");
  });

  test("month not in the openable set → month_not_openable after the single list() read, no write", async () => {
    const { client, ops } = makeClient({ list: { data: [], error: null } });
    const result = await createLedgerCommands(client).createLedger({
      ...BASE,
      month: SEP, // neither current nor next
      today: CURRENT_DAY,
    });
    if (result.ok) throw new Error("expected rejection");
    expect(result.reason).toBe("month_not_openable");
    expect(result.guardrail).toBeNull();
    expect(ops).toEqual(["list"]); // read to resolve openable months, then no write
  });

  test("malformed `today` throws CodecError (programming error, not a result rejection)", async () => {
    const { client } = makeClient({ list: { data: [], error: null } });
    await expect(
      createLedgerCommands(client).createLedger({ ...BASE, today: "2027-13-01" }),
    ).rejects.toBeInstanceOf(CodecError);
  });
});

// ─────────────────── Opening a month — the two shapes ───────────────────

describe("open a month", () => {
  test("no ongoing to park → single insert, parkedLedgerId null; insert never sets user_id", async () => {
    const { client, ops, insertArgs } = makeClient({
      list: { data: [], error: null },
      findOngoing: { data: null, error: null },
      insert: { data: ledgerRow({ status: "ongoing" }), error: null },
    });
    const result = await createLedgerCommands(client).createLedger({ ...BASE, today: CURRENT_DAY });
    if (!result.ok) throw new Error("expected ok");
    expect(result.parkedLedgerId).toBeNull();
    expect(ops).toEqual(["list", "findOngoing", "insert"]); // no park
    expect(insertArgs[0]).not.toHaveProperty("user_id");
    expect(insertArgs[0]?.status).toBe("ongoing");
  });

  test("an ongoing exists → park FIRST (reconciling) then insert; parkedLedgerId is the parked id", async () => {
    const { client, ops } = makeClient({
      list: { data: [ledgerRow({ status: "ongoing" })], error: null },
      findOngoing: { data: ledgerRow({ id: "jan-id", status: "ongoing" }), error: null },
      insert: { data: ledgerRow({ id: "feb-id", month: "2027-02-01" }), error: null },
    });
    const result = await createLedgerCommands(client).createLedger({
      ...BASE,
      month: FEB,
      today: IN_WINDOW,
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.parkedLedgerId).toBe("jan-id");
    // park precedes the insert — the uq_one_ongoing_ledger ordering requirement.
    expect(ops).toEqual(["list", "findOngoing", "update:reconciling", "insert"]);
  });
});

// ─────────────────── Compensation — all-or-nothing on failure ───────────────────

describe("compensation on a failed insert", () => {
  test("insert throws → revert the park (→ ongoing), then re-throw the ORIGINAL FinanceDataError", async () => {
    const { client, ops } = makeClient({
      list: { data: [ledgerRow({ status: "ongoing" })], error: null },
      findOngoing: { data: ledgerRow({ id: "jan-id", status: "ongoing" }), error: null },
      insert: {
        data: null,
        error: pgError({
          code: "23505",
          message: 'violates unique constraint "uq_ledger_user_month"',
        }),
      },
      updateStatus: { ongoing: { data: ledgerRow({ status: "ongoing" }), error: null } },
    });
    const promise = createLedgerCommands(client).createLedger({
      ...BASE,
      month: FEB,
      today: IN_WINDOW,
    });
    await expect(promise).rejects.toBeInstanceOf(FinanceDataError);
    await expect(promise.catch((e) => (e as FinanceDataError).code)).resolves.toBe(
      "duplicate_month",
    );
    // Parked (reconciling), the insert failed, then the park was reverted to
    // ongoing before the throw — the all-or-nothing observable outcome.
    expect(ops).toEqual(["list", "findOngoing", "update:reconciling", "insert", "update:ongoing"]);
  });

  test("compensation itself failing is swallowed — the ORIGINAL insert error still surfaces (self-heals on retry)", async () => {
    const { client, ops } = makeClient({
      list: { data: [ledgerRow({ status: "ongoing" })], error: null },
      findOngoing: { data: ledgerRow({ id: "jan-id", status: "ongoing" }), error: null },
      insert: {
        data: null,
        error: pgError({
          code: "23505",
          message: 'violates unique constraint "uq_ledger_user_month"',
        }),
      },
      updateStatus: {
        reconciling: { data: ledgerRow({ status: "reconciling" }), error: null },
        ongoing: { data: null, error: pgError({ code: "08006", message: "connection lost" }) },
      },
    });
    const promise = createLedgerCommands(client).createLedger({
      ...BASE,
      month: FEB,
      today: IN_WINDOW,
    });
    // The compensation error (08006 → unknown) is swallowed; the original
    // duplicate_month is what propagates.
    await expect(promise.catch((e) => (e as FinanceDataError).code)).resolves.toBe(
      "duplicate_month",
    );
    expect(ops).toEqual(["list", "findOngoing", "update:reconciling", "insert", "update:ongoing"]);
  });
});
