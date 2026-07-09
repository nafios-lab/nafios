/**
 * Default-category provisioning + read — live-DB verification matrix (EF3.9 §6.2).
 *
 * NON-GATING. Needs a live local Supabase; run ONLY via `bun run test:integration`
 * (`bun test tests/integration/`), never by `bun run check` (no live Supabase in
 * CI). It proves the count-guard idempotency against a real DB: seed on a
 * zero-category user, NO double-seed on an onboarding retry, no re-seed while ≥1
 * category survives, RE-SEED on a fully-emptied user (§4.3), and RLS isolation of
 * the authed runtime read — across two seeded users starting category-clean.
 *
 * Unlike the §6.1 repository matrix, this suite uses ONLY the public barrel
 * (`provisionDefaultCategories` / `listCategories` / `createServiceClient` /
 * `DEFAULT_CATEGORIES`) — like the EF3.7/EF3.8 command matrices, it needs NO
 * internal-import exception. Authed clients (for the runtime read + the test-only
 * deletes that emulate a user removing categories) are built from
 * `createAuthedClient` (supabase-core) as elsewhere.
 *
 * Prerequisites (operator-run; Supabase CLI is manual):
 *   1. `supabase db reset` — replays migrations + seeds two users
 *      (test@nafios.local / test-b@nafios.local, both password `password123`).
 *   2. Export SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 *   3. `bun run test:integration`.
 *
 * With any env var missing the suite SKIPS. `beforeEach` wipes both users'
 * categories via the service client so every test starts category-clean.
 */
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { asDb } from "@nafios/database";
import {
  createServiceClient,
  DEFAULT_CATEGORIES,
  type FinanceClient,
  listCategories,
  provisionDefaultCategories,
} from "@nafios/finance";
import { createAuthedClient } from "@nafios/supabase-core";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const HAS_ENV = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);

const USER_A = "00000000-0000-0000-0000-000000000001";
const USER_B = "00000000-0000-0000-0000-000000000002";
const PASSWORD = "password123";
const CATALOG_SIZE = DEFAULT_CATEGORIES.length;

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

describe.skipIf(!HAS_ENV)("provision-default-categories — verification matrix (live DB)", () => {
  let service: FinanceClient;
  let authedA: FinanceClient;
  let authedB: FinanceClient;

  async function cleanup() {
    await service.from("category").delete().in("user_id", [USER_A, USER_B]);
  }

  async function countA(): Promise<number> {
    const { count } = await service
      .from("category")
      .select("id", { count: "exact", head: true })
      .eq("user_id", USER_A);
    return count ?? 0;
  }

  beforeAll(async () => {
    const [tokenA, tokenB] = await Promise.all([
      signIn("test@nafios.local"),
      signIn("test-b@nafios.local"),
    ]);
    service = createServiceClient();
    authedA = asDb(createAuthedClient(tokenA));
    authedB = asDb(createAuthedClient(tokenB));
  });

  beforeEach(cleanup);

  test("row 9 — provision (service) on a clean A → seeded:true, full catalog, names+order, each user_id A", async () => {
    const result = await provisionDefaultCategories(service, USER_A);
    expect(result.seeded).toBe(true);
    expect(result.categories).toHaveLength(CATALOG_SIZE);
    expect(result.categories.map((c) => c.name)).toEqual(DEFAULT_CATEGORIES.map((c) => c.name));
    expect(result.categories.map((c) => c.displayOrder)).toEqual(
      DEFAULT_CATEGORIES.map((c) => c.displayOrder),
    );
    const { data } = await service.from("category").select("user_id").eq("user_id", USER_A);
    expect((data ?? []).every((r) => r.user_id === USER_A)).toBe(true);
  });

  test("row 10 — provision A again (onboarding retry) → seeded:false, NO new rows", async () => {
    await provisionDefaultCategories(service, USER_A);
    const before = await countA();
    const again = await provisionDefaultCategories(service, USER_A);
    expect(again.seeded).toBe(false);
    expect(await countA()).toBe(before);
  });

  test("row 11 — provision A, delete ONE (authed A), provision A again → seeded:false, still 7", async () => {
    await provisionDefaultCategories(service, USER_A);
    const first = (await listCategories(authedA))[0];
    if (!first) throw new Error("expected at least one category");
    await authedA.from("category").delete().eq("id", first.id);
    const again = await provisionDefaultCategories(service, USER_A);
    expect(again.seeded).toBe(false);
    expect(await countA()).toBe(CATALOG_SIZE - 1);
  });

  test("row 12 — provision A, delete ALL (authed A), provision A again → seeded:true, re-stocked", async () => {
    await provisionDefaultCategories(service, USER_A);
    await authedA.from("category").delete().eq("user_id", USER_A);
    expect(await countA()).toBe(0);
    const again = await provisionDefaultCategories(service, USER_A);
    expect(again.seeded).toBe(true);
    expect(await countA()).toBe(CATALOG_SIZE);
  });

  test("row 13 — listCategories (authed A) after provisioning → the catalog, ordered, no write", async () => {
    await provisionDefaultCategories(service, USER_A);
    const before = await countA();
    const cats = await listCategories(authedA);
    expect(cats.map((c) => c.name)).toEqual(DEFAULT_CATEGORIES.map((c) => c.name));
    expect(cats.map((c) => c.displayOrder)).toEqual(DEFAULT_CATEGORIES.map((c) => c.displayOrder));
    expect(await countA()).toBe(before); // a read performs no write
  });

  test("row 14 — provision A and B; each listCategories sees exactly their own catalog (RLS)", async () => {
    await provisionDefaultCategories(service, USER_A);
    await provisionDefaultCategories(service, USER_B);
    expect(await listCategories(authedA)).toHaveLength(CATALOG_SIZE);
    expect(await listCategories(authedB)).toHaveLength(CATALOG_SIZE);
  });

  test("row 15 — provision A only; listCategories (authed B, unprovisioned) → []", async () => {
    await provisionDefaultCategories(service, USER_A);
    expect(await listCategories(authedB)).toEqual([]);
  });
});
