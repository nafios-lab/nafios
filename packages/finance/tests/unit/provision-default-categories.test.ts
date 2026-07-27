import { describe, expect, test } from "bun:test";
import type { PostgrestError } from "@nafios/supabase-core";
import { DEFAULT_CATEGORIES } from "../../src/domain/default-categories";
import type { FinanceClient } from "../../src/internal/client";
import { FinanceDataError } from "../../src/internal/errors";
import type { CategoryRow } from "../../src/internal/mappers/category.mapper";
import {
  listCategories,
  provisionDefaultCategories,
} from "../../src/internal/provisioning/provision-default-categories";

// UNIT tests over the provisioning API's control flow (the count-guard) and the
// listCategories passthrough against a FAKE client that returns a QUEUE of
// results (one per awaited query). The full §6.2 behavior (real idempotency
// against a live DB, re-seed-on-empty, RLS isolation) is proven by the repo-root
// live matrix (tests/integration/provision-default-categories.test.ts).

type QueryResult = { data?: unknown; count?: number | null; error: PostgrestError | null };

/** A fake client whose awaited queries consume `results` in order. Each entry is
 *  one full builder chain's resolved value (count query, insert, or list). */
function makeClient(results: QueryResult[]) {
  const queue = [...results];
  const inserts: unknown[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order"]) {
    builder[method] = () => builder;
  }
  builder.insert = (rows: unknown) => {
    inserts.push(rows);
    return builder;
  };
  // biome-ignore lint/suspicious/noThenProperty: deliberate query-builder stub
  builder.then = (resolve: (v: QueryResult) => void) => {
    const next = queue.shift();
    if (!next) {
      throw new Error("fake client: more queries than queued results");
    }
    resolve(next);
  };
  const client = { from: () => builder };
  return { client: client as unknown as FinanceClient, inserts };
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

const catalogRows: CategoryRow[] = DEFAULT_CATEGORIES.map((c, i) => ({
  id: `id-${i}`,
  name: c.name,
  display_order: c.displayOrder,
  color: null,
}));

describe("provisionDefaultCategories", () => {
  test("zero categories → seeds the catalog, sets user_id explicitly, returns { seeded: true }", async () => {
    // (1) count → 0, then (2) insert returns the seeded rows.
    const { client, inserts } = makeClient([
      { count: 0, error: null },
      { data: catalogRows, error: null },
    ]);
    const result = await provisionDefaultCategories(client, "A");

    expect(result.seeded).toBe(true);
    expect(result.categories).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(result.categories.map((c) => c.name)).toEqual(DEFAULT_CATEGORIES.map((c) => c.name));
    // Every inserted row is user A's, color null, in catalog order.
    const rows = inserts[0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(rows.every((r) => r.user_id === "A")).toBe(true);
    expect(rows.every((r) => r.color === null)).toBe(true);
    expect(rows.map((r) => r.name)).toEqual(DEFAULT_CATEGORIES.map((c) => c.name));
  });

  test("already stocked (count > 0) → NO insert, returns { seeded: false } with the existing set", async () => {
    // (1) count → 7, then (2) listForUser returns the existing rows. No insert.
    const existing = catalogRows.slice(0, 7);
    const { client, inserts } = makeClient([
      { count: 7, error: null },
      { data: existing, error: null },
    ]);
    const result = await provisionDefaultCategories(client, "A");

    expect(result.seeded).toBe(false);
    expect(result.categories).toHaveLength(7);
    expect(inserts).toHaveLength(0); // the count-guard prevented any write
  });

  test("propagates a DB fault on the count-guard as FinanceDataError", async () => {
    const { client } = makeClient([
      { count: null, error: { code: "42501", name: "PostgrestError" } as PostgrestError },
    ]);
    await expect(provisionDefaultCategories(client, "A")).rejects.toBeInstanceOf(FinanceDataError);
  });
});

describe("listCategories", () => {
  test("is a passthrough to the repository's listByUser (ordered read, no write)", async () => {
    const { client, inserts } = makeClient([{ data: [categoryRow()], error: null }]);
    const cats = await listCategories(client);
    expect(cats).toHaveLength(1);
    expect(inserts).toHaveLength(0);
  });
});
