/**
 * Finance connection-spine — live-DB RLS matrix (EF2.2 §5b).
 *
 * NON-GATING. This suite needs a live local Supabase and is run ONLY via
 * `bun run test:integration` (`bun test tests/integration/`), which
 * `bun run check` never calls — there is no live Supabase in CI. It proves the
 * behavior the mocked unit tests cannot: RLS isolation, the `auth.uid()` insert
 * path, and the service-role `NOT NULL` footgun.
 *
 * Prerequisites (run by the operator — see the `supabase` skill / project
 * memory: all Supabase CLI commands are run manually):
 *   1. `supabase db reset`  — replays migrations + seeds two users
 *      (test@nafios.local / test-b@nafios.local, both password `password123`).
 *   2. Export env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 *   3. `bun run test:integration`.
 *
 * With any of those env vars missing the suite SKIPS (so the lane never fails
 * for lack of a database). Rows are inserted under a sentinel far-future month
 * range and cleaned up via the service client, so the matrix is idempotent.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { asDb } from "@nafios/database";
import { createServiceClient, type FinanceClient } from "@nafios/finance";
import { createAuthedClient } from "@nafios/supabase-core";

// Finance's own runtime client is browser-only (`createBrowserClient`), so it
// can't stand up two distinct users in one headless process. This RLS matrix
// therefore builds its per-user clients from supabase-core's raw-token
// `createAuthedClient` + `@nafios/database`'s `asDb` overlay directly — the
// token-injection path that finance deliberately no longer exposes.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const HAS_ENV = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);

// Seeded users (supabase/seed.sql).
const USER_A = "00000000-0000-0000-0000-000000000001";
const USER_B = "00000000-0000-0000-0000-000000000002";
const PASSWORD = "password123";

// Sentinel months (first-of-month) well outside any real data, for isolation
// + deterministic cleanup.
const MONTH_A = "2999-01-01";
const MONTH_B = "2999-02-01";
const MONTH_SVC = "2999-03-01";
const SENTINEL_MONTHS = [MONTH_A, MONTH_B, MONTH_SVC];

/** Sign in a seeded user via the GoTrue REST endpoint and return the JWT. */
async function signIn(email: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY as string,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const json = (await res.json()) as { access_token?: string; error_description?: string };
  if (!json.access_token) {
    throw new Error(`sign-in failed for ${email}: ${json.error_description ?? res.status}`);
  }
  return json.access_token;
}

describe.skipIf(!HAS_ENV)("finance connection spine — RLS matrix (live DB)", () => {
  let authedA: FinanceClient;
  let authedB: FinanceClient;
  let service: FinanceClient;

  async function cleanup() {
    await service.from("monthly_ledger").delete().in("month", SENTINEL_MONTHS);
  }

  beforeAll(async () => {
    const [tokenA, tokenB] = await Promise.all([
      signIn("test@nafios.local"),
      signIn("test-b@nafios.local"),
    ]);
    authedA = asDb(createAuthedClient(tokenA));
    authedB = asDb(createAuthedClient(tokenB));
    service = createServiceClient();
    await cleanup();
  });

  afterAll(async () => {
    if (service) await cleanup();
  });

  test("authed insert omits user_id → DB default auth.uid() fills the owner", async () => {
    const { data, error } = await authedA
      .from("monthly_ledger")
      .insert({ month: MONTH_A, max_capped: 0, opening_balance: 0 })
      .select("user_id, month")
      .single();
    expect(error).toBeNull();
    expect(data?.user_id).toBe(USER_A);

    // Seed B's row too, for the isolation + service-read assertions below.
    const insB = await authedB
      .from("monthly_ledger")
      .insert({ month: MONTH_B, max_capped: 0, opening_balance: 0 })
      .select("user_id")
      .single();
    expect(insB.error).toBeNull();
    expect(insB.data?.user_id).toBe(USER_B);
  });

  test("authed read is RLS-scoped: A sees only A's rows, never B's", async () => {
    const { data, error } = await authedA
      .from("monthly_ledger")
      .select("user_id, month")
      .in("month", [MONTH_A, MONTH_B]);
    expect(error).toBeNull();
    expect(data?.map((r) => r.month)).toEqual([MONTH_A]);
    expect(data?.every((r) => r.user_id === USER_A)).toBe(true);
  });

  test("service read bypasses RLS: sees both users' rows", async () => {
    const { data, error } = await service
      .from("monthly_ledger")
      .select("user_id, month")
      .in("month", [MONTH_A, MONTH_B]);
    expect(error).toBeNull();
    const owners = new Set(data?.map((r) => r.user_id));
    expect(owners.has(USER_A)).toBe(true);
    expect(owners.has(USER_B)).toBe(true);
  });

  test("service insert without user_id is rejected by NOT NULL (23502)", async () => {
    const { error } = await service
      .from("monthly_ledger")
      .insert({ month: MONTH_SVC, max_capped: 0, opening_balance: 0 });
    expect(error?.code).toBe("23502");
  });

  test("service insert with explicit user_id succeeds", async () => {
    const { data, error } = await service
      .from("monthly_ledger")
      .insert({ user_id: USER_A, month: MONTH_SVC, max_capped: 0, opening_balance: 0 })
      .select("user_id")
      .single();
    expect(error).toBeNull();
    expect(data?.user_id).toBe(USER_A);
  });
});
