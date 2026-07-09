import { describe, expect, test } from "bun:test";
import {
  type CategoryRow,
  newCategoryToInsertRow,
  rowToCategory,
} from "../../src/internal/mappers/category.mapper";

// UNIT tests over the category mapper (EF3.9 §4.2). The simplest mapper in the
// package: a column rename (display_order → displayOrder), a verbatim color
// passthrough, and — on write — the EXPLICIT user_id + the display_order/color
// defaults. No money, no enum, no status seam.

function categoryRow(overrides: Partial<CategoryRow> = {}): CategoryRow {
  return {
    id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    name: "Bills",
    display_order: 3,
    color: null,
    ...overrides,
  };
}

describe("rowToCategory", () => {
  test("renames display_order → displayOrder and passes id/name/color through", () => {
    expect(rowToCategory(categoryRow({ color: "#abc123" }))).toEqual({
      id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      name: "Bills",
      displayOrder: 3,
      color: "#abc123",
    });
  });

  test("passes a null color through verbatim", () => {
    expect(rowToCategory(categoryRow()).color).toBeNull();
  });
});

describe("newCategoryToInsertRow", () => {
  test("sets user_id EXPLICITLY to the passed userId (never the auth.uid() omit path)", () => {
    const row = newCategoryToInsertRow("00000000-0000-0000-0000-000000000001", { name: "Debt" });
    expect(row.user_id).toBe("00000000-0000-0000-0000-000000000001");
    expect(row.name).toBe("Debt");
  });

  test("defaults display_order to 0 and color to null when omitted; omits id/timestamps", () => {
    const row = newCategoryToInsertRow("A", { name: "Debt" });
    expect(row.display_order).toBe(0);
    expect(row.color).toBeNull();
    expect(row).not.toHaveProperty("id");
    expect(row).not.toHaveProperty("created_at");
    expect(row).not.toHaveProperty("updated_at");
  });

  test("carries an explicit displayOrder and color through", () => {
    const row = newCategoryToInsertRow("A", { name: "Life", displayOrder: 7, color: "#fff" });
    expect(row.display_order).toBe(7);
    expect(row.color).toBe("#fff");
  });
});
