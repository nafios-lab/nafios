/**
 * Envelope commands — live-DB verification matrix (EF3.8 §6.2).
 *
 * NON-GATING. Like the other finance matrices, this suite needs a live local
 * Supabase and is run ONLY via `bun run test:integration`
 * (`bun test tests/integration/`), which `bun run check` never calls. It proves
 * what mocked unit tests cannot: the real pre-write rejections (no write), the
 * mutability gate against a service-seeded `settled` ledger, the paidAt invariant
 * on every set-status result, the foreign_key_violation throw for a bad category,
 * and RLS caller isolation — against two seeded users.
 *
 * Unlike the EF3.8 repository matrix this drives the PUBLIC, barrel-exported
 * command surface (`createEnvelopeCommands`) — the app-facing write surface
 * EF3.14 imports — so it needs NO reach into `src/internal/`.
 *
 * Prerequisites (run by the operator — all Supabase CLI commands are manual):
 *   1. `supabase db reset`  — replays migrations + seeds two users
 *      (test@nafios.local / test-b@nafios.local, both password `password123`).
 *   2. Export env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 *   3. `bun run test:integration`.
 *
 * With any of those env vars missing the suite SKIPS. `beforeEach` wipes both
 * users' envelopes, ledgers, and categories, then re-seeds A's ongoing ledger +
 * category, B's ongoing ledger + category, and a service-forced `settled` ledger
 * for A (settlement is EF5+; no command produces one). Idempotent across runs.
 */
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { asDb } from "@nafios/database";
import {
  type CreateEnvelopeInput,
  type CreateEnvelopeResult,
  createEnvelopeCommands,
  createServiceClient,
  decodeMoney,
  type EnvelopeCommands,
  encodeMoney,
  type FinanceClient,
  FinanceDataError,
} from "@nafios/finance";
import { createAuthedClient } from "@nafios/supabase-core";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const HAS_ENV = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);

const USER_A = "00000000-0000-0000-0000-000000000001";
const USER_B = "00000000-0000-0000-0000-000000000002";
const PASSWORD = "password123";

const RANDOM_UUID = "00000000-0000-0000-0000-0000000000ff";

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

function assertOk(
  r: CreateEnvelopeResult,
): asserts r is Extract<CreateEnvelopeResult, { readonly ok: true }> {
  if (!r.ok) {
    throw new Error(`expected ok:true, got ${JSON.stringify(r)}`);
  }
}

describe.skipIf(!HAS_ENV)("envelope commands — verification matrix (live DB)", () => {
  let authedA: FinanceClient;
  let service: FinanceClient;
  let cmdA: EnvelopeCommands;
  let cmdB: EnvelopeCommands;

  let ongoingA: string;
  let categoryA: string;
  let settledA: string;
  let ongoingB: string;
  let categoryB: string;

  async function cleanup() {
    await service.from("envelope").delete().in("user_id", [USER_A, USER_B]);
    await service.from("monthly_ledger").delete().in("user_id", [USER_A, USER_B]);
    await service.from("category").delete().in("user_id", [USER_A, USER_B]);
  }

  async function seedLedger(userId: string, month: string, status: string): Promise<string> {
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
    if (error || !data) throw new Error(`seed ledger failed: ${error?.message}`);
    return data.id;
  }

  async function seedCategory(userId: string, name: string): Promise<string> {
    const { data, error } = await service
      .from("category")
      .insert({ user_id: userId, name })
      .select("id")
      .single();
    if (error || !data) throw new Error(`seed category failed: ${error?.message}`);
    return data.id;
  }

  // Insert an envelope directly (service client) — used to seed a line on the
  // settled ledger and on user B's ledger without going through the gated command.
  async function seedEnvelope(
    userId: string,
    ledgerId: string,
    categoryId: string,
  ): Promise<string> {
    const { data, error } = await service
      .from("envelope")
      .insert({
        user_id: userId,
        ledger_id: ledgerId,
        category_id: categoryId,
        item: "seeded",
        amount: "10.00" as unknown as number,
        status: "pending",
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`seed envelope failed: ${error?.message}`);
    return data.id;
  }

  beforeAll(async () => {
    const [tokenA, tokenB] = await Promise.all([
      signIn("test@nafios.local"),
      signIn("test-b@nafios.local"),
    ]);
    authedA = asDb(createAuthedClient(tokenA));
    const authedB = asDb(createAuthedClient(tokenB));
    service = createServiceClient();
    cmdA = createEnvelopeCommands(authedA);
    cmdB = createEnvelopeCommands(authedB);
  });

  beforeEach(async () => {
    await cleanup();
    // A's ongoing (Jan) + a service-forced settled (Feb) ledger, plus a category.
    ongoingA = await seedLedger(USER_A, "2027-01-01", "ongoing");
    settledA = await seedLedger(USER_A, "2027-02-01", "settled");
    categoryA = await seedCategory(USER_A, "Groceries");
    ongoingB = await seedLedger(USER_B, "2027-01-01", "ongoing");
    categoryB = await seedCategory(USER_B, "Groceries");
  });

  const create = (overrides: Partial<CreateEnvelopeInput> = {}) =>
    cmdA.createEnvelope({
      ledgerId: ongoingA,
      category: categoryA,
      item: "Netflix",
      amount: decodeMoney("19.90"),
      ...overrides,
    });

  // ─────────────────────────── Happy paths ───────────────────────────

  test("row 17 — createEnvelope → pending, paidAt null, manual-only fields null", async () => {
    const r = await create();
    assertOk(r);
    expect(r.envelope.status).toBe("pending");
    expect(r.envelope.paidAt).toBeNull();
    expect(r.envelope.templateId).toBeNull();
    expect(r.envelope.originalAmount).toBeNull();
    expect(r.envelope.carryOverReason).toBeNull();
  });

  test("row 18 — setEnvelopeStatus paid stamps paidAt = now", async () => {
    const c = await create();
    assertOk(c);
    const r = await cmdA.setEnvelopeStatus({
      envelopeId: c.envelope.id,
      status: "paid",
      now: "2027-01-06T09:00:00.000Z",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.envelope.status).toBe("paid");
      expect(r.envelope.paidAt).toBe("2027-01-06T09:00:00.000Z");
    }
  });

  test("row 19 — paid → pending → paid gives a fresh stamp (intermediate cleared it)", async () => {
    const c = await create();
    assertOk(c);
    const id = c.envelope.id;
    await cmdA.setEnvelopeStatus({
      envelopeId: id,
      status: "paid",
      now: "2027-01-06T09:00:00.000Z",
    });
    await cmdA.setEnvelopeStatus({
      envelopeId: id,
      status: "pending",
      now: "2027-01-07T00:00:00.000Z",
    });
    const r = await cmdA.setEnvelopeStatus({
      envelopeId: id,
      status: "paid",
      now: "2027-01-08T00:00:00.000Z",
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.envelope.paidAt).toBe("2027-01-08T00:00:00.000Z");
  });

  test("row 20 — setEnvelopeStatus carried-over → status only, paidAt null, reason null (inert)", async () => {
    const c = await create();
    assertOk(c);
    const r = await cmdA.setEnvelopeStatus({
      envelopeId: c.envelope.id,
      status: "carried-over",
      now: "2027-01-31T00:00:00.000Z",
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.envelope.status).toBe("carried-over");
    expect(r.envelope.paidAt).toBeNull();
    expect(r.envelope.carryOverReason).toBeNull();
  });

  test("row 21 — editEnvelope amount on a paid envelope leaves status/paidAt untouched", async () => {
    const c = await create();
    assertOk(c);
    const id = c.envelope.id;
    await cmdA.setEnvelopeStatus({
      envelopeId: id,
      status: "paid",
      now: "2027-01-06T09:00:00.000Z",
    });
    const r = await cmdA.editEnvelope({ envelopeId: id, amount: decodeMoney("22.90") });
    if (!r.ok) throw new Error("expected ok");
    expect(encodeMoney(r.envelope.amount)).toBe("22.90");
    expect(r.envelope.status).toBe("paid");
    expect(r.envelope.paidAt).toBe("2027-01-06T09:00:00.000Z");
  });

  test("row 22 — deleteEnvelope removes the line", async () => {
    const c = await create();
    assertOk(c);
    const r = await cmdA.deleteEnvelope({ envelopeId: c.envelope.id });
    expect(r).toEqual({ ok: true });
    const { data } = await service
      .from("envelope")
      .select("id")
      .eq("id", c.envelope.id)
      .maybeSingle();
    expect(data).toBeNull();
  });

  // ─────────────────── Rejections — result union, no write ───────────────────

  test("row 23 — createEnvelope negative amount → negative_amount, no envelope created", async () => {
    const r = await create({ item: "Bad", amount: decodeMoney("-5.00") });
    expect(r).toEqual({ ok: false, reason: "negative_amount" });
    const { count } = await service
      .from("envelope")
      .select("id", { count: "exact", head: true })
      .eq("ledger_id", ongoingA);
    expect(count).toBe(0);
  });

  test("row 24 — createEnvelope on a settled ledger → ledger_not_mutable, no write", async () => {
    const r = await cmdA.createEnvelope({
      ledgerId: settledA,
      category: categoryA,
      item: "X",
      amount: decodeMoney("10.00"),
    });
    expect(r).toEqual({ ok: false, reason: "ledger_not_mutable" });
    const { count } = await service
      .from("envelope")
      .select("id", { count: "exact", head: true })
      .eq("ledger_id", settledA);
    expect(count).toBe(0);
  });

  test("row 25 — createEnvelope on a random ledger uuid → ledger_not_found, no write", async () => {
    const r = await cmdA.createEnvelope({
      ledgerId: RANDOM_UUID,
      category: categoryA,
      item: "X",
      amount: decodeMoney("10.00"),
    });
    expect(r).toEqual({ ok: false, reason: "ledger_not_found" });
  });

  test("row 26 — editEnvelope on a random envelope uuid → envelope_not_found, no write", async () => {
    const r = await cmdA.editEnvelope({ envelopeId: RANDOM_UUID, item: "X" });
    expect(r).toEqual({ ok: false, reason: "envelope_not_found" });
  });

  test("row 27 — editEnvelope negative amount → negative_amount, amount unchanged", async () => {
    const c = await create();
    assertOk(c);
    const r = await cmdA.editEnvelope({ envelopeId: c.envelope.id, amount: decodeMoney("-1.00") });
    expect(r).toEqual({ ok: false, reason: "negative_amount" });
    const read = await service.from("envelope").select("amount").eq("id", c.envelope.id).single();
    expect(read.data?.amount as unknown as string).toBe("19.90");
  });

  test("row 28 — setEnvelopeStatus on a settled ledger's envelope → ledger_not_mutable, status unchanged", async () => {
    const seeded = await seedEnvelope(USER_A, settledA, categoryA);
    const r = await cmdA.setEnvelopeStatus({ envelopeId: seeded, status: "paid", now: "T" });
    expect(r).toEqual({ ok: false, reason: "ledger_not_mutable" });
    const read = await service.from("envelope").select("status").eq("id", seeded).single();
    expect(read.data?.status).toBe("pending");
  });

  test("row 29 — deleteEnvelope on a random envelope uuid → envelope_not_found", async () => {
    const r = await cmdA.deleteEnvelope({ envelopeId: RANDOM_UUID });
    expect(r).toEqual({ ok: false, reason: "envelope_not_found" });
  });

  // ─────────────────── Throw / invariant / isolation ───────────────────

  test("row 30 — createEnvelope with a bad/unowned category → throws foreign_key_violation (not a result)", async () => {
    const promise = cmdA.createEnvelope({
      ledgerId: ongoingA,
      category: RANDOM_UUID,
      item: "Y",
      amount: decodeMoney("10.00"),
    });
    await expect(promise).rejects.toBeInstanceOf(FinanceDataError);
    await expect(promise).rejects.toMatchObject({ code: "foreign_key_violation" });
  });

  test("row 31 — paidAt != null ⟺ status === 'paid' on every set-status result", async () => {
    const c = await create();
    assertOk(c);
    const id = c.envelope.id;
    const invariant = (status: string, paidAt: string | null) =>
      expect(paidAt !== null).toBe(status === "paid");
    for (const [status, now] of [
      ["paid", "2027-01-06T09:00:00.000Z"],
      ["pending", "2027-01-07T00:00:00.000Z"],
      ["skipped", "2027-01-08T00:00:00.000Z"],
      ["carried-over", "2027-01-09T00:00:00.000Z"],
      ["paid", "2027-01-10T00:00:00.000Z"],
    ] as const) {
      const r = await cmdA.setEnvelopeStatus({ envelopeId: id, status, now });
      if (!r.ok) throw new Error(`expected ok for ${status}`);
      invariant(r.envelope.status, r.envelope.paidAt);
    }
  });

  test("row 32 — A cannot edit/set-status/delete B's envelope → envelope_not_found (RLS), B's row untouched", async () => {
    const bEnv = await seedEnvelope(USER_B, ongoingB, categoryB);
    expect(await cmdA.editEnvelope({ envelopeId: bEnv, item: "hacked" })).toEqual({
      ok: false,
      reason: "envelope_not_found",
    });
    expect(await cmdA.setEnvelopeStatus({ envelopeId: bEnv, status: "paid", now: "T" })).toEqual({
      ok: false,
      reason: "envelope_not_found",
    });
    expect(await cmdA.deleteEnvelope({ envelopeId: bEnv })).toEqual({
      ok: false,
      reason: "envelope_not_found",
    });
    // B's row is intact — B can still read it.
    const stillThere = await cmdB.editEnvelope({ envelopeId: bEnv, item: "seeded" });
    expect(stillThere.ok).toBe(true);
  });
});
