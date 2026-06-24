import { describe, expect, test } from "bun:test";
import {
  getSession,
  getUser,
  resetPasswordForEmail,
  signInWithPassword,
  signOut,
  signUp,
  updatePassword,
  updateUserMetadata,
} from "../../src/auth";
import type { AuthClient } from "../../src/types";

/**
 * Creates a fake AuthClient whose `.auth` methods return the given results.
 * This avoids hitting Supabase and lets us test the mapping logic in isolation.
 */
function fakeClient(authOverrides: Record<string, unknown>): AuthClient {
  const supabaseClient = {
    auth: {
      signUp: async () => ({ data: { user: null, session: null }, error: null }),
      signInWithPassword: async () => ({
        data: { user: null, session: null },
        error: null,
      }),
      signOut: async () => ({ error: null }),
      getSession: async () => ({
        data: { session: null },
        error: null,
      }),
      getUser: async () => ({ data: { user: null }, error: null }),
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
      updateUser: async () => ({ data: { user: null }, error: null }),
      ...authOverrides,
    },
  };
  return supabaseClient as unknown as AuthClient;
}

const MOCK_SUPA_USER = {
  id: "user-123",
  email: "test@example.com",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
};

const MOCK_SUPA_SESSION = {
  access_token: "access-tok",
  refresh_token: "refresh-tok",
  expires_at: 1800000000,
  user: MOCK_SUPA_USER,
};

const MOCK_AUTH_ERROR = {
  message: "Something went wrong",
  code: "auth_error",
  name: "AuthApiError",
  status: 400,
  __isAuthError: true,
};

/* ------------------------------------------------------------------ */
/*  signUp                                                            */
/* ------------------------------------------------------------------ */

describe("signUp", () => {
  test("maps a successful signup result", async () => {
    const client = fakeClient({
      signUp: async () => ({
        data: { user: MOCK_SUPA_USER, session: MOCK_SUPA_SESSION },
        error: null,
      }),
    });

    const result = await signUp(client, {
      email: "test@example.com",
      password: "password123",
    });

    expect(result.error).toBeNull();
    expect(result.data?.user?.id).toBe("user-123");
    expect(result.data?.user?.email).toBe("test@example.com");
    expect(result.data?.user?.emailConfirmedAt).toBe("2026-01-01T00:00:00Z");
    expect(result.data?.session?.accessToken).toBe("access-tok");
  });

  test("maps an error result", async () => {
    const client = fakeClient({
      signUp: async () => ({
        data: { user: null, session: null },
        error: MOCK_AUTH_ERROR,
      }),
    });

    const result = await signUp(client, {
      email: "test@example.com",
      password: "short",
    });

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe("Something went wrong");
    expect(result.error?.code).toBe("auth_error");
  });
});

/* ------------------------------------------------------------------ */
/*  signInWithPassword                                                */
/* ------------------------------------------------------------------ */

describe("signInWithPassword", () => {
  test("maps a successful sign-in", async () => {
    const client = fakeClient({
      signInWithPassword: async () => ({
        data: { user: MOCK_SUPA_USER, session: MOCK_SUPA_SESSION },
        error: null,
      }),
    });

    const result = await signInWithPassword(client, {
      email: "test@example.com",
      password: "password123",
    });

    expect(result.error).toBeNull();
    expect(result.data?.user.id).toBe("user-123");
    expect(result.data?.session.accessToken).toBe("access-tok");
  });

  test("maps invalid credentials error", async () => {
    const client = fakeClient({
      signInWithPassword: async () => ({
        data: { user: null, session: null },
        error: { ...MOCK_AUTH_ERROR, message: "Invalid login credentials" },
      }),
    });

    const result = await signInWithPassword(client, {
      email: "test@example.com",
      password: "wrong",
    });

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe("Invalid login credentials");
  });
});

/* ------------------------------------------------------------------ */
/*  signOut                                                           */
/* ------------------------------------------------------------------ */

describe("signOut", () => {
  test("returns success on sign-out", async () => {
    const client = fakeClient({ signOut: async () => ({ error: null }) });
    const result = await signOut(client);

    expect(result.error).toBeNull();
    expect(result.data).toBeNull();
  });

  test("maps sign-out error", async () => {
    const client = fakeClient({
      signOut: async () => ({ error: MOCK_AUTH_ERROR }),
    });

    const result = await signOut(client);
    expect(result.error?.message).toBe("Something went wrong");
  });
});

/* ------------------------------------------------------------------ */
/*  getSession                                                        */
/* ------------------------------------------------------------------ */

describe("getSession", () => {
  test("maps an active session", async () => {
    const client = fakeClient({
      getSession: async () => ({
        data: { session: MOCK_SUPA_SESSION },
        error: null,
      }),
    });

    const result = await getSession(client);

    expect(result.error).toBeNull();
    expect(result.data?.session?.accessToken).toBe("access-tok");
    expect(result.data?.session?.user.email).toBe("test@example.com");
  });

  test("returns null session when not authenticated", async () => {
    const client = fakeClient({
      getSession: async () => ({
        data: { session: null },
        error: null,
      }),
    });

    const result = await getSession(client);

    expect(result.error).toBeNull();
    expect(result.data?.session).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  getUser                                                           */
/* ------------------------------------------------------------------ */

describe("getUser", () => {
  test("maps the current user", async () => {
    const client = fakeClient({
      getUser: async () => ({
        data: { user: MOCK_SUPA_USER },
        error: null,
      }),
    });

    const result = await getUser(client);

    expect(result.error).toBeNull();
    expect(result.data?.user.id).toBe("user-123");
    expect(result.data?.user.createdAt).toBe("2026-01-01T00:00:00Z");
    // No user_metadata on the mock → mobile is undefined.
    expect(result.data?.user.mobile).toBeUndefined();
  });

  test("surfaces user_metadata.mobile on the mapped user", async () => {
    const client = fakeClient({
      getUser: async () => ({
        data: { user: { ...MOCK_SUPA_USER, user_metadata: { mobile: "(+65) 9123 4567" } } },
        error: null,
      }),
    });

    const result = await getUser(client);

    expect(result.data?.user.mobile).toBe("(+65) 9123 4567");
  });

  test("maps error when no session", async () => {
    const client = fakeClient({
      getUser: async () => ({
        data: { user: null },
        error: MOCK_AUTH_ERROR,
      }),
    });

    const result = await getUser(client);

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe("Something went wrong");
  });
});

/* ------------------------------------------------------------------ */
/*  resetPasswordForEmail                                             */
/* ------------------------------------------------------------------ */

describe("resetPasswordForEmail", () => {
  test("returns success", async () => {
    const client = fakeClient({
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
    });

    const result = await resetPasswordForEmail(client, "test@example.com");
    expect(result.error).toBeNull();
  });

  test("maps error", async () => {
    const client = fakeClient({
      resetPasswordForEmail: async () => ({
        data: null,
        error: MOCK_AUTH_ERROR,
      }),
    });

    const result = await resetPasswordForEmail(client, "test@example.com");
    expect(result.error?.message).toBe("Something went wrong");
  });
});

/* ------------------------------------------------------------------ */
/*  updatePassword                                                    */
/* ------------------------------------------------------------------ */

describe("updatePassword", () => {
  test("maps successful password update", async () => {
    const client = fakeClient({
      updateUser: async () => ({
        data: { user: MOCK_SUPA_USER },
        error: null,
      }),
    });

    const result = await updatePassword(client, "newPassword123");

    expect(result.error).toBeNull();
    expect(result.data?.user.id).toBe("user-123");
  });

  test("maps error", async () => {
    const client = fakeClient({
      updateUser: async () => ({
        data: { user: null },
        error: MOCK_AUTH_ERROR,
      }),
    });

    const result = await updatePassword(client, "weak");

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe("Something went wrong");
  });
});

/* ------------------------------------------------------------------ */
/*  updateUserMetadata                                                */
/* ------------------------------------------------------------------ */

describe("updateUserMetadata", () => {
  test("passes the metadata under `data` and maps the user", async () => {
    let received: unknown;
    const client = fakeClient({
      updateUser: async (args: unknown) => {
        received = args;
        return { data: { user: MOCK_SUPA_USER }, error: null };
      },
    });

    const result = await updateUserMetadata(client, { mobile: "(+65) 9123 4567" });

    expect(received).toEqual({ data: { mobile: "(+65) 9123 4567" } });
    expect(result.error).toBeNull();
    expect(result.data?.user.id).toBe("user-123");
  });

  test("maps error", async () => {
    const client = fakeClient({
      updateUser: async () => ({ data: { user: null }, error: MOCK_AUTH_ERROR }),
    });

    const result = await updateUserMetadata(client, { mobile: "(+65) 9123 4567" });

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe("Something went wrong");
  });
});
