import { beforeEach, describe, expect, test } from "bun:test";
import type { AuthSession, AuthUser } from "@nafios/auth-core";
// The server-fn handlers run for real against the shared seams declared in
// tests/setup.ts (createServerFn is stubbed there to a directly-callable handler,
// and auth-core/database are mocked as spies). We import the REAL modules and
// drive them through those spies.
import { getSessionFn, getUserFn, signInFn, signOutFn, signUpFn } from "../../src/lib/auth-fns.ts";
import {
  type CompleteOnboardingMember,
  completeOnboardingFn,
  getOnboardingProfileFn,
  getOnboardingStatusFn,
  saveOnboardingProfileFn,
} from "../../src/lib/onboarding-fns.ts";
import {
  createServerDb,
  eq,
  from,
  getSession,
  getUser,
  insertUserProfile,
  maybeSingle,
  resetServerFnMocks,
  saveOnboardingProfile,
  signAvatarUrl,
  signInWithPassword,
  signOut,
  signUp,
  updateUserMetadata,
  uploadAvatar,
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

describe("completeOnboardingFn", () => {
  const member = (over: Partial<CompleteOnboardingMember> = {}): CompleteOnboardingMember => ({
    name: "Aisha",
    relationship: "spouse",
    ...over,
  });

  test("returns no_session and writes nothing when there is no session", async () => {
    getSession.mockResolvedValue({ error: null, data: { session: null } });

    const result = await completeOnboardingFn({ data: { familyMembers: [member()] } });

    expect(result).toEqual({ ok: false, code: "no_session" });
    expect(uploadAvatar).not.toHaveBeenCalled();
    expect(insertUserProfile).not.toHaveBeenCalled();
  });

  test("stamps completion with an empty family list (Skip & finish)", async () => {
    getSession.mockResolvedValue({ error: null, data: { session: fakeSession("u1") } });

    const result = await completeOnboardingFn({ data: { familyMembers: [] } });

    expect(result).toEqual({ ok: true });
    expect(uploadAvatar).not.toHaveBeenCalled();
    expect(insertUserProfile).toHaveBeenCalledWith({ from }, { familyMembers: [] });
  });

  test("uploads each family avatar (data URL) and maps avatar→avatarUrl", async () => {
    getSession.mockResolvedValue({ error: null, data: { session: fakeSession("u1") } });
    uploadAvatar.mockResolvedValue({ path: "avatars/u1/family/k.webp" });

    const result = await completeOnboardingFn({
      data: {
        familyMembers: [member({ avatar: "data:image/webp;base64,AAAA", nric: "S1234567A" })],
      },
    });

    expect(result).toEqual({ ok: true });
    expect(uploadAvatar).toHaveBeenCalledTimes(1);
    expect(uploadAvatar).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "u1", scope: "family", contentType: "image/webp" }),
    );
    expect(insertUserProfile).toHaveBeenCalledWith(
      { from },
      {
        familyMembers: [
          {
            name: "Aisha",
            relationship: "spouse",
            avatarUrl: "avatars/u1/family/k.webp",
            nric: "S1234567A",
            mobileNo: undefined,
            dateOfBirth: undefined,
          },
        ],
      },
    );
  });

  test("does not upload for a member without an avatar (avatarUrl stays undefined)", async () => {
    getSession.mockResolvedValue({ error: null, data: { session: fakeSession("u1") } });

    const result = await completeOnboardingFn({ data: { familyMembers: [member()] } });

    expect(result).toEqual({ ok: true });
    expect(uploadAvatar).not.toHaveBeenCalled();
    expect(insertUserProfile).toHaveBeenCalledWith(
      { from },
      {
        familyMembers: [
          {
            name: "Aisha",
            relationship: "spouse",
            avatarUrl: undefined,
            nric: undefined,
            mobileNo: undefined,
            dateOfBirth: undefined,
          },
        ],
      },
    );
  });

  test("returns ok:false with the error message when the completion write throws", async () => {
    getSession.mockResolvedValue({ error: null, data: { session: fakeSession("u1") } });
    insertUserProfile.mockRejectedValue(new Error("rpc boom"));

    const result = await completeOnboardingFn({ data: { familyMembers: [] } });

    expect(result).toEqual({ ok: false, code: "rpc boom" });
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

  test("reports incomplete when the profile carries no completion timestamp", async () => {
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
    maybeSingle.mockResolvedValue({ data: { onboarding_completed_at: "2026-06-18T00:00:00Z" } });

    const result = await getOnboardingStatusFn();

    expect(result).toEqual({ session, onboardingCompleted: true });
  });

  test("reports incomplete when no profile row exists", async () => {
    const session = fakeSession("u1");
    getSession.mockResolvedValue({ error: null, data: { session } });
    maybeSingle.mockResolvedValue({ data: null });

    const result = await getOnboardingStatusFn();

    expect(result).toEqual({ session, onboardingCompleted: false });
  });
});

describe("saveOnboardingProfileFn", () => {
  const dataUrl = "data:image/webp;base64,AAAA";

  test("returns no_session and writes nothing when there is no session", async () => {
    getSession.mockResolvedValue({ error: null, data: { session: null } });

    const result = await saveOnboardingProfileFn({
      data: { avatar: dataUrl, mobile: "(+65) 9123 4567" },
    });

    expect(result).toEqual({ ok: false, code: "no_session" });
    expect(uploadAvatar).not.toHaveBeenCalled();
    expect(saveOnboardingProfile).not.toHaveBeenCalled();
    expect(updateUserMetadata).not.toHaveBeenCalled();
  });

  test("uploads the avatar, writes its path, and writes the mobile metadata", async () => {
    const session = fakeSession("u1");
    getSession.mockResolvedValue({ error: null, data: { session } });
    uploadAvatar.mockResolvedValue({ path: "avatars/u1/avatar.webp" });

    const result = await saveOnboardingProfileFn({
      data: { avatar: dataUrl, mobile: "(+65) 9123 4567" },
    });

    expect(result).toEqual({ ok: true });
    expect(uploadAvatar).toHaveBeenCalledTimes(1);
    expect(saveOnboardingProfile).toHaveBeenCalledWith(
      { from },
      { avatarUrl: "avatars/u1/avatar.webp" },
    );
    expect(updateUserMetadata).toHaveBeenCalledWith(
      { __authClient: true },
      { mobile: "(+65) 9123 4567" },
    );
  });

  test("skips the avatar ops when only a mobile is provided", async () => {
    getSession.mockResolvedValue({ error: null, data: { session: fakeSession("u1") } });

    const result = await saveOnboardingProfileFn({ data: { mobile: "(+65) 9123 4567" } });

    expect(result).toEqual({ ok: true });
    expect(uploadAvatar).not.toHaveBeenCalled();
    expect(saveOnboardingProfile).not.toHaveBeenCalled();
    expect(updateUserMetadata).toHaveBeenCalledTimes(1);
  });

  test("skips the mobile write when only an avatar is provided", async () => {
    getSession.mockResolvedValue({ error: null, data: { session: fakeSession("u1") } });

    const result = await saveOnboardingProfileFn({ data: { avatar: dataUrl } });

    expect(result).toEqual({ ok: true });
    expect(uploadAvatar).toHaveBeenCalledTimes(1);
    expect(updateUserMetadata).not.toHaveBeenCalled();
  });

  test("does nothing but succeeds when both fields are empty (Skip-equivalent)", async () => {
    getSession.mockResolvedValue({ error: null, data: { session: fakeSession("u1") } });

    const result = await saveOnboardingProfileFn({ data: {} });

    expect(result).toEqual({ ok: true });
    expect(uploadAvatar).not.toHaveBeenCalled();
    expect(updateUserMetadata).not.toHaveBeenCalled();
  });

  test("does not re-upload an already-stored avatar path", async () => {
    getSession.mockResolvedValue({ error: null, data: { session: fakeSession("u1") } });

    const result = await saveOnboardingProfileFn({ data: { avatar: "avatars/u1/avatar.webp" } });

    expect(result).toEqual({ ok: true });
    expect(uploadAvatar).not.toHaveBeenCalled();
    expect(saveOnboardingProfile).not.toHaveBeenCalled();
  });

  test("returns ok:false with the error code when the mobile write fails", async () => {
    getSession.mockResolvedValue({ error: null, data: { session: fakeSession("u1") } });
    updateUserMetadata.mockResolvedValue({ error: { code: "weak", message: "nope" }, data: null });

    const result = await saveOnboardingProfileFn({ data: { mobile: "(+65) 9123 4567" } });

    expect(result).toEqual({ ok: false, code: "weak" });
  });

  test("returns ok:false when the avatar upload throws", async () => {
    getSession.mockResolvedValue({ error: null, data: { session: fakeSession("u1") } });
    uploadAvatar.mockRejectedValue(new Error("bucket not found"));

    const result = await saveOnboardingProfileFn({ data: { avatar: dataUrl } });

    expect(result).toEqual({ ok: false, code: "bucket not found" });
  });
});

describe("getOnboardingProfileFn", () => {
  test("returns empty values and reads nothing when there is no verified user", async () => {
    getUser.mockResolvedValue({ error: { message: "no session" }, data: null });

    const result = await getOnboardingProfileFn();

    expect(result).toEqual({ avatar: null, phone: "" });
    expect(createServerDb).not.toHaveBeenCalled();
    expect(signAvatarUrl).not.toHaveBeenCalled();
  });

  test("signs the stored avatar path and returns the saved mobile", async () => {
    getUser.mockResolvedValue({
      error: null,
      data: { user: fakeUser({ id: "u1", mobile: "(+65) 9123 4567" }) },
    });
    maybeSingle.mockResolvedValue({
      data: { onboarding_completed_at: null, avatar_url: "avatars/u1/avatar.webp" },
    });
    signAvatarUrl.mockResolvedValue({ url: "https://signed/u1.webp?token=t" });

    const result = await getOnboardingProfileFn();

    expect(from).toHaveBeenCalledWith("profiles");
    expect(eq).toHaveBeenCalledWith("id", "u1");
    expect(signAvatarUrl).toHaveBeenCalledWith({ path: "avatars/u1/avatar.webp" });
    expect(result).toEqual({ avatar: "https://signed/u1.webp?token=t", phone: "(+65) 9123 4567" });
  });

  test("returns avatar:null without signing when no avatar is stored", async () => {
    getUser.mockResolvedValue({
      error: null,
      data: { user: fakeUser({ id: "u1", mobile: "(+65) 9123 4567" }) },
    });
    maybeSingle.mockResolvedValue({ data: { onboarding_completed_at: null, avatar_url: null } });

    const result = await getOnboardingProfileFn();

    expect(signAvatarUrl).not.toHaveBeenCalled();
    expect(result).toEqual({ avatar: null, phone: "(+65) 9123 4567" });
  });

  test("returns empty phone when the user has no mobile in metadata", async () => {
    getUser.mockResolvedValue({ error: null, data: { user: fakeUser({ id: "u1" }) } });
    maybeSingle.mockResolvedValue({ data: null });

    const result = await getOnboardingProfileFn();

    expect(result).toEqual({ avatar: null, phone: "" });
  });

  test("degrades to avatar:null when signing throws (a broken path must not break load)", async () => {
    getUser.mockResolvedValue({
      error: null,
      data: { user: fakeUser({ id: "u1", mobile: "(+65) 9123 4567" }) },
    });
    maybeSingle.mockResolvedValue({
      data: { onboarding_completed_at: null, avatar_url: "avatars/u1/avatar.webp" },
    });
    signAvatarUrl.mockRejectedValue(new Error("object not found"));

    const result = await getOnboardingProfileFn();

    expect(result).toEqual({ avatar: null, phone: "(+65) 9123 4567" });
  });
});
