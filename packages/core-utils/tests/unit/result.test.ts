import { test, expect } from "bun:test";
import { ok, err, isOk, isErr } from "../../src";

test("ok wraps a value and is frozen", () => {
  const r = ok(42);
  expect(isOk(r)).toBe(true);
  if (isOk(r)) expect(r.value).toBe(42);
  expect(Object.isFrozen(r)).toBe(true);
});

test("err wraps an error", () => {
  const r = err(new Error("boom"));
  expect(isErr(r)).toBe(true);
  if (isErr(r)) expect(r.error.message).toBe("boom");
});
