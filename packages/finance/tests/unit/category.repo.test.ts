import { describe, expect, test } from "bun:test";
import type { PostgrestError } from "@nafios/supabase-core";
import type { FinanceClient } from "../../src/internal/client";
import { FinanceDataError } from "../../src/internal/errors";
import type { CategoryRow } from "../../src/internal/mappers/category.mapper";
import { createCategoryRepository } from "../../src/internal/repositories/category.repo";

// UNIT tests over the category repository's call-shaping and error-mapping
// against a FAKE client — no live DB. The full §6.1 behavior (real RLS, explicit
// user_id, ordering, two seeded users) is proven by the repo-root live matrix
// (tests/integration/category.repo.test.ts).

type QueryResult = { data?: unknown; count?: number | null; error: PostgrestError | null };

function makeClient(result: QueryResult) {
  const calls: Array<[string, ...unknown[]]> = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "insert", "eq", "order"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  // biome-ignore lint/suspicious/noThenProperty: deliberate query-builder stub
  builder.then = (resolve: (v: QueryResult) => void) => resolve(result);
  const client = {
    from: (...args: unknown[]) => {
      calls.push(["from", ...args]);
      return builder;
    },
  };
  return { client: client as unknown as FinanceClient, calls };
}

function categoryRow(overrides: Partial<CategoryRow> = {}): CategoryRow {
  return {
    id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    name: "Bills",
    display_order: 3,
    color: null,
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

function argsOf(calls: Array<[string, ...unknown[]]>, method: string): unknown[] | undefined {
  return calls.find(([m]) => m === method)?.slice(1);
}

describe("countForUser", () => {
  test("targets the category table, head-counts filtered by user_id, returns the count", async () => {
    const { client, calls } = makeClient({ count: 8, error: null });
    const n = await createCategoryRepository(client).countForUser("A");
    expect(argsOf(calls, "from")).toEqual(["category"]);
    expect(argsOf(calls, "select")).toEqual(["id", { count: "exact", head: true }]);
    expect(argsOf(calls, "eq")).toEqual(["user_id", "A"]);
    expect(n).toBe(8);
  });

  test("coalesces a null count to 0", async () => {
    const { client } = makeClient({ count: null, error: null });
    expect(await createCategoryRepository(client).countForUser("A")).toBe(0);
  });

  test("maps a query failure to FinanceDataError", async () => {
    const { client } = makeClient({ count: null, error: pgError({ code: "42501" }) });
    await expect(createCategoryRepository(client).countForUser("A")).rejects.toBeInstanceOf(
      FinanceDataError,
    );
  });
});

describe("insertManyForUser", () => {
  test("sets user_id EXPLICITLY on every row, reads back, maps each to a Category", async () => {
    const { client, calls } = makeClient({
      data: [categoryRow({ id: "1", name: "Debt", display_order: 0 }), categoryRow({ id: "2" })],
      error: null,
    });
    const cats = await createCategoryRepository(client).insertManyForUser("A", [
      { name: "Debt", displayOrder: 0 },
      { name: "Bills", displayOrder: 3 },
    ]);
    const insertArg = argsOf(calls, "insert")?.[0] as Array<Record<string, unknown>>;
    expect(insertArg).toHaveLength(2);
    expect(insertArg[0]?.user_id).toBe("A");
    expect(insertArg[1]?.user_id).toBe("A");
    expect(cats.map((c) => c.id)).toEqual(["1", "2"]);
  });

  test("maps a write failure to FinanceDataError", async () => {
    const { client } = makeClient({ data: null, error: pgError({ code: "23502" }) });
    await expect(
      createCategoryRepository(client).insertManyForUser("A", [{ name: "Debt" }]),
    ).rejects.toMatchObject({ code: "not_null_violation" });
  });
});

describe("listForUser", () => {
  test("filters by user_id EXPLICITLY, orders by display_order then name, maps rows", async () => {
    const { client, calls } = makeClient({
      data: [categoryRow({ id: "1" }), categoryRow({ id: "2" })],
      error: null,
    });
    const cats = await createCategoryRepository(client).listForUser("A");
    expect(argsOf(calls, "eq")).toEqual(["user_id", "A"]);
    const orderCalls = calls.filter(([m]) => m === "order").map((c) => c.slice(1));
    expect(orderCalls).toEqual([
      ["display_order", { ascending: true }],
      ["name", { ascending: true }],
    ]);
    expect(cats.map((c) => c.id)).toEqual(["1", "2"]);
  });

  test("propagates a query failure as FinanceDataError", async () => {
    const { client } = makeClient({ data: null, error: pgError({ code: "08006" }) });
    await expect(createCategoryRepository(client).listForUser("A")).rejects.toBeInstanceOf(
      FinanceDataError,
    );
  });
});

describe("listByUser", () => {
  test("orders by display_order then name with NO user_id filter (RLS scopes it)", async () => {
    const { client, calls } = makeClient({ data: [categoryRow()], error: null });
    const cats = await createCategoryRepository(client).listByUser();
    expect(argsOf(calls, "eq")).toBeUndefined();
    const orderCalls = calls.filter(([m]) => m === "order").map((c) => c.slice(1));
    expect(orderCalls).toEqual([
      ["display_order", { ascending: true }],
      ["name", { ascending: true }],
    ]);
    expect(cats).toHaveLength(1);
  });

  test("propagates a query failure as FinanceDataError", async () => {
    const { client } = makeClient({ data: null, error: pgError({ code: "42501" }) });
    await expect(createCategoryRepository(client).listByUser()).rejects.toBeInstanceOf(
      FinanceDataError,
    );
  });
});
