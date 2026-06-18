import { describe, expect, mock, test } from "bun:test";

// Mock the connection layer — database is responsible for schema typing, not
// for the connection itself (that's supabase-core's job, tested there).
const fakeRawClient: unknown = { from: () => ({}), rpc: () => ({}) };

mock.module("@nafios/supabase-core", () => ({
  createServerClient: () => fakeRawClient,
  createBrowserClient: () => fakeRawClient,
}));

const { asDb, createBrowserDb, createServerDb } = await import("../../src/client");

describe("asDb", () => {
  test("returns the same client instance (typing is compile-time only)", () => {
    // biome-ignore lint/suspicious/noExplicitAny: test double for an opaque cast
    const result = asDb(fakeRawClient as any);
    // Identity check, not `toBe(fakeRawClient)`: the typed overload of `toBe`
    // would demand the loose fake satisfy the full `Db` type.
    expect(result === fakeRawClient).toBe(true);
  });
});

describe("createServerDb", () => {
  test("returns a client built from the connection layer", () => {
    const db = createServerDb({ getAll: () => [], setAll: () => {} });
    expect(db === fakeRawClient).toBe(true);
  });
});

describe("createBrowserDb", () => {
  test("returns a client built from the connection layer", () => {
    const db = createBrowserDb();
    expect(db === fakeRawClient).toBe(true);
  });
});
