import { beforeEach, describe, expect, mock, test } from "bun:test";
// The client-side onboarding data layer. It reads/writes through the (mocked)
// browser data client (`db`), the browser auth client (`authClient`), and the
// browser storage helpers — all shared spies from tests/setup.ts. `setProfileRow`
// seeds the single `profiles` read the layer performs.
import {
  completeOnboarding,
  getOnboardingProfile,
  getOnboardingStatus,
  onboardingStatusQueryOptions,
  resetOnboardingStatus,
  saveProfile,
} from "../../src/features/onboarding/lib/onboarding-data.ts";
import {
  authClient,
  db,
  getUser,
  insertUserProfile,
  resetOnboardingMocks,
  saveOnboardingProfile,
  setProfileRow,
  signAvatarUrlFromBrowser,
  updateUserMetadata,
  uploadAvatarFromBrowser,
} from "../setup.ts";

const DATA_URL = "data:image/webp;base64,AAAA";

/** Steer the auth reads to succeed with a verified user. */
function withUser(mobile?: string): void {
  getUser.mockResolvedValue({
    error: null,
    data: { user: { id: "u1", mobile } },
  });
}

beforeEach(resetOnboardingMocks);

describe("saveProfile", () => {
  test("avatar-only: uploads the bytes and writes the returned object path", async () => {
    withUser();

    await saveProfile({ avatar: DATA_URL });

    expect(uploadAvatarFromBrowser).toHaveBeenCalledTimes(1);
    const [client, opts] = uploadAvatarFromBrowser.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(client).toBe(db);
    expect(opts.uid).toBe("u1");
    expect(opts.scope).toBe("account");
    expect(opts.contentType).toBe("image/webp");
    expect(opts.bytes).toBeInstanceOf(Blob);
    expect(saveOnboardingProfile).toHaveBeenCalledWith(db, {
      avatarUrl: "avatars/u1/avatar.webp",
    });
    expect(updateUserMetadata).not.toHaveBeenCalled();
  });

  test("mobile-only: writes user_metadata and skips the avatar path", async () => {
    await saveProfile({ mobile: "(+65) 9123 4567" });

    expect(updateUserMetadata).toHaveBeenCalledWith(authClient, { mobile: "(+65) 9123 4567" });
    expect(uploadAvatarFromBrowser).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  test("empty input is a no-op success", async () => {
    await saveProfile({});

    expect(uploadAvatarFromBrowser).not.toHaveBeenCalled();
    expect(updateUserMetadata).not.toHaveBeenCalled();
    expect(saveOnboardingProfile).not.toHaveBeenCalled();
  });

  test("an already-stored avatar path is left as-is (not re-uploaded)", async () => {
    await saveProfile({ avatar: "avatars/u1/avatar.webp" });

    expect(uploadAvatarFromBrowser).not.toHaveBeenCalled();
    expect(saveOnboardingProfile).not.toHaveBeenCalled();
  });

  test("throws no_session when the avatar path has no verified user", async () => {
    // getUser default = signed out.
    await expect(saveProfile({ avatar: DATA_URL })).rejects.toThrow("no_session");
    expect(uploadAvatarFromBrowser).not.toHaveBeenCalled();
  });

  test("throws the auth error message when the mobile write fails", async () => {
    updateUserMetadata.mockResolvedValue({ error: { message: "boom" } });

    await expect(saveProfile({ mobile: "(+65) 9123 4567" })).rejects.toThrow("boom");
  });
});

describe("completeOnboarding", () => {
  test("zero members: writes an empty family list without touching auth", async () => {
    await completeOnboarding({ familyMembers: [] });

    expect(insertUserProfile).toHaveBeenCalledWith(db, { familyMembers: [] });
    expect(getUser).not.toHaveBeenCalled();
    expect(uploadAvatarFromBrowser).not.toHaveBeenCalled();
  });

  test("member with a data: avatar → uploads under scope 'family' and maps to avatarUrl", async () => {
    withUser();

    await completeOnboarding({
      familyMembers: [{ name: "Aisha", relationship: "spouse", avatar: DATA_URL }],
    });

    expect(uploadAvatarFromBrowser).toHaveBeenCalledTimes(1);
    const [client, opts] = uploadAvatarFromBrowser.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(client).toBe(db);
    expect(opts.uid).toBe("u1");
    expect(opts.scope).toBe("family");
    expect(typeof opts.clientKey).toBe("string");
    expect(insertUserProfile).toHaveBeenCalledWith(db, {
      familyMembers: [
        {
          name: "Aisha",
          relationship: "spouse",
          avatarUrl: "avatars/u1/avatar.webp",
          nric: undefined,
          mobileNo: undefined,
          dateOfBirth: undefined,
        },
      ],
    });
  });

  test("member with a non-data avatar string is passed through (no upload)", async () => {
    await completeOnboarding({
      familyMembers: [{ name: "Bo", relationship: "child", avatar: "avatars/u1/family/x.webp" }],
    });

    expect(uploadAvatarFromBrowser).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
    expect(insertUserProfile).toHaveBeenCalledWith(db, {
      familyMembers: [
        {
          name: "Bo",
          relationship: "child",
          avatarUrl: "avatars/u1/family/x.webp",
          nric: undefined,
          mobileNo: undefined,
          dateOfBirth: undefined,
        },
      ],
    });
  });

  test("member with no avatar → avatarUrl undefined", async () => {
    await completeOnboarding({
      familyMembers: [
        {
          name: "Cara",
          relationship: "parent",
          nric: "S1234567A",
          mobileNo: "(+65) 9123 4567",
          dateOfBirth: "1990-12-25",
        },
      ],
    });

    expect(uploadAvatarFromBrowser).not.toHaveBeenCalled();
    expect(insertUserProfile).toHaveBeenCalledWith(db, {
      familyMembers: [
        {
          name: "Cara",
          relationship: "parent",
          avatarUrl: undefined,
          nric: "S1234567A",
          mobileNo: "(+65) 9123 4567",
          dateOfBirth: "1990-12-25",
        },
      ],
    });
  });

  test("throws no_session when a data: avatar has no verified user", async () => {
    await expect(
      completeOnboarding({
        familyMembers: [{ name: "Aisha", relationship: "spouse", avatar: DATA_URL }],
      }),
    ).rejects.toThrow("no_session");
    expect(insertUserProfile).not.toHaveBeenCalled();
  });
});

describe("getOnboardingProfile", () => {
  test("returns empty values when signed out", async () => {
    // getUser default = signed out.
    const result = await getOnboardingProfile();

    expect(result).toEqual({ avatar: null, phone: "" });
    expect(signAvatarUrlFromBrowser).not.toHaveBeenCalled();
  });

  test("signs the stored avatar and returns the phone from user metadata", async () => {
    withUser("(+65) 9123 4567");
    setProfileRow({ avatar_url: "avatars/u1/avatar.webp" });

    const result = await getOnboardingProfile();

    expect(signAvatarUrlFromBrowser).toHaveBeenCalledWith(db, {
      path: "avatars/u1/avatar.webp",
    });
    expect(result.avatar).toBe("https://signed.example/avatar.webp?token=abc");
    expect(result.phone).toBe("(+65) 9123 4567");
  });

  test("falls back to null avatar when signing throws", async () => {
    withUser();
    setProfileRow({ avatar_url: "avatars/u1/avatar.webp" });
    signAvatarUrlFromBrowser.mockRejectedValue(new Error("expired"));

    const result = await getOnboardingProfile();

    expect(result.avatar).toBeNull();
    expect(result.phone).toBe("");
  });

  test("returns null avatar when there is no profile row", async () => {
    withUser();
    setProfileRow(null);

    const result = await getOnboardingProfile();

    expect(result.avatar).toBeNull();
    expect(signAvatarUrlFromBrowser).not.toHaveBeenCalled();
  });
});

describe("getOnboardingStatus", () => {
  test("returns true when onboarding_completed_at is set", async () => {
    setProfileRow({ onboarding_completed_at: "2026-01-01" });
    expect(await getOnboardingStatus("u1")).toBe(true);
  });

  test("returns false when there is no completion stamp", async () => {
    setProfileRow(null);
    expect(await getOnboardingStatus("u1")).toBe(false);
  });
});

describe("onboardingStatusQueryOptions", () => {
  test("keys the query per user and its queryFn resolves the status", async () => {
    const options = onboardingStatusQueryOptions("u1");

    expect([...options.queryKey]).toEqual(["onboarding-status", "u1"]);

    setProfileRow({ onboarding_completed_at: "2026-01-01" });
    expect(await options.queryFn?.({} as never)).toBe(true);
  });
});

describe("resetOnboardingStatus", () => {
  test("removes the onboarding-status queries", () => {
    const removeQueries = mock((_arg?: unknown) => {});
    resetOnboardingStatus({ removeQueries } as never);

    expect(removeQueries).toHaveBeenCalledWith({ queryKey: ["onboarding-status"] });
  });
});
