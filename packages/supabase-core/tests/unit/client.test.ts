import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createBrowserClient, createServerClient } from "../../src/client";

// Mock @supabase/ssr at module level — we test connection/config behavior,
// not the real SDK.
const mockSupabaseClient = { auth: {} };

mock.module("@supabase/ssr", () => ({
  createServerClient: () => mockSupabaseClient,
  createBrowserClient: () => mockSupabaseClient,
}));

describe("createServerClient", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SUPABASE_URL = "http://localhost:54321";
    process.env.SUPABASE_ANON_KEY = "test-anon-key";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("returns a client when env vars are set", () => {
    const cookies = {
      getAll: () => [],
      setAll: () => {},
    };

    const client = createServerClient(cookies);
    expect(client).toBeDefined();
  });

  test("throws when SUPABASE_URL is missing", () => {
    process.env.SUPABASE_URL = undefined;

    const cookies = {
      getAll: () => [],
      setAll: () => {},
    };

    expect(() => createServerClient(cookies)).toThrow("Missing env: SUPABASE_URL");
  });

  test("throws when SUPABASE_ANON_KEY is missing", () => {
    process.env.SUPABASE_ANON_KEY = undefined;

    const cookies = {
      getAll: () => [],
      setAll: () => {},
    };

    expect(() => createServerClient(cookies)).toThrow("Missing env: SUPABASE_ANON_KEY");
  });
});

describe("createBrowserClient", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SUPABASE_URL = "http://localhost:54321";
    process.env.SUPABASE_ANON_KEY = "test-anon-key";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("returns a client when env vars are set", () => {
    const client = createBrowserClient();
    expect(client).toBeDefined();
  });

  test("throws when SUPABASE_URL is missing", () => {
    process.env.SUPABASE_URL = undefined;
    expect(() => createBrowserClient()).toThrow("Missing env: SUPABASE_URL");
  });
});
