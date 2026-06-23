import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createServiceRoleClient } from "../../src/service-role-client";

// Mock @supabase/supabase-js at module level — we test env/config behavior and
// the session-less options we pass, not the real SDK.
const mockSupabaseClient = { storage: {}, auth: {} };
let lastCreateClientArgs: unknown[] = [];

mock.module("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => {
    lastCreateClientArgs = args;
    return mockSupabaseClient;
  },
}));

describe("createServiceRoleClient", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SUPABASE_URL = "http://localhost:54321";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    lastCreateClientArgs = [];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("returns a client when env vars are set", () => {
    const client = createServiceRoleClient();
    expect(client).toBeDefined();
  });

  test("constructs a session-less client (no persistence, no auto-refresh)", () => {
    createServiceRoleClient();
    const [url, key, options] = lastCreateClientArgs as [
      string,
      string,
      { auth: { persistSession: boolean; autoRefreshToken: boolean } },
    ];
    expect(url).toBe("http://localhost:54321");
    expect(key).toBe("test-service-role-key");
    expect(options.auth.persistSession).toBe(false);
    expect(options.auth.autoRefreshToken).toBe(false);
  });

  test("throws when SUPABASE_URL is missing", () => {
    process.env.SUPABASE_URL = undefined;
    expect(() => createServiceRoleClient()).toThrow("Missing env: SUPABASE_URL");
  });

  test("throws when SUPABASE_SERVICE_ROLE_KEY is missing", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = undefined;
    expect(() => createServiceRoleClient()).toThrow("Missing env: SUPABASE_SERVICE_ROLE_KEY");
  });
});
