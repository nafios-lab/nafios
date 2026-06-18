import { describe, expect, mock, test } from "bun:test";

// Mock the connection layer. auth-core no longer talks to @supabase directly —
// it wraps a client from @nafios/supabase-core into an opaque AuthClient.
// Env/config behavior is tested in supabase-core, not here.
const fakeRawClient = { auth: {} };

mock.module("@nafios/supabase-core", () => ({
  createServerClient: () => fakeRawClient,
  createBrowserClient: () => fakeRawClient,
}));

const { createBrowserClient, createServerClient } = await import("../../src/client");

describe("createServerClient", () => {
  test("wraps the connection-layer client into an AuthClient", () => {
    const cookies = {
      getAll: () => [],
      setAll: () => {},
    };

    const client = createServerClient(cookies);
    expect(client).toBeDefined();
  });
});

describe("createBrowserClient", () => {
  test("wraps the connection-layer client into an AuthClient", () => {
    const client = createBrowserClient();
    expect(client).toBeDefined();
  });
});
