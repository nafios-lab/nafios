import { beforeEach, describe, expect, test } from "bun:test";
import type { AuthSession, AuthUser } from "@nafios/auth-core";
// The server-fn handlers run for real against the shared seams declared in
// tests/setup.ts (createServerFn is stubbed there to a directly-callable handler,
// and auth-core/database are mocked as spies). We import the REAL modules and
// drive them through those spies.
import { getSessionFn, getUserFn, signInFn, signOutFn, signUpFn } from "../../src/lib/auth-fns.ts";
import { getOnboardingStatusFn, insertUserProfileFn } from "../../src/lib/onboarding-fns.ts";
import {
  createServerDb,
  eq,
  from,
  getSession,
  getUser,
  insertUserProfile,
  maybeSingle,
  resetServerFnMocks,
  signInWithPassword,
  signOut,
  signUp,
} from "../setup.ts";

// Minimal stand-ins; only the fields the handlers read matter, so we narrow-cast
// rather than constructing a full Supabase session/user.
const fakeSession = (id: string) => ({ user: { id } }) as unknown as AuthSession;
const fakeUser = (props: Record<string, unknown>) => props as unknown as AuthUser;

beforeEach(resetServerFnMocks);

describe("getSessionFn", () => {
  test("returns the session when getSession succeeds", async () => {
    const session = fakeSession("u1");
    getSession.mockResolvedValue({ error: null, data: { session } });
    expect(await getSessionFn()).toEqual({ session });
  });

  test("returns null session when getSession errors", async () => {
    getSession.mockResolvedValue({ error: { message: "boom" }, data: { session: null } });
    expect(await getSessionFn()).toEqual({ session: null });
  });
});

describe("getUserFn", () => {
  test("returns the user when getUser succeeds", async () => {
    const user = fakeUser({ id: "u1", email: "a@nafios.local" });
    getUser.mockResolvedValue({ error: null, data: { user } });
    expect(await getUserFn()).toEqual({ user });
  });

  test("returns null user when getUser errors", async () => {
    getUser.mockResolvedValue({ error: { message: "boom" }, data: { user: null } });
    expect(await getUserFn()).toEqual({ user: null });
  });
});

describe("signOutFn", () => {
  test("invokes signOut and reports success", async () => {
    expect(await signOutFn()).toEqual({ success: true });
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

describe("signUpFn", () => {
  const input = { email: "new@nafios.local", password: "hunter2hunter2" };

  test("resume path: returns the existing user without re-registering", async () => {
    const existingUser = fakeUser({ id: "u-existing" });
    getSession.mockResolvedValue({ error: null, data: { session: { user: existingUser } } });

    const result = await signUpFn({ data: input });

    expect(result).toEqual({ ok: true, user: existingUser });
    expect(signUp).not.toHaveBeenCalled();
  });

  test("registers when there is no existing session and forwards validated data", async () => {
    getSession.mockResolvedValue({ error: null, data: { session: null } });
    const user = fakeUser({ id: "u-new", email: input.email });
    signUp.mockResolvedValue({ error: null, data: { user } });

    const result = await signUpFn({ data: input });

    expect(result).toEqual({ ok: true, user });
    expect(signUp).toHaveBeenCalledTimes(1);
    expect(signUp).toHaveBeenCalledWith({ __authClient: true }, input);
  });

  test("treats an errored session probe as no session (still attempts signUp)", async () => {
    getSession.mockResolvedValue({ error: { message: "expired" }, data: { session: null } });
    const user = fakeUser({ id: "u-new" });
    signUp.mockResolvedValue({ error: null, data: { user } });

    const result = await signUpFn({ data: input });

    expect(result).toEqual({ ok: true, user });
    expect(signUp).toHaveBeenCalledTimes(1);
  });

  test("surfaces an auth failure as ok:false data with code and message", async () => {
    getSession.mockResolvedValue({ error: null, data: { session: null } });
    signUp.mockResolvedValue({
      error: { code: "user_already_exists", message: "User already registered" },
    });

    const result = await signUpFn({ data: input });

    expect(result).toEqual({
      ok: false,
      code: "user_already_exists",
      message: "User already registered",
    });
  });
});

describe("signInFn", () => {
  const input = { email: "user@nafios.local", password: "hunter2hunter2" };

  test("returns ok:true with the user and forwards validated data to the client", async () => {
    const user = fakeUser({ id: "u1", email: input.email });
    signInWithPassword.mockResolvedValue({ error: null, data: { user, session: {} } });

    const result = await signInFn({ data: input });

    expect(result).toEqual({ ok: true, user });
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
    expect(signInWithPassword).toHaveBeenCalledWith({ __authClient: true }, input);
  });

  test("surfaces an auth failure as ok:false data with code and message", async () => {
    signInWithPassword.mockResolvedValue({
      error: { code: "invalid_credentials", message: "Invalid login credentials" },
    });

    const result = await signInFn({ data: input });

    expect(result).toEqual({
      ok: false,
      code: "invalid_credentials",
      message: "Invalid login credentials",
    });
  });
});

describe("insertUserProfileFn", () => {
  test("forwards validated input to insertUserProfile and reports success", async () => {
    const data = { avatarUrl: null, familyMembers: [] };

    const result = await insertUserProfileFn({ data });

    expect(result).toEqual({ success: true });
    expect(insertUserProfile).toHaveBeenCalledTimes(1);
    expect(insertUserProfile).toHaveBeenCalledWith({ from }, data);
  });
});

describe("getOnboardingStatusFn", () => {
  test("returns no session / incomplete when there is no session", async () => {
    getSession.mockResolvedValue({ error: null, data: { session: null } });

    const result = await getOnboardingStatusFn();

    expect(result).toEqual({ session: null, onboardingCompleted: false });
    expect(createServerDb).not.toHaveBeenCalled();
  });

  test("treats an errored session probe as no session", async () => {
    getSession.mockResolvedValue({ error: { message: "expired" }, data: { session: null } });

    const result = await getOnboardingStatusFn();

    expect(result).toEqual({ session: null, onboardingCompleted: false });
  });

  test("reports onboardingCompleted=false when the profile has no completion timestamp", async () => {
    const session = fakeSession("u1");
    getSession.mockResolvedValue({ error: null, data: { session } });
    maybeSingle.mockResolvedValue({ data: { onboarding_completed_at: null } });

    const result = await getOnboardingStatusFn();

    expect(result).toEqual({ session, onboardingCompleted: false });
    expect(from).toHaveBeenCalledWith("profiles");
    expect(eq).toHaveBeenCalledWith("id", "u1");
  });

  test("reports onboardingCompleted=true when the profile carries a timestamp", async () => {
    const session = fakeSession("u1");
    getSession.mockResolvedValue({ error: null, data: { session } });
    maybeSingle.mockResolvedValue({
      data: { onboarding_completed_at: "2026-06-18T00:00:00Z" },
    });

    const result = await getOnboardingStatusFn();

    expect(result).toEqual({ session, onboardingCompleted: true });
  });

  test("reports onboardingCompleted=false when no profile row exists", async () => {
    const session = fakeSession("u1");
    getSession.mockResolvedValue({ error: null, data: { session } });
    maybeSingle.mockResolvedValue({ data: null });

    const result = await getOnboardingStatusFn();

    expect(result).toEqual({ session, onboardingCompleted: false });
  });
});
