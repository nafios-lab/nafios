import { beforeEach, describe, expect, test } from "bun:test";
import { signAvatarUrlFromBrowser } from "../../src/browser/sign-avatar-url";
import type { AvatarStorageClient } from "../../src/browser/upload-avatar";

// The browser helper takes the caller's session client — hand it a fake client
// and assert the calls it makes (no module mock needed).
let signCalls: Array<{ key: string; expiresIn: number }> = [];
let signError: { message: string } | null = null;
let signedUrl: string | null = "https://signed.example/avatar.webp?token=abc";
let lastBucket = "";

const client: AvatarStorageClient = {
  storage: {
    // biome-ignore lint/suspicious/noExplicitAny: minimal structural stub for the storage handle.
    from(bucket: string): any {
      lastBucket = bucket;
      return {
        createSignedUrl(key: string, expiresIn: number) {
          signCalls.push({ key, expiresIn });
          return Promise.resolve({ data: signError ? null : { signedUrl }, error: signError });
        },
      };
    },
    // biome-ignore lint/suspicious/noExplicitAny: only `.from` is exercised.
  } as any,
};

describe("signAvatarUrlFromBrowser", () => {
  beforeEach(() => {
    signCalls = [];
    signError = null;
    signedUrl = "https://signed.example/avatar.webp?token=abc";
    lastBucket = "";
  });

  test("strips the bucket prefix and returns a signed URL with the default TTL", async () => {
    const result = await signAvatarUrlFromBrowser(client, { path: "avatars/user-1/avatar.webp" });

    expect(lastBucket).toBe("avatars");
    expect(signCalls).toHaveLength(1);
    expect(signCalls[0]?.key).toBe("user-1/avatar.webp");
    expect(signCalls[0]?.expiresIn).toBe(3600);
    expect(result.url).toBe("https://signed.example/avatar.webp?token=abc");
  });

  test("honors a custom expiresIn", async () => {
    await signAvatarUrlFromBrowser(client, {
      path: "avatars/user-1/family/m-1.webp",
      expiresIn: 60,
    });

    expect(signCalls[0]?.key).toBe("user-1/family/m-1.webp");
    expect(signCalls[0]?.expiresIn).toBe(60);
  });

  test("rejects a path outside the avatars bucket", async () => {
    await expect(signAvatarUrlFromBrowser(client, { path: "user-1/avatar.webp" })).rejects.toThrow(
      "path must start with 'avatars/'",
    );
  });

  test("surfaces a Storage error", async () => {
    signError = { message: "object not found" };
    await expect(
      signAvatarUrlFromBrowser(client, { path: "avatars/user-1/avatar.webp" }),
    ).rejects.toThrow("signAvatarUrl: object not found");
  });

  test("throws when no signed URL is returned", async () => {
    signedUrl = null;
    await expect(
      signAvatarUrlFromBrowser(client, { path: "avatars/user-1/avatar.webp" }),
    ).rejects.toThrow("no signed URL returned");
  });
});
