import { describe, expect, test } from "bun:test";
// src/lib/database wraps the (mocked) @nafios/database browser client. The
// singleton is process-shared across the whole test run, so we assert identity
// (getDb() returns the mocked `db` and is memoized) rather than call counts.
import { getDb } from "../../src/lib/database.ts";
import { db } from "../setup.ts";

describe("getDb", () => {
  test("returns the browser data client", () => {
    expect(getDb()).toBe(db as never);
  });

  test("memoizes — repeated calls return the same reference", () => {
    expect(getDb()).toBe(getDb());
  });
});
