/**
 * Finance-Home read surface — live-DB verification matrix (EF3.13 §4).
 *
 * NON-GATING. Like the EF3.6 ledger-repository matrix, this suite needs a live
 * Supabase and runs ONLY via `bun run test:integration` (never `bun run check`
 * — there is no live Supabase in CI). It proves what the mocked unit tests
 * cannot: the PUBLIC `createLedgerQueries(...).getFinanceHomeState(today)` read
 * against a real `monthly_ledger` row, and the RLS isolation that IS the ADR-0026
 * security boundary now that Finance reads directly from the browser — a
 * different user's ledgers never enter the current user's Home state.
 *
 * Prerequisites (run by the operator — all Supabase CLI commands are manual):
 *   1. `supabase db reset`  — replays migrations + seeds two users
 *      (test@nafios.local / test-b@nafios.local, both password `password123`).
 *   2. Export env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 *   3. `bun run test:integration`.
 *
 * With any of those env vars missing the suite SKIPS. `beforeEach` wipes both
 * seeded users' ledgers via the service client, so every test starts clean.
 *
 * DOCUMENTED IMPORT-BOUNDARY EXCEPTION. The READ under test is the public,
 * barrel-exported `createLedgerQueries`. Seeding, however, reaches the internal
 * `createLedgerRepository` via a relative path into `@nafios/finance`'s
 * `src/internal/` — the same deliberate, test-only exception the EF3.6 matrix
 * documents (the factory stays internal by design; this non-gating live lane
 * cannot live in-package without tripping the per-file coverage gate — ADR-0020).
 * Not to be imitated by production code.
 */
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { asDb } from "@nafios/database";
import {
  createLedgerQueries,
  createServiceClient,
  decodeMoney,
  decodeMonth,
  type FinanceClient,
} from "@nafios/finance";
import { createAuthedClient } from "@nafios/supabase-core";
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

// A `today` in Jan 2027 (the EF3 epic anchor). hasActiveLedger is independent of
// `today`; JAN is the current month so `openable.current` is Jan when A is free.
const TODAY = "2027-01-10";
const JAN = decodeMonth("2027-01-01");
const FEB = decodeMonth("2027-02-01");
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

describe.skipIf(!HAS_ENV)("Finance-Home read surface — verification matrix (live DB)", () => {
  let authedA: FinanceClient;
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
    service = createServiceClient();
    repoA = createLedgerRepository(authedA);
    repoB = createLedgerRepository(asDb(createAuthedClient(tokenB)));
  });

  beforeEach(cleanup);

  test("S1 — A has no ledgers → hasActiveLedger false; current month openable", async () => {
    const state = await createLedgerQueries(authedA).getFinanceHomeState(TODAY);
    expect(state.hasActiveLedger).toBe(false);
    expect(state.currentMonth).toBe(JAN);
    expect(state.openable.current).toBe(JAN);
  });

  test("S2 — A has a real ongoing ledger → hasActiveLedger true", async () => {
    await repoA.insert({ month: JAN, openingBalance: OPENING, maxCapped: MAXCAP });
    const state = await createLedgerQueries(authedA).getFinanceHomeState(TODAY);
    expect(state.hasActiveLedger).toBe(true);
    // Jan is now taken by A's own ledger → no longer openable.
    expect(state.openable.current).toBeNull();
  });

  test("S3 — A's only ledger is parked (reconciling) → hasActiveLedger false", async () => {
    const jan = await repoA.insert({ month: JAN, openingBalance: OPENING, maxCapped: MAXCAP });
    await repoA.updateStatus(jan.id, "reconciling");
    const state = await createLedgerQueries(authedA).getFinanceHomeState(TODAY);
    expect(state.hasActiveLedger).toBe(false);
  });

  test("S4 — RLS isolation: B's ongoing ledger never enters A's Home state", async () => {
    // B owns an ongoing ledger; A owns nothing.
    await repoB.insert({ month: FEB, openingBalance: OPENING, maxCapped: MAXCAP });
    const state = await createLedgerQueries(authedA).getFinanceHomeState(TODAY);
    // A's read is owner-scoped — B's row is invisible, so A has no active ledger.
    expect(state.hasActiveLedger).toBe(false);
    // Sanity: the read shows A its own empty Home (Jan openable), not B's data.
    expect(state.openable.current).toBe(JAN);
  });

  test("S4b — cross-check: B's own read DOES see B's ongoing ledger", async () => {
    await repoB.insert({ month: FEB, openingBalance: OPENING, maxCapped: MAXCAP });
    const stateB = await createLedgerQueries(
      asDb(createAuthedClient(await signIn("test-b@nafios.local"))),
    ).getFinanceHomeState(TODAY);
    expect(stateB.hasActiveLedger).toBe(true);
  });
});
