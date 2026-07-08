/**
 * Ledger repository — live-DB verification matrix (EF3.6 §6).
 *
 * NON-GATING. Like the connection-spine matrix, this suite needs a live local
 * Supabase and is run ONLY via `bun run test:integration`
 * (`bun test tests/integration/`), which `bun run check` never calls — there is
 * no live Supabase in CI. It proves what the mocked unit tests cannot: real RLS
 * isolation, the real 23505 constraint split (duplicate_month vs ongoing_exists),
 * real CHECK failures, and the DB-default `auth.uid()` insert path — against two
 * seeded users.
 *
 * Prerequisites (run by the operator — all Supabase CLI commands are manual):
 *   1. `supabase db reset`  — replays migrations + seeds two users
 *      (test@nafios.local / test-b@nafios.local, both password `password123`).
 *   2. Export env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 *   3. `bun run test:integration`.
 *
 * With any of those env vars missing the suite SKIPS. `beforeEach` wipes both
 * seeded users' ledgers via the service client, so every test starts from a
 * clean slate (the "at most one ongoing" invariant is global per user) and the
 * matrix is idempotent across runs.
 *
 * DOCUMENTED IMPORT-BOUNDARY EXCEPTION. `createLedgerRepository` and
 * `mapPostgrestError` are package-internal by design (EF3.6 §2) — the barrel
 * does not advertise them. This NON-GATING, test-only live matrix reaches them
 * via a relative path into `@nafios/finance`'s `src/internal/`, a deliberate
 * exception to the "never import another package's internal/" rule
 * (conventions.md): the spec keeps the factory internal, yet the matrix needs
 * it, and it cannot live in-package (loading the real cross-package clients into
 * the finance coverage run would trip the per-file 90% gate — ADR-0020). Both
 * the reach-in and the lane placement are recorded in the finance package
 * CLAUDE.md and the EF3.6 ticket. Not to be imitated by production code.
 */
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { asDb } from "@nafios/database";
import {
  createServiceClient,
  decodeMoney,
  decodeMonth,
  encodeMoney,
  encodeMonth,
  type FinanceClient,
  FinanceDataError,
} from "@nafios/finance";
import { createAuthedClient } from "@nafios/supabase-core";
import { mapPostgrestError } from "../../packages/finance/src/internal/errors";
import {
  createLedgerRepository,
  type LedgerRepository,
} from "../../packages/finance/src/internal/repositories/ledger.repo";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const HAS_ENV = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);

// Seeded users (supabase/seed.sql).
const USER_A = "00000000-0000-0000-0000-000000000001";
const USER_B = "00000000-0000-0000-0000-000000000002";
const PASSWORD = "password123";

// The Jan 2027 anchor (EF3 epic / §5) and neighbouring months.
const JAN = decodeMonth("2027-01-01");
const FEB = decodeMonth("2027-02-01");
const MAR = decodeMonth("2027-03-01");
const SEP = decodeMonth("2027-09-01");

const OPENING = decodeMoney("7152.35");
const MAXCAP = decodeMoney("6415.00");

async function signIn(email: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY as string, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const json = (await res.json()) as { access_token?: string; error_description?: string };
  if (!json.access_token) {
    throw new Error(`sign-in failed for ${email}: ${json.error_description ?? res.status}`);
  }
  return json.access_token;
}

describe.skipIf(!HAS_ENV)("ledger repository — verification matrix (live DB)", () => {
  let authedA: FinanceClient;
  let authedB: FinanceClient;
  let service: FinanceClient;
  let repoA: LedgerRepository;
  let repoB: LedgerRepository;

  async function cleanup() {
    await service.from("monthly_ledger").delete().in("user_id", [USER_A, USER_B]);
  }

  beforeAll(async () => {
    const [tokenA, tokenB] = await Promise.all([
      signIn("test@nafios.local"),
      signIn("test-b@nafios.local"),
    ]);
    authedA = asDb(createAuthedClient(tokenA));
    authedB = asDb(createAuthedClient(tokenB));
    service = createServiceClient();
    repoA = createLedgerRepository(authedA);
    repoB = createLedgerRepository(authedB);
  });

  beforeEach(cleanup);

  // ─────────────────────── Round-trip mapping & CRUD ───────────────────────

  test("row 1 — insert valid Jan 2027, status omitted → ongoing, unsettled, DB-defaulted fields present", async () => {
    const created = await repoA.insert({ month: JAN, openingBalance: OPENING, maxCapped: MAXCAP });
    expect(created.status).toBe("ongoing");
    expect(created.settledAt).toBeNull();
    expect(created.id).toBeTruthy();
    expect(created.createdAt).toBeTruthy();
  });

  test("row 2 — read back re-encodes month/opening/maxCapped exactly (money never floated)", async () => {
    const created = await repoA.insert({ month: JAN, openingBalance: OPENING, maxCapped: MAXCAP });
    const read = await repoA.findById(created.id);
    if (!read) throw new Error("expected the Jan ledger to be found");
    expect(encodeMonth(read.month)).toBe("2027-01-01");
    expect(encodeMoney(read.openingBalance)).toBe("7152.35");
    expect(encodeMoney(read.maxCapped)).toBe("6415.00");
  });

  test("row 3 — findOngoing returns the sole ongoing ledger", async () => {
    const created = await repoA.insert({ month: JAN, openingBalance: OPENING, maxCapped: MAXCAP });
    expect((await repoA.findOngoing())?.id).toBe(created.id);
  });

  test("row 4 — findByMonth: present month → header, absent month → null", async () => {
    const created = await repoA.insert({ month: JAN, openingBalance: OPENING, maxCapped: MAXCAP });
    expect((await repoA.findByMonth(JAN))?.id).toBe(created.id);
    expect(await repoA.findByMonth(SEP)).toBeNull();
  });

  test("row 5 — findById: own id → header, random uuid → null", async () => {
    const created = await repoA.insert({ month: JAN, openingBalance: OPENING, maxCapped: MAXCAP });
    expect((await repoA.findById(created.id))?.id).toBe(created.id);
    expect(await repoA.findById("00000000-0000-0000-0000-0000000000ff")).toBeNull();
  });

  test("row 6 — list is chronological (park Jan, then open Mar)", async () => {
    const jan = await repoA.insert({ month: JAN, openingBalance: OPENING, maxCapped: MAXCAP });
    await repoA.updateStatus(jan.id, "reconciling");
    await repoA.insert({ month: MAR, openingBalance: OPENING, maxCapped: MAXCAP });
    expect((await repoA.list()).map((l) => encodeMonth(l.month))).toEqual([
      "2027-01-01",
      "2027-03-01",
    ]);
  });

  test("row 7 — delete then findById → null", async () => {
    const created = await repoA.insert({ month: JAN, openingBalance: OPENING, maxCapped: MAXCAP });
    await repoA.delete(created.id);
    expect(await repoA.findById(created.id)).toBeNull();
  });

  // ─────────────────────── Uniqueness & the 23505 split ───────────────────────

  test("row 8 — same (user, month) again → duplicate_month / uq_ledger_user_month", async () => {
    const jan = await repoA.insert({ month: JAN, openingBalance: OPENING, maxCapped: MAXCAP });
    // Park it so the SECOND insert fails on the month uniqueness, not the ongoing one.
    await repoA.updateStatus(jan.id, "reconciling");
    try {
      await repoA.insert({ month: JAN, openingBalance: OPENING, maxCapped: MAXCAP });
      throw new Error("expected duplicate_month");
    } catch (e) {
      expect(e).toBeInstanceOf(FinanceDataError);
      expect((e as FinanceDataError).code).toBe("duplicate_month");
      expect((e as FinanceDataError).constraint).toBe("uq_ledger_user_month");
    }
  });

  test("row 9 — a second ongoing (different month) → ongoing_exists / uq_one_ongoing_ledger", async () => {
    await repoA.insert({ month: JAN, openingBalance: OPENING, maxCapped: MAXCAP });
    try {
      await repoA.insert({ month: FEB, openingBalance: OPENING, maxCapped: MAXCAP });
      throw new Error("expected ongoing_exists");
    } catch (e) {
      expect(e).toBeInstanceOf(FinanceDataError);
      expect((e as FinanceDataError).code).toBe("ongoing_exists");
      expect((e as FinanceDataError).constraint).toBe("uq_one_ongoing_ledger");
    }
  });

  test("row 10 — park the ongoing, then a new ongoing month succeeds", async () => {
    const jan = await repoA.insert({ month: JAN, openingBalance: OPENING, maxCapped: MAXCAP });
    await repoA.updateStatus(jan.id, "reconciling");
    const feb = await repoA.insert({ month: FEB, openingBalance: OPENING, maxCapped: MAXCAP });
    expect((await repoA.findOngoing())?.id).toBe(feb.id);
  });

  test("row 11 — maxCapped > 2× opening → check_violation / ck_maxcapped_ceiling", async () => {
    try {
      await repoA.insert({
        month: JAN,
        openingBalance: decodeMoney("100.00"),
        maxCapped: decodeMoney("300.00"), // > 2 × 100
      });
      throw new Error("expected check_violation");
    } catch (e) {
      expect((e as FinanceDataError).code).toBe("check_violation");
      expect((e as FinanceDataError).constraint).toBe("ck_maxcapped_ceiling");
    }
  });

  test("row 12 — a negative balance → check_violation / ck_balances_nonneg", async () => {
    try {
      // opening 0 keeps the ceiling satisfied (−100 ≤ 0) so only the
      // non-negativity CHECK fires — pinning the reported constraint.
      await repoA.insert({
        month: JAN,
        openingBalance: decodeMoney("0.00"),
        maxCapped: decodeMoney("-1.00"),
      });
      throw new Error("expected check_violation");
    } catch (e) {
      expect((e as FinanceDataError).code).toBe("check_violation");
      expect((e as FinanceDataError).constraint).toBe("ck_balances_nonneg");
    }
  });

  // ─────────────────────────── RLS isolation ───────────────────────────

  test("row 13 — A cannot findById B's ledger (RLS hides it)", async () => {
    const b = await repoB.insert({ month: JAN, openingBalance: OPENING, maxCapped: MAXCAP });
    expect(await repoA.findById(b.id)).toBeNull();
  });

  test("row 14 — A.list() excludes B's ledgers", async () => {
    await repoA.insert({ month: JAN, openingBalance: OPENING, maxCapped: MAXCAP });
    await repoB.insert({ month: FEB, openingBalance: OPENING, maxCapped: MAXCAP });
    const months = (await repoA.list()).map((l) => encodeMonth(l.month));
    expect(months).toEqual(["2027-01-01"]);
  });

  test("row 15 — authed insert never sets user_id; DB default auth.uid() fills A", async () => {
    const created = await repoA.insert({ month: JAN, openingBalance: OPENING, maxCapped: MAXCAP });
    const { data } = await service
      .from("monthly_ledger")
      .select("user_id")
      .eq("id", created.id)
      .single();
    expect(data?.user_id).toBe(USER_A);
  });

  // ─────────────────────── Mapper edge / not-error paths ───────────────────────

  test("row 16 — a settled ledger reads back with status='settled' and settledAt set", async () => {
    const { data, error } = await service
      .from("monthly_ledger")
      .insert({
        user_id: USER_A,
        month: encodeMonth(JAN),
        opening_balance: encodeMoney(OPENING) as unknown as number,
        max_capped: encodeMoney(MAXCAP) as unknown as number,
        status: "settled",
        settled_at: "2027-02-01T00:00:00.000Z",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    if (!data) throw new Error("expected the seeded settled ledger id");
    const read = await repoA.findById(data.id);
    expect(read?.status).toBe("settled");
    expect(read?.settledAt).toBe("2027-02-01T00:00:00.000Z");
  });

  test("row 17 — a find that matches no row returns null, never throws", async () => {
    expect(await repoA.findById("00000000-0000-0000-0000-0000000000ff")).toBeNull();
    expect(await repoA.findByMonth(SEP)).toBeNull();
    expect(await repoA.findOngoing()).toBeNull();
  });

  test("row 18 — mapPostgrestError on an unmapped SQLSTATE → unknown, raw on cause", () => {
    const raw = { name: "PostgrestError", message: "boom", details: "", hint: "", code: "08006" };
    const err = mapPostgrestError(raw as Parameters<typeof mapPostgrestError>[0]);
    expect(err.code).toBe("unknown");
    expect(err.cause).toBe(raw);
  });
});
