import { beforeEach, describe, expect, test } from "bun:test";
// The shell profile read: `profiles.avatar_url` → a signed, displayable URL. It
// reads through the (mocked) browser data client (`db`) and signs through the
// browser storage helper — both shared spies from tests/setup.ts. `setProfileRow`
// seeds the single `profiles` read the layer performs.
import { profileQueryKey, profileQueryOptions } from "../../src/lib/profile.ts";
import { db, resetOnboardingMocks, setProfileRow, signAvatarUrlFromBrowser } from "../setup.ts";

beforeEach(resetOnboardingMocks);

describe("profileQueryKey", () => {
  test("scopes the key per user", () => {
    expect([...profileQueryKey("u1")]).toEqual(["profile", "u1"]);
  });
});

describe("profileQueryOptions", () => {
  test("keys the query per user and stays fresh under the signed-URL lifetime", () => {
    const options = profileQueryOptions("u1");

    expect([...options.queryKey]).toEqual(["profile", "u1"]);
    // Just under the 1h (3600s) signed-URL expiry, so a refetch re-signs in time.
    expect(options.staleTime).toBeLessThan(3600 * 1000);
  });

  test("signs the stored avatar path and returns a displayable URL", async () => {
    setProfileRow({ avatar_url: "avatars/u1/avatar.webp" });

    const result = await profileQueryOptions("u1").queryFn?.({} as never);

    expect(signAvatarUrlFromBrowser).toHaveBeenCalledWith(db, {
      path: "avatars/u1/avatar.webp",
    });
    expect(result).toEqual({ avatarUrl: "https://signed.example/avatar.webp?token=abc" });
  });

  test("returns an empty profile when there is no row", async () => {
    setProfileRow(null);

    const result = await profileQueryOptions("u1").queryFn?.({} as never);

    expect(result).toEqual({});
    expect(signAvatarUrlFromBrowser).not.toHaveBeenCalled();
  });

  test("returns an empty profile when the row has no avatar path", async () => {
    setProfileRow({ avatar_url: null });

    const result = await profileQueryOptions("u1").queryFn?.({} as never);

    expect(result).toEqual({});
    expect(signAvatarUrlFromBrowser).not.toHaveBeenCalled();
  });

  test("falls back to an empty profile when signing throws (expired/broken object)", async () => {
    setProfileRow({ avatar_url: "avatars/u1/avatar.webp" });
    signAvatarUrlFromBrowser.mockRejectedValue(new Error("expired"));

    const result = await profileQueryOptions("u1").queryFn?.({} as never);

    expect(result).toEqual({});
  });
});
