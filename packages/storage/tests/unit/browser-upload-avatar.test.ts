import { beforeEach, describe, expect, test } from "bun:test";
import { type AvatarStorageClient, uploadAvatarFromBrowser } from "../../src/browser/upload-avatar";

// The browser helper takes the caller's session client, so — unlike the
// service-role server helper — there is no module to mock: we hand it a fake
// client and assert the calls it makes.
let uploadCalls: Array<{ key: string; body: unknown; opts: unknown }> = [];
let uploadError: { message: string } | null = null;
let lastBucket = "";

const client: AvatarStorageClient = {
  storage: {
    // biome-ignore lint/suspicious/noExplicitAny: minimal structural stub for the storage handle.
    from(bucket: string): any {
      lastBucket = bucket;
      return {
        upload(key: string, body: unknown, opts: unknown) {
          uploadCalls.push({ key, body, opts });
          return Promise.resolve({ data: uploadError ? null : { path: key }, error: uploadError });
        },
      };
    },
    // biome-ignore lint/suspicious/noExplicitAny: only `.from` is exercised.
  } as any,
};

const bytes = new Uint8Array([1, 2, 3]);

describe("uploadAvatarFromBrowser", () => {
  beforeEach(() => {
    uploadCalls = [];
    uploadError = null;
    lastBucket = "";
  });

  test("uploads an account avatar to the deterministic path and returns it", async () => {
    const result = await uploadAvatarFromBrowser(client, {
      uid: "user-1",
      scope: "account",
      bytes,
      contentType: "image/webp",
    });

    expect(lastBucket).toBe("avatars");
    expect(uploadCalls).toHaveLength(1);
    expect(uploadCalls[0]?.key).toBe("user-1/avatar.webp");
    expect(uploadCalls[0]?.opts).toEqual({ contentType: "image/webp", upsert: true });
    expect(result.path).toBe("avatars/user-1/avatar.webp");
  });

  test("uploads a family avatar under the family/ prefix using clientKey", async () => {
    const result = await uploadAvatarFromBrowser(client, {
      uid: "user-1",
      scope: "family",
      clientKey: "member-abc",
      bytes,
      contentType: "image/jpeg",
    });

    expect(uploadCalls[0]?.key).toBe("user-1/family/member-abc.webp");
    expect(result.path).toBe("avatars/user-1/family/member-abc.webp");
  });

  test("requires a clientKey for the family scope", async () => {
    await expect(
      uploadAvatarFromBrowser(client, {
        uid: "user-1",
        scope: "family",
        bytes,
        contentType: "image/webp",
      }),
    ).rejects.toThrow("clientKey is required");
  });

  test("requires a uid", async () => {
    await expect(
      uploadAvatarFromBrowser(client, {
        uid: "",
        scope: "account",
        bytes,
        contentType: "image/webp",
      }),
    ).rejects.toThrow("uid is required");
  });

  test("rejects an unsupported contentType", async () => {
    await expect(
      uploadAvatarFromBrowser(client, {
        uid: "user-1",
        scope: "account",
        bytes,
        contentType: "application/pdf",
      }),
    ).rejects.toThrow("unsupported contentType");
  });

  test("surfaces a Storage error", async () => {
    uploadError = { message: "row-level security" };
    await expect(
      uploadAvatarFromBrowser(client, {
        uid: "user-1",
        scope: "account",
        bytes,
        contentType: "image/webp",
      }),
    ).rejects.toThrow("uploadAvatar: row-level security");
  });
});
