import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test";
import { decodeMonth } from "@nafios/datetime";
import type { PostgrestError } from "@nafios/supabase-core";
import { decodeMoney } from "../../src/domain";
import type { FinanceClient } from "../../src/internal/client";
import { createLedgerCommands } from "../../src/internal/commands/ledger-commands";
import { FinanceDataError } from "../../src/internal/errors";
import type { LedgerRow } from "../../src/internal/repositories/ledger.repo";

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
    opening_balance: "7152.35",
    max_capped: "6415.00",
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
 * uses): `.insert()` → insert; `.update({ status })` → updateStatus (keyed by the
 * target status, so the park and the compensation revert can be configured
 * independently); `.update({ opening_balance, max_capped })` → updateHeader (a
 * money patch rather than a status one); `.order()` → list; otherwise `.maybeSingle()` keyed by the filtered COLUMN —
 * `.eq("id", …)` → findById, `.eq("status", "ongoing")` → findOngoing. Records the
 * operation order in `ops`, the insert payloads in `insertArgs`, and the update
 * payloads in `updateArgs`.
 */
function makeClient(config: {
  list?: QueryResult;
  findOngoing?: QueryResult;
  findById?: QueryResult;
  insert?: QueryResult;
  updateStatus?: { reconciling?: QueryResult; ongoing?: QueryResult };
  updateHeader?: QueryResult;
}) {
  const ops: string[] = [];
  const insertArgs: Array<Record<string, unknown>> = [];
  const updateArgs: Array<Record<string, unknown>> = [];
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
          const payload = recorded.find((r) => r.method === "update")?.args[0] as Record<
            string,
            unknown
          >;
          updateArgs.push(payload);
          // A status-only patch is the park / compensation revert; a money patch
          // is the header edit.
          if (payload.status === undefined) {
            ops.push("updateHeader");
            return resolve(config.updateHeader ?? { data: ledgerRow(), error: null });
          }
          const status = payload.status as LedgerRow["status"];
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
        // Both single-row reads end `.eq(<col>, …).maybeSingle()`; the COLUMN is
        // what tells them apart — findById filters `id`, findOngoing `status`.
        const filtered = recorded.find((r) => r.method === "eq")?.args[0];
        if (filtered === "id") {
          ops.push("findById");
          return resolve(config.findById ?? { data: null, error: null });
        }
        ops.push("findOngoing");
        return resolve(config.findOngoing ?? { data: null, error: null });
      };
      return builder;
    },
  };
  return { client: client as unknown as FinanceClient, ops, insertArgs, updateArgs };
}

const JAN = decodeMonth("2027-01-01");
const FEB = decodeMonth("2027-02-01");
const SEP = decodeMonth("2027-09-01");

const OPENING = decodeMoney("7152.35");
const MAXCAP = decodeMoney("6415.00");
const AMBER = decodeMoney("7500.00"); // > opening, ≤ 2× → amber (draw 347.65)
const BLOCKED = decodeMoney("20000.00"); // > 2× opening → blocked
const NEGATIVE = decodeMoney("-1.00");

// `today` is NOT an input — the command reads it from @nafios/datetime's clock
// seam (the suite's sole `new Date()`, ADR-0028). Pin it with setSystemTime.
// Midday avoids any local-midnight ambiguity when deriving the calendar day.
const CURRENT_DAY = new Date(2027, 0, 15, 12, 0, 0); // 2027-01-15 — current Jan; next Feb NOT in window
const IN_WINDOW = new Date(2027, 0, 28, 12, 0, 0); // 2027-01-28 — next Feb IN window (31−28=3 < 7)

// Default the clock to current-Jan; the park/insert cases re-pin to IN_WINDOW.
beforeEach(() => {
  setSystemTime(CURRENT_DAY);
});
afterEach(() => {
  setSystemTime(); // restore the real clock
});

const BASE = {
  month: JAN,
  openingBalance: OPENING,
  maxCapped: MAXCAP,
  acknowledgedOverspend: false,
} as const;

// ─────────────────── Pre-write rejections — no write ───────────────────

describe("pre-write validation — returns { ok:false }, performs no write", () => {
  test("negative openingBalance → negative_amount, no query issued", async () => {
    const { client, ops } = makeClient({});
    const result = await createLedgerCommands(client).createLedger({
      ...BASE,
      openingBalance: NEGATIVE,
    });
    if (result.ok) throw new Error("expected rejection");
    expect(result.reason).toBe("negative_amount");
    expect(ops).toEqual([]); // no read, no write — the check is pure and first
  });

  test("negative maxCapped → negative_amount (second operand of the sign check)", async () => {
    const { client } = makeClient({});
    const result = await createLedgerCommands(client).createLedger({
      ...BASE,
      maxCapped: NEGATIVE,
    });
    if (result.ok) throw new Error("expected rejection");
    expect(result.reason).toBe("negative_amount");
  });

  test("amber maxCapped, not confirmed → overspend_warning, no query", async () => {
    const { client, ops } = makeClient({});
    const result = await createLedgerCommands(client).createLedger({
      ...BASE,
      maxCapped: AMBER,
      acknowledgedOverspend: false,
    });
    if (result.ok) throw new Error("expected rejection");
    expect(result.reason).toBe("overspend_warning");
    expect(ops).toEqual([]);
  });

  test("blocked maxCapped, acknowledgedOverspend:true → exceeds_hard_cap, NO override", async () => {
    const { client } = makeClient({});
    const result = await createLedgerCommands(client).createLedger({
      ...BASE,
      maxCapped: BLOCKED,
      acknowledgedOverspend: true,
    });
    if (result.ok) throw new Error("expected rejection");
    expect(result.reason).toBe("exceeds_hard_cap");
  });

  test("month not in the openable set → month_not_openable after the single list() read, no write", async () => {
    const { client, ops } = makeClient({ list: { data: [], error: null } });
    const result = await createLedgerCommands(client).createLedger({
      ...BASE,
      month: SEP, // neither current nor next
    });
    if (result.ok) throw new Error("expected rejection");
    expect(result.reason).toBe("month_not_openable");
    expect(ops).toEqual(["list"]); // read to resolve openable months, then no write
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
    const result = await createLedgerCommands(client).createLedger({ ...BASE });
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
    setSystemTime(IN_WINDOW); // next Feb is only openable inside the lead-day window
    const result = await createLedgerCommands(client).createLedger({
      ...BASE,
      month: FEB,
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
    setSystemTime(IN_WINDOW); // next Feb is only openable inside the lead-day window
    const promise = createLedgerCommands(client).createLedger({
      ...BASE,
      month: FEB,
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
    setSystemTime(IN_WINDOW); // next Feb is only openable inside the lead-day window
    const promise = createLedgerCommands(client).createLedger({
      ...BASE,
      month: FEB,
    });
    // The compensation error (08006 → unknown) is swallowed; the original
    // duplicate_month is what propagates.
    await expect(promise.catch((e) => (e as FinanceDataError).code)).resolves.toBe(
      "duplicate_month",
    );
    expect(ops).toEqual(["list", "findOngoing", "update:reconciling", "insert", "update:ongoing"]);
  });
});

// ───────────────── The header-edit fixtures ─────────────────
//
// The stored ledger is the default row: opening 7152.35, maxCapped 6415.00,
// status 'ongoing'. Against that stored ceiling a NEW opening balance lands:
//   8000.00 → 'ok'      (6415 ≤ 8000)
//   6000.00 → 'amber'   (6415 > 6000, but ≤ 2×6000 = 12000)
//   3000.00 → 'blocked' (6415 > 2×3000 = 6000) — no override

const ONGOING = ledgerRow({ id: "jan-id", status: "ongoing" });

const NEW_OK = decodeMoney("8000.00");
const NEW_AMBER = decodeMoney("6000.00");
const NEW_BLOCKED = decodeMoney("3000.00");

// ─────────────────── updateLedger — the both-fields gate stack ───────────────────
//
// One row, no park, no compensation — nothing to make atomic. So what these pin
// is the GATE STACK, its PRECEDENCE (every rejection must leave `ops` without a
// write), and what is SPECIFIC to taking a whole MonthlyLedger as input:
//   • the guardrail runs on the incoming PAIR — an edit that moves both fields is
//     legal as a whole even where either half against the stored other would fail;
//   • the status gate runs against the STORED row, never the caller's `status`;
//   • only the two money columns are written — `month` / `status` / timestamps on
//     the argument are ignored;
//   • the no-op fast path needs BOTH amounts unchanged.
//
// The stored fixture stays the default row: opening 7152.35, maxCapped 6415.00,
// status 'ongoing'.

function ledgerDomain(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "jan-id",
    month: JAN,
    openingBalance: OPENING,
    maxCapped: MAXCAP,
    status: "ongoing",
    createdAt: "2027-01-01T08:00:00.000Z",
    settledAt: null,
    ...overrides,
  } as Parameters<ReturnType<typeof createLedgerCommands>["updateLedger"]>[0];
}

describe("updateLedger — pre-write rejections (no write)", () => {
  test("rejects 'ledger_not_found' when the id is absent OR not owned (RLS null)", async () => {
    const { client, ops } = makeClient({ findById: { data: null, error: null } });
    const result = await createLedgerCommands(client).updateLedger(ledgerDomain({ id: "nope" }));
    expect(result).toEqual({ ok: false, reason: "ledger_not_found" });
    expect(ops).toEqual(["findById"]); // read only — nothing written
  });

  test("rejects 'ledger_not_ongoing' on a reconciling ledger — the header locks even though envelopes stay editable", async () => {
    const { client, ops } = makeClient({
      findById: { data: ledgerRow({ status: "reconciling" }), error: null },
    });
    const result = await createLedgerCommands(client).updateLedger(
      ledgerDomain({ openingBalance: NEW_OK }),
    );
    expect(result).toEqual({ ok: false, reason: "ledger_not_ongoing" });
    expect(ops).toEqual(["findById"]);
  });

  test("the STORED status decides the lock — a caller cannot smuggle status:'ongoing' past a settled ledger", async () => {
    const { client, ops } = makeClient({
      findById: {
        data: ledgerRow({ status: "settled", settled_at: "2027-02-01T00:00:00.000Z" }),
        error: null,
      },
    });
    // The argument claims 'ongoing' — the gate reads the row, not the argument.
    const result = await createLedgerCommands(client).updateLedger(
      ledgerDomain({ status: "ongoing", openingBalance: NEW_OK }),
    );
    expect(result).toEqual({ ok: false, reason: "ledger_not_ongoing" });
    expect(ops).toEqual(["findById"]);
  });

  test("rejects 'negative_amount' for a negative openingBalance, before the guardrail runs", async () => {
    const { client, ops } = makeClient({ findById: { data: ONGOING, error: null } });
    const result = await createLedgerCommands(client).updateLedger(
      ledgerDomain({ openingBalance: NEGATIVE }),
    );
    expect(result).toEqual({ ok: false, reason: "negative_amount" });
    expect(ops).toEqual(["findById"]);
  });

  test("rejects 'negative_amount' for a negative maxCapped too — BOTH amounts are checked", async () => {
    const { client, ops } = makeClient({ findById: { data: ONGOING, error: null } });
    const result = await createLedgerCommands(client).updateLedger(
      ledgerDomain({ maxCapped: NEGATIVE }),
    );
    expect(result).toEqual({ ok: false, reason: "negative_amount" });
    expect(ops).toEqual(["findById"]);
  });

  test("rejects 'overspend_warning' when the incoming PAIR lands in amber unacknowledged", async () => {
    const { client, ops } = makeClient({ findById: { data: ONGOING, error: null } });
    const result = await createLedgerCommands(client).updateLedger(
      ledgerDomain({ openingBalance: NEW_AMBER }), // 6000 opening vs 6415 ceiling
    );
    expect(result).toEqual({ ok: false, reason: "overspend_warning" });
    expect(ops).toEqual(["findById"]);
  });

  test("rejects 'exceeds_hard_cap' on a blocked PAIR — acknowledgement does NOT rescue it", async () => {
    const { client, ops } = makeClient({ findById: { data: ONGOING, error: null } });
    const result = await createLedgerCommands(client).updateLedger(
      ledgerDomain({ openingBalance: NEW_BLOCKED }), // 6415 > 2×3000
      true, // acknowledged — irrelevant in the blocked zone
    );
    expect(result).toEqual({ ok: false, reason: "exceeds_hard_cap" });
    expect(ops).toEqual(["findById"]);
  });

  test("the status gate outranks the value checks — a locked ledger rejects 'ledger_not_ongoing', not 'negative_amount'", async () => {
    const { client } = makeClient({
      findById: { data: ledgerRow({ status: "settled" }), error: null },
    });
    const result = await createLedgerCommands(client).updateLedger(
      ledgerDomain({ openingBalance: NEGATIVE }),
    );
    expect(result).toEqual({ ok: false, reason: "ledger_not_ongoing" });
  });
});

describe("updateLedger — the write", () => {
  test("writes BOTH encoded money columns and nothing else, returning the header as written", async () => {
    const written = ledgerRow({ id: "jan-id", opening_balance: "9000.00", max_capped: "8000.00" });
    const { client, ops, updateArgs } = makeClient({
      findById: { data: ONGOING, error: null },
      updateHeader: { data: written, error: null },
    });
    const result = await createLedgerCommands(client).updateLedger(
      ledgerDomain({ openingBalance: decodeMoney("9000.00"), maxCapped: decodeMoney("8000.00") }),
    );
    expect(result.ok).toBe(true);
    expect(result.ok && result.ledger.openingBalance).toEqual(decodeMoney("9000.00"));
    expect(result.ok && result.ledger.maxCapped).toEqual(decodeMoney("8000.00"));
    // Exactly the two editable columns — no month, no status, no timestamps.
    expect(updateArgs).toEqual([{ opening_balance: "9000.00", max_capped: "8000.00" }]);
    expect(ops).toEqual(["findById", "updateHeader"]);
  });

  test("a PAIR that moves together passes where either half against the stored other would fail", async () => {
    // Stored: opening 7152.35 / ceiling 6415.00.
    // Ceiling → 9000 against the STORED opening would be amber (9000 > 7152.35);
    // opening → 10000 against the STORED ceiling is fine. As a PAIR, 6415→9000 with
    // 7152.35→10000 is plain green (9000 ≤ 10000) — no acknowledgement needed.
    const written = ledgerRow({ opening_balance: "10000.00", max_capped: "9000.00" });
    const { client, ops } = makeClient({
      findById: { data: ONGOING, error: null },
      updateHeader: { data: written, error: null },
    });
    const result = await createLedgerCommands(client).updateLedger(
      ledgerDomain({
        openingBalance: decodeMoney("10000.00"),
        maxCapped: decodeMoney("9000.00"),
      }),
    );
    expect(result.ok).toBe(true);
    expect(ops).toEqual(["findById", "updateHeader"]);
  });

  test("amber PAIR WITH acknowledgement: the gate lifts and the write lands", async () => {
    const written = ledgerRow({ opening_balance: "6000.00", max_capped: "6415.00" });
    const { client, ops } = makeClient({
      findById: { data: ONGOING, error: null },
      updateHeader: { data: written, error: null },
    });
    const result = await createLedgerCommands(client).updateLedger(
      ledgerDomain({ openingBalance: NEW_AMBER }),
      true,
    );
    expect(result.ok).toBe(true);
    expect(result.ok && result.ledger.openingBalance).toEqual(decodeMoney("6000.00"));
    expect(ops).toEqual(["findById", "updateHeader"]);
  });

  test("a maxCapped-only edit still writes both columns in ONE update — never a half-applied header", async () => {
    const written = ledgerRow({ max_capped: "5000.00" });
    const { client, ops, updateArgs } = makeClient({
      findById: { data: ONGOING, error: null },
      updateHeader: { data: written, error: null },
    });
    const result = await createLedgerCommands(client).updateLedger(
      ledgerDomain({ maxCapped: decodeMoney("5000.00") }),
    );
    expect(result.ok).toBe(true);
    expect(updateArgs).toEqual([{ opening_balance: "7152.35", max_capped: "5000.00" }]);
    expect(ops).toEqual(["findById", "updateHeader"]);
  });

  test("no-op fast path: BOTH amounts unchanged skips the UPDATE and returns the ledger already read", async () => {
    const { client, ops } = makeClient({ findById: { data: ONGOING, error: null } });
    // A trailing-zero variant of the SAME ceiling — compared via compareMoney,
    // so "6415" and the stored "6415.00" are one value.
    const result = await createLedgerCommands(client).updateLedger(
      ledgerDomain({ maxCapped: decodeMoney("6415") }),
    );
    expect(result.ok).toBe(true);
    expect(result.ok && result.ledger.id).toBe("jan-id");
    expect(ops).toEqual(["findById"]); // no write reached PostgREST
  });

  test("month / status / timestamps on the argument are IGNORED — only the money columns move", async () => {
    const { client, updateArgs } = makeClient({
      findById: { data: ONGOING, error: null },
      updateHeader: { data: ledgerRow({ opening_balance: "8000.00" }), error: null },
    });
    const result = await createLedgerCommands(client).updateLedger(
      ledgerDomain({
        openingBalance: NEW_OK,
        month: SEP, // a different month — immutable once opened
        status: "settled", // never a transition on this path
        settledAt: "2027-09-30T00:00:00.000Z",
      }),
    );
    expect(result.ok).toBe(true);
    expect(updateArgs).toEqual([{ opening_balance: "8000.00", max_capped: "6415.00" }]);
  });

  test("a DB failure on the UPDATE throws FinanceDataError (not a rejection)", async () => {
    const { client } = makeClient({
      findById: { data: ONGOING, error: null },
      updateHeader: {
        data: null,
        error: pgError({
          code: "23514",
          message: 'violates check constraint "ck_balances_nonneg"',
        }),
      },
    });
    const promise = createLedgerCommands(client).updateLedger(
      ledgerDomain({ openingBalance: NEW_OK }),
    );
    await expect(promise).rejects.toBeInstanceOf(FinanceDataError);
    await expect(promise.catch((e) => (e as FinanceDataError).code)).resolves.toBe(
      "check_violation",
    );
  });

  test("a DB failure on the READ throws FinanceDataError before any write", async () => {
    const { client, ops } = makeClient({
      findById: { data: null, error: pgError({ code: "08006", message: "connection lost" }) },
    });
    await expect(
      createLedgerCommands(client).updateLedger(ledgerDomain({ openingBalance: NEW_OK })),
    ).rejects.toBeInstanceOf(FinanceDataError);
    expect(ops).toEqual(["findById"]);
  });
});
