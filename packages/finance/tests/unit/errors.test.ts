import { describe, expect, test } from "bun:test";
import type { PostgrestError } from "@nafios/supabase-core";
import { FinanceDataError, mapPostgrestError } from "../../src/internal/errors";

// A raw PostgrestError as supabase-js hands it back. The constraint name lives
// inside `message` (and sometimes `details`) — exactly where the classifier
// reads it from. `name` is required by the SDK type.
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

describe("mapPostgrestError — the 23505 split by constraint name", () => {
  test("uq_ledger_user_month → duplicate_month", () => {
    const raw = pgError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "uq_ledger_user_month"',
    });
    const err = mapPostgrestError(raw);
    expect(err).toBeInstanceOf(FinanceDataError);
    expect(err.code).toBe("duplicate_month");
    expect(err.constraint).toBe("uq_ledger_user_month");
    expect(err.cause).toBe(raw);
  });

  test("uq_one_ongoing_ledger → ongoing_exists", () => {
    const raw = pgError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "uq_one_ongoing_ledger"',
    });
    const err = mapPostgrestError(raw);
    expect(err.code).toBe("ongoing_exists");
    expect(err.constraint).toBe("uq_one_ongoing_ledger");
  });

  test("any other unique constraint → unknown (constraint still recorded)", () => {
    const raw = pgError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "uq_something_else"',
    });
    const err = mapPostgrestError(raw);
    expect(err.code).toBe("unknown");
    expect(err.constraint).toBe("uq_something_else");
  });
});

describe("mapPostgrestError — other SQLSTATEs", () => {
  test("23514 → check_violation (constraint recorded)", () => {
    const raw = pgError({
      code: "23514",
      message:
        'new row for relation "monthly_ledger" violates check constraint "ck_maxcapped_ceiling"',
    });
    const err = mapPostgrestError(raw);
    expect(err.code).toBe("check_violation");
    expect(err.constraint).toBe("ck_maxcapped_ceiling");
  });

  test("23502 → not_null_violation (no named constraint → null)", () => {
    const raw = pgError({
      code: "23502",
      message:
        'null value in column "user_id" of relation "monthly_ledger" violates not-null constraint',
    });
    const err = mapPostgrestError(raw);
    expect(err.code).toBe("not_null_violation");
    expect(err.constraint).toBeNull();
  });

  test("RLS 42501 → unknown", () => {
    const raw = pgError({ code: "42501", message: "permission denied" });
    const err = mapPostgrestError(raw);
    expect(err.code).toBe("unknown");
    expect(err.constraint).toBeNull();
  });

  test("unmapped/empty SQLSTATE → unknown, raw error on cause", () => {
    const raw = pgError({ code: "08006", message: "connection failure" });
    const err = mapPostgrestError(raw);
    expect(err.code).toBe("unknown");
    expect(err.cause).toBe(raw);
  });

  test("reads the constraint name from details when message lacks it", () => {
    const raw = pgError({
      code: "23514",
      message: "check constraint failed",
      details: 'Failing row … violates check constraint "ck_balances_nonneg".',
    });
    expect(mapPostgrestError(raw).constraint).toBe("ck_balances_nonneg");
  });
});

describe("FinanceDataError shape", () => {
  test("is an Error with name, code in message, and the raw error as cause", () => {
    const raw = pgError({ code: "23505", message: "boom" });
    const err = mapPostgrestError(raw);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("FinanceDataError");
    expect(err.message).toContain("unknown");
    expect(err.message).toContain("boom");
    expect(err.cause).toBe(raw);
  });
});
