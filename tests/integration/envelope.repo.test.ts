/**
 * Envelope repository — live-DB verification matrix (EF3.8 §6.1).
 *
 * NON-GATING. Like the other finance matrices, this suite needs a live local
 * Supabase and is run ONLY via `bun run test:integration`
 * (`bun test tests/integration/`), which `bun run check` never calls — there is
 * no live Supabase in CI. It proves what the mocked unit tests cannot: the real
 * carried_over ↔ carried-over round-trip against the DB enum, the real
 * 23503/23514 constraint failures (fk_envelope_category / fk_envelope_ledger /
 * ck_env_amount_nonneg / ck_env_paid_at), sort ordering, and RLS isolation —
 * against two seeded users, extended with a per-user ledger + category fixture.
 *
 * Prerequisites (run by the operator — all Supabase CLI commands are manual):
 *   1. `supabase db reset`  — replays migrations + seeds two users
 *      (test@nafios.local / test-b@nafios.local, both password `password123`).
 *   2. Export env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 *   3. `bun run test:integration`.
 *
 * With any of those env vars missing the suite SKIPS. `beforeEach` wipes both
 * seeded users' envelopes, ledgers, and categories via the service client, then
 * re-seeds A's ongoing-ledger + category fixture, so every test starts clean and
 * the matrix is idempotent across runs.
 *
 * DOCUMENTED IMPORT-BOUNDARY EXCEPTION (same as the EF3.6 matrix): the envelope
 * repository, the mapper seam (statusFromDb/statusToDb), and mapPostgrestError
 * are package-internal by design (EF3.8 §2/§3) — the barrel does not advertise
 * them. This NON-GATING, test-only live matrix reaches them via a relative path
 * into `@nafios/finance`'s `src/internal/`, the deliberate exception recorded in
 * the finance package CLAUDE.md and the EF3.6 ticket. Not to be imitated by
 * production code.
 */
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { asDb } from "@nafios/database";
import {
  createServiceClient,
  decodeMoney,
  encodeMoney,
  type FinanceClient,
  FinanceDataError,
} from "@nafios/finance";
import { createAuthedClient } from "@nafios/supabase-core";
import { ENVELOPE_STATUSES } from "../../packages/finance/src/domain/envelope";
import { mapPostgrestError } from "../../packages/finance/src/internal/errors";
import {
  statusFromDb,
  statusToDb,
} from "../../packages/finance/src/internal/mappers/envelope.mapper";
import {
  createEnvelopeRepository,
  type EnvelopeRepository,
  type NewEnvelope,
} from "../../packages/finance/src/internal/repositories/envelope.repo";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const HAS_ENV = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);

// Seeded users (supabase/seed.sql).
const USER_A = "00000000-0000-0000-0000-000000000001";
const USER_B = "00000000-0000-0000-0000-000000000002";
const PASSWORD = "password123";

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

describe.skipIf(!HAS_ENV)("envelope repository — verification matrix (live DB)", () => {
  let authedA: FinanceClient;
  let authedB: FinanceClient;
  let service: FinanceClient;
  let repoA: EnvelopeRepository;
  let repoB: EnvelopeRepository;

  // Per-user fixture ids, re-seeded each test.
  let ledgerA: string;
  let categoryA: string;
  let ledgerB: string;
  let categoryB: string;

  async function cleanup() {
    await service.from("envelope").delete().in("user_id", [USER_A, USER_B]);
    await service.from("monthly_ledger").delete().in("user_id", [USER_A, USER_B]);
    await service.from("category").delete().in("user_id", [USER_A, USER_B]);
  }

  async function seedLedger(userId: string, month: string, status = "ongoing"): Promise<string> {
    const { data, error } = await service
      .from("monthly_ledger")
      .insert({
        user_id: userId,
        month,
        opening_balance: "7152.35" as unknown as number,
        max_capped: "6415.00" as unknown as number,
        status: status as "ongoing" | "reconciling" | "settled",
        settled_at: status === "settled" ? "2027-02-01T00:00:00.000Z" : null,
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(`seed ledger failed: ${error?.message}`);
    }
    return data.id;
  }

  async function seedCategory(userId: string, name: string): Promise<string> {
    const { data, error } = await service
      .from("category")
      .insert({ user_id: userId, name })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(`seed category failed: ${error?.message}`);
    }
    return data.id;
  }

  beforeAll(async () => {
    const [tokenA, tokenB] = await Promise.all([
      signIn("test@nafios.local"),
      signIn("test-b@nafios.local"),
    ]);
    authedA = asDb(createAuthedClient(tokenA));
    authedB = asDb(createAuthedClient(tokenB));
    service = createServiceClient();
    repoA = createEnvelopeRepository(authedA);
    repoB = createEnvelopeRepository(authedB);
  });

  beforeEach(async () => {
    await cleanup();
    ledgerA = await seedLedger(USER_A, "2027-01-01");
    categoryA = await seedCategory(USER_A, "Groceries");
    ledgerB = await seedLedger(USER_B, "2027-01-01");
    categoryB = await seedCategory(USER_B, "Groceries");
  });

  const manual = (overrides: Partial<NewEnvelope> = {}): NewEnvelope => ({
    ledgerId: ledgerA,
    category: categoryA,
    item: "Groceries",
    amount: decodeMoney("120.00"),
    ...overrides,
  });

  // ─────────────────── Round-trip mapping & the carried_over seam ───────────────────

  test("row 1 — insert manual (status omitted) → pending, paidAt null, manual-only fields null", async () => {
    const env = await repoA.insert(manual());
    expect(env.status).toBe("pending");
    expect(env.paidAt).toBeNull();
    expect(env.templateId).toBeNull();
    expect(env.originalAmount).toBeNull();
    expect(env.carriedFromEnvelopeId).toBeNull();
    expect(env.carryOverReason).toBeNull();
  });

  test("row 2 — read back re-encodes amount exactly (money never floated)", async () => {
    const created = await repoA.insert(manual());
    const read = await repoA.findById(created.id);
    if (!read) throw new Error("expected the envelope to be found");
    expect(encodeMoney(read.amount)).toBe("120.00");
  });

  test("row 3 — insert carried-over → domain 'carried-over', stored DB label carried_over", async () => {
    const created = await repoA.insert(manual({ status: "carried-over" }));
    expect(created.status).toBe("carried-over");
    const { data } = await service.from("envelope").select("status").eq("id", created.id).single();
    expect(data?.status).toBe("carried_over");
  });

  test("row 4 — statusFromDb(statusToDb(s)) round-trips for every domain status", () => {
    for (const s of ENVELOPE_STATUSES) {
      expect(statusFromDb(statusToDb(s))).toBe(s);
    }
  });

  test("row 5 — updateStatus paid (paidAt set) then skipped (paidAt cleared)", async () => {
    const created = await repoA.insert(manual());
    const paid = await repoA.updateStatus(created.id, {
      status: "paid",
      paidAt: "2027-01-06T09:00:00.000Z",
    });
    expect(paid.status).toBe("paid");
    expect(paid.paidAt).not.toBeNull();
    const skipped = await repoA.updateStatus(created.id, { status: "skipped", paidAt: null });
    expect(skipped.status).toBe("skipped");
    expect(skipped.paidAt).toBeNull();
  });

  test("row 6 — update(amount, item) leaves status/paidAt untouched", async () => {
    const created = await repoA.insert(
      manual({ status: "paid", paidAt: "2027-01-06T09:00:00.000Z" }),
    );
    const updated = await repoA.update(created.id, { amount: decodeMoney("99.99"), item: "X" });
    expect(encodeMoney(updated.amount)).toBe("99.99");
    expect(updated.item).toBe("X");
    expect(updated.status).toBe("paid");
    expect(updated.paidAt).toBe("2027-01-06T09:00:00.000Z");
  });

  test("row 7 — listByLedger orders by sort_order (insert 2,0,1 → read 0,1,2)", async () => {
    await repoA.insert(manual({ item: "two", sortOrder: 2 }));
    await repoA.insert(manual({ item: "zero", sortOrder: 0 }));
    await repoA.insert(manual({ item: "one", sortOrder: 1 }));
    const list = await repoA.listByLedger(ledgerA);
    expect(list.map((e) => e.sortOrder)).toEqual([0, 1, 2]);
    expect(list.map((e) => e.item)).toEqual(["zero", "one", "two"]);
  });

  test("row 8 — findById: own id → envelope, random uuid → null", async () => {
    const created = await repoA.insert(manual());
    expect((await repoA.findById(created.id))?.id).toBe(created.id);
    expect(await repoA.findById("00000000-0000-0000-0000-0000000000ff")).toBeNull();
  });

  test("row 9 — delete then findById → null", async () => {
    const created = await repoA.insert(manual());
    await repoA.delete(created.id);
    expect(await repoA.findById(created.id)).toBeNull();
  });

  // ─────────────────── Error classification (FinanceDataError) ───────────────────

  test("row 10 — insert with a bad/unowned category → foreign_key_violation / fk_envelope_category", async () => {
    try {
      await repoA.insert(manual({ category: "00000000-0000-0000-0000-0000000000ff" }));
      throw new Error("expected foreign_key_violation");
    } catch (e) {
      expect(e).toBeInstanceOf(FinanceDataError);
      expect((e as FinanceDataError).code).toBe("foreign_key_violation");
      expect((e as FinanceDataError).constraint).toBe("fk_envelope_category");
    }
  });

  test("row 11 — insert with a bad ledger → foreign_key_violation / fk_envelope_ledger", async () => {
    try {
      await repoA.insert(manual({ ledgerId: "00000000-0000-0000-0000-0000000000ff" }));
      throw new Error("expected foreign_key_violation");
    } catch (e) {
      expect((e as FinanceDataError).code).toBe("foreign_key_violation");
      expect((e as FinanceDataError).constraint).toBe("fk_envelope_ledger");
    }
  });

  test("row 12 — insert amount -1.00 (bypassing the command) → check_violation / ck_env_amount_nonneg", async () => {
    try {
      await repoA.insert(manual({ amount: decodeMoney("-1.00") }));
      throw new Error("expected check_violation");
    } catch (e) {
      expect((e as FinanceDataError).code).toBe("check_violation");
      expect((e as FinanceDataError).constraint).toBe("ck_env_amount_nonneg");
    }
  });

  test("row 13 — updateStatus paid + paidAt null (bypassing applyStatusTransition) → check_violation / ck_env_paid_at", async () => {
    const created = await repoA.insert(manual());
    try {
      await repoA.updateStatus(created.id, { status: "paid", paidAt: null });
      throw new Error("expected check_violation");
    } catch (e) {
      expect((e as FinanceDataError).code).toBe("check_violation");
      expect((e as FinanceDataError).constraint).toBe("ck_env_paid_at");
    }
  });

  test("row 14 — mapPostgrestError on an unmapped SQLSTATE → unknown, raw on cause", () => {
    const raw = {
      name: "PostgrestError",
      message: "boom",
      details: "",
      hint: "",
      code: "08006",
    } as unknown as Parameters<typeof mapPostgrestError>[0];
    const err = mapPostgrestError(raw);
    expect(err.code).toBe("unknown");
    expect(err.cause).toBe(raw);
  });

  // ─────────────────────────── RLS isolation ───────────────────────────

  test("row 15 — A cannot see B's envelope (findById → null, listByLedger → [])", async () => {
    const b = await repoB.insert({
      ledgerId: ledgerB,
      category: categoryB,
      item: "B's line",
      amount: decodeMoney("10.00"),
    });
    expect(await repoA.findById(b.id)).toBeNull();
    expect(await repoA.listByLedger(ledgerB)).toEqual([]);
  });

  test("row 16 — authed insert never sets user_id; DB default auth.uid() fills A", async () => {
    const created = await repoA.insert(manual());
    const { data } = await service.from("envelope").select("user_id").eq("id", created.id).single();
    expect(data?.user_id).toBe(USER_A);
  });
});
