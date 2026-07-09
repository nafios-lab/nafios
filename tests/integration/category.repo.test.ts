/**
 * Category repository — live-DB verification matrix (EF3.9 §6.1).
 *
 * NON-GATING. Like the other finance matrices, this suite needs a live local
 * Supabase and is run ONLY via `bun run test:integration`
 * (`bun test tests/integration/`), which `bun run check` never calls — there is
 * no live Supabase in CI. It proves what the mocked unit tests cannot: the
 * EXPLICIT user_id write path under a service client (so a service insert that
 * would otherwise null user_id succeeds), display_order/name ordering, the
 * display_order/color defaults, EF1.2's ABSENCE of UNIQUE(user_id, name) (a
 * duplicate name inserts cleanly — the count-guard's assumption), and RLS
 * isolation on the authed read — against two seeded users, each starting
 * category-clean.
 *
 * Prerequisites (run by the operator — all Supabase CLI commands are manual):
 *   1. `supabase db reset`  — replays migrations + seeds two users
 *      (test@nafios.local / test-b@nafios.local, both password `password123`).
 *   2. Export env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 *   3. `bun run test:integration`.
 *
 * With any of those env vars missing the suite SKIPS. `beforeEach` wipes both
 * seeded users' categories via the service client so every test starts
 * category-clean and the matrix is idempotent across runs.
 *
 * DOCUMENTED IMPORT-BOUNDARY EXCEPTION (same as the EF3.6/EF3.8 matrices): the
 * category repository is package-internal by design (EF3.9 §2/§3) — the barrel
 * does not advertise it. This NON-GATING, test-only live matrix reaches it via a
 * relative path into `@nafios/finance`'s `src/internal/`, the deliberate
 * exception recorded in the finance package CLAUDE.md. Not to be imitated by
 * production code.
 */
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { asDb } from "@nafios/database";
import { createServiceClient, type FinanceClient } from "@nafios/finance";
import { createAuthedClient } from "@nafios/supabase-core";
import {
  type CategoryRepository,
  createCategoryRepository,
} from "../../packages/finance/src/internal/repositories/category.repo";

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

describe.skipIf(!HAS_ENV)("category repository — verification matrix (live DB)", () => {
  let service: FinanceClient;
  let repoServiceForInserts: CategoryRepository; // service client: explicit user_id path
  let repoA: CategoryRepository; // authed-as-A: RLS read
  let repoB: CategoryRepository; // authed-as-B: RLS read

  async function cleanup() {
    await service.from("category").delete().in("user_id", [USER_A, USER_B]);
  }

  beforeAll(async () => {
    const [tokenA, tokenB] = await Promise.all([
      signIn("test@nafios.local"),
      signIn("test-b@nafios.local"),
    ]);
    service = createServiceClient();
    repoServiceForInserts = createCategoryRepository(service);
    repoA = createCategoryRepository(asDb(createAuthedClient(tokenA)));
    repoB = createCategoryRepository(asDb(createAuthedClient(tokenB)));
  });

  beforeEach(cleanup);

  // ─────────────────────────── Explicit user_id write ───────────────────────────

  test("row 1 — insertManyForUser(A, [Debt/0, Bills/3]) (service) → two Category, color null, ids assigned", async () => {
    const created = await repoServiceForInserts.insertManyForUser(USER_A, [
      { name: "Debt", displayOrder: 0 },
      { name: "Bills", displayOrder: 3 },
    ]);
    expect(created).toHaveLength(2);
    expect(created.every((c) => c.color === null)).toBe(true);
    expect(created.every((c) => typeof c.id === "string" && c.id.length > 0)).toBe(true);
  });

  test("row 2 — the stored row carries user_id = A (set EXPLICITLY, never the null omit path)", async () => {
    const [created] = await repoServiceForInserts.insertManyForUser(USER_A, [{ name: "Debt" }]);
    if (!created) throw new Error("expected a created category");
    const { data } = await service.from("category").select("user_id").eq("id", created.id).single();
    expect(data?.user_id).toBe(USER_A);
  });

  test("row 3 — listByUser (authed-as-A) after inserting displayOrder 2,0,1 → ordered [0,1,2]", async () => {
    await repoServiceForInserts.insertManyForUser(USER_A, [
      { name: "Two", displayOrder: 2 },
      { name: "Zero", displayOrder: 0 },
      { name: "One", displayOrder: 1 },
    ]);
    const list = await repoA.listByUser();
    expect(list.map((c) => c.displayOrder)).toEqual([0, 1, 2]);
    expect(list.map((c) => c.name)).toEqual(["Zero", "One", "Two"]);
  });

  test("row 4 — listByUser (authed-as-A) on a category-clean user → []", async () => {
    expect(await repoA.listByUser()).toEqual([]);
  });

  test("row 5 — countForUser(A) after inserting 8 → 8", async () => {
    await repoServiceForInserts.insertManyForUser(
      USER_A,
      Array.from({ length: 8 }, (_, i) => ({ name: `C${i}`, displayOrder: i })),
    );
    expect(await repoServiceForInserts.countForUser(USER_A)).toBe(8);
  });

  test("row 6 — insertManyForUser omitting displayOrder/color → display_order 0, color null", async () => {
    const [created] = await repoServiceForInserts.insertManyForUser(USER_A, [{ name: "Debt" }]);
    if (!created) throw new Error("expected a created category");
    expect(created.displayOrder).toBe(0);
    expect(created.color).toBeNull();
  });

  test("row 7 — insertManyForUser(A, [Debt, Debt]) → both inserted (EF1.2 has no UNIQUE(user_id,name))", async () => {
    const created = await repoServiceForInserts.insertManyForUser(USER_A, [
      { name: "Debt" },
      { name: "Debt" },
    ]);
    expect(created).toHaveLength(2);
    expect(await repoServiceForInserts.countForUser(USER_A)).toBe(2);
  });

  // ─────────────────────────── RLS isolation (authed read) ───────────────────────────

  test("row 8 — service insert for A; authed-as-B listByUser() sees none of A's rows", async () => {
    await repoServiceForInserts.insertManyForUser(USER_A, [{ name: "Debt" }, { name: "Bills" }]);
    expect(await repoB.listByUser()).toEqual([]);
  });
});
