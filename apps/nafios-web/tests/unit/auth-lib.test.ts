import { beforeEach, describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
// src/lib/auth wraps the (mocked) auth-core browser client. We drive `getSession`
// through the shared spy and assert the query normalizes + invalidates.
import {
  getAuthClient,
  invalidateSession,
  sessionQueryKey,
  sessionQueryOptions,
} from "../../src/lib/auth.ts";
import { getSession, resetAuthMocks } from "../setup.ts";

beforeEach(resetAuthMocks);

describe("getAuthClient", () => {
  test("constructs the browser client once and reuses the instance", () => {
    const a = getAuthClient();
    const b = getAuthClient();
    expect(b).toBe(a);
  });
});

describe("sessionQueryOptions", () => {
  test("is keyed on ['session']", () => {
    expect(sessionQueryKey[0]).toBe("session");
    expect(sessionQueryOptions.queryKey[0]).toBe("session");
  });

  test("resolves the session when getSession succeeds", async () => {
    getSession.mockResolvedValueOnce({
      error: null,
      data: {
        session: { accessToken: "tok", refreshToken: "r", expiresAt: 1, user: { id: "u1" } },
      },
    });

    const result = await new QueryClient().fetchQuery(sessionQueryOptions);

    expect(result?.accessToken).toBe("tok");
  });

  test("resolves null when getSession errors", async () => {
    getSession.mockResolvedValueOnce({ error: { message: "boom" }, data: null });

    const result = await new QueryClient().fetchQuery(sessionQueryOptions);

    expect(result).toBeNull();
  });

  test("resolves null when there is no session", async () => {
    // Default spy resolves { session: null } — the signed-out steady state.
    const result = await new QueryClient().fetchQuery(sessionQueryOptions);

    expect(result).toBeNull();
  });
});

describe("invalidateSession", () => {
  test("removes the cached session so the next guard refetches", async () => {
    const queryClient = new QueryClient();
    let calledWith: unknown;
    // Must REMOVE, not invalidate — ensureQueryData returns stale cached data.
    queryClient.removeQueries = ((arg: unknown) => {
      calledWith = arg;
    }) as typeof queryClient.removeQueries;

    await invalidateSession(queryClient);

    expect(calledWith).toEqual({ queryKey: sessionQueryKey });
  });

  test("makes a subsequently-ensured session refetch (not return stale cache)", async () => {
    const queryClient = new QueryClient();
    // Seed a stale `null` as if the guard had cached "signed out" on load.
    queryClient.setQueryData(sessionQueryKey, null);
    getSession.mockResolvedValueOnce({
      error: null,
      data: {
        session: { accessToken: "fresh", refreshToken: "r", expiresAt: 1, user: { id: "u1" } },
      },
    });

    await invalidateSession(queryClient);
    const result = await queryClient.ensureQueryData(sessionQueryOptions);

    expect(result?.accessToken).toBe("fresh");
  });
});
