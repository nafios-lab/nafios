import { beforeEach, describe, expect, mock, test } from "bun:test";

// Mock the two workspace deps the connection spine wraps. We test that finance
// delegates to supabase-core + asDb — not the real SDK (that is proven by the
// live-DB integration suite, run outside `bun run check`).
const browserSentinel = { __kind: "browser" };
const serviceSentinel = { __kind: "service" };
let browserCalled = 0;
let serviceCalled = 0;

mock.module("@nafios/supabase-core", () => ({
  createBrowserClient: () => {
    browserCalled += 1;
    return browserSentinel;
  },
  createServiceRoleClient: () => {
    serviceCalled += 1;
    return serviceSentinel;
  },
}));

// asDb is the schema-typing overlay — at runtime it returns the same client.
mock.module("@nafios/database", () => ({
  asDb: (client: unknown) => client,
}));

// Dynamic import AFTER the mocks so the real workspace deps never load — a
// static (hoisted) import would pull @nafios/database + @nafios/supabase-core
// into this package's coverage report and trip the per-file 90% gate. Same
// pattern as packages/database/tests/unit/client.test.ts.
const { createBrowserClient, createServiceClient } = await import("../../src/internal/client");

describe("createBrowserClient", () => {
  beforeEach(() => {
    browserCalled = 0;
  });

  test("delegates to supabase-core's browser client, wrapped by asDb", () => {
    const client = createBrowserClient();
    expect(browserCalled).toBe(1);
    // Identity check via Object.is — `client` is typed FinanceClient (Db), so a
    // direct toBe(sentinel) would be a type error against the mocked return.
    expect(Object.is(client, browserSentinel)).toBe(true);
  });
});

describe("createServiceClient", () => {
  beforeEach(() => {
    serviceCalled = 0;
  });

  test("delegates to createServiceRoleClient, wrapped by asDb", () => {
    const client = createServiceClient();
    expect(serviceCalled).toBe(1);
    expect(Object.is(client, serviceSentinel)).toBe(true);
  });
});
