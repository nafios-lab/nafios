import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { signAvatarUrl } from "../../src/sign-avatar-url";

// Capture the calls the helper makes into the service-role storage client.
let signCalls: Array<{ key: string; expiresIn: number }> = [];
let signError: { message: string } | null = null;
let signedUrl: string | null = "https://signed.example/avatar.webp?token=abc";
let lastBucket = "";

const storageClient = {
  storage: {
    from(bucket: string) {
      lastBucket = bucket;
      return {
        createSignedUrl(key: string, expiresIn: number) {
          signCalls.push({ key, expiresIn });
          return Promise.resolve({
            data: signError ? null : { signedUrl },
            error: signError,
          });
        },
      };
    },
  },
};

mock.module("@nafios/supabase-core", () => ({
  createServiceRoleClient: () => storageClient,
}));

describe("signAvatarUrl", () => {
  beforeEach(() => {
    signCalls = [];
    signError = null;
    signedUrl = "https://signed.example/avatar.webp?token=abc";
    lastBucket = "";
  });
  afterEach(() => {
    mock.restore();
  });

  test("strips the bucket prefix and returns a signed URL with the default TTL", async () => {
    const result = await signAvatarUrl({ path: "avatars/user-1/avatar.webp" });

    expect(lastBucket).toBe("avatars");
    expect(signCalls).toHaveLength(1);
    expect(signCalls[0]?.key).toBe("user-1/avatar.webp");
    expect(signCalls[0]?.expiresIn).toBe(3600);
    expect(result.url).toBe("https://signed.example/avatar.webp?token=abc");
  });

  test("honors a custom expiresIn", async () => {
    await signAvatarUrl({ path: "avatars/user-1/family/m-1.webp", expiresIn: 60 });

    expect(signCalls[0]?.key).toBe("user-1/family/m-1.webp");
    expect(signCalls[0]?.expiresIn).toBe(60);
  });

  test("rejects a path outside the avatars bucket", async () => {
    await expect(signAvatarUrl({ path: "user-1/avatar.webp" })).rejects.toThrow(
      "path must start with 'avatars/'",
    );
  });

  test("surfaces a Storage error", async () => {
    signError = { message: "object not found" };
    await expect(signAvatarUrl({ path: "avatars/user-1/avatar.webp" })).rejects.toThrow(
      "signAvatarUrl: object not found",
    );
  });

  test("throws when no signed URL is returned", async () => {
    signedUrl = null;
    await expect(signAvatarUrl({ path: "avatars/user-1/avatar.webp" })).rejects.toThrow(
      "no signed URL returned",
    );
  });
});
