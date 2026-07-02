import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createAuthedClient } from "../../src/authed-client";

// Mock @supabase/supabase-js at module level — we test env/config behavior and
// the per-request JWT + session-less options we pass, not the real SDK.
const mockSupabaseClient = { auth: {}, from: () => ({}) };
let lastCreateClientArgs: unknown[] = [];

mock.module("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => {
    lastCreateClientArgs = args;
    return mockSupabaseClient;
  },
}));

describe("createAuthedClient", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SUPABASE_URL = "http://localhost:54321";
    process.env.SUPABASE_ANON_KEY = "test-anon-key";
    lastCreateClientArgs = [];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("returns a client when env vars are set", () => {
    const client = createAuthedClient("jwt-token");
    expect(client).toBeDefined();
  });

  test("attaches the JWT as a Bearer Authorization header, session-less", () => {
    createAuthedClient("jwt-token");
    const [url, key, options] = lastCreateClientArgs as [
      string,
      string,
      {
        global: { headers: { Authorization: string } };
        auth: { persistSession: boolean; autoRefreshToken: boolean };
      },
    ];
    expect(url).toBe("http://localhost:54321");
    expect(key).toBe("test-anon-key");
    expect(options.global.headers.Authorization).toBe("Bearer jwt-token");
    expect(options.auth.persistSession).toBe(false);
    expect(options.auth.autoRefreshToken).toBe(false);
  });

  test("throws when SUPABASE_URL is missing", () => {
    process.env.SUPABASE_URL = undefined;
    expect(() => createAuthedClient("jwt-token")).toThrow("Missing env: SUPABASE_URL");
  });

  test("throws when SUPABASE_ANON_KEY is missing", () => {
    process.env.SUPABASE_ANON_KEY = undefined;
    expect(() => createAuthedClient("jwt-token")).toThrow("Missing env: SUPABASE_ANON_KEY");
  });
});
