import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { uploadAvatar } from "../../src/upload-avatar";

// Capture the calls the helper makes into the service-role storage client.
let uploadCalls: Array<{ key: string; body: unknown; opts: unknown }> = [];
let uploadError: { message: string } | null = null;
let lastBucket = "";

const storageClient = {
  storage: {
    from(bucket: string) {
      lastBucket = bucket;
      return {
        upload(key: string, body: unknown, opts: unknown) {
          uploadCalls.push({ key, body, opts });
          return Promise.resolve({ data: uploadError ? null : { path: key }, error: uploadError });
        },
      };
    },
  },
};

mock.module("@nafios/supabase-core", () => ({
  createServiceRoleClient: () => storageClient,
}));

const bytes = new Uint8Array([1, 2, 3]);

describe("uploadAvatar", () => {
  beforeEach(() => {
    uploadCalls = [];
    uploadError = null;
    lastBucket = "";
  });
  afterEach(() => {
    mock.restore();
  });

  test("uploads an account avatar to the deterministic path and returns it", async () => {
    const result = await uploadAvatar({
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
    const result = await uploadAvatar({
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
      uploadAvatar({ uid: "user-1", scope: "family", bytes, contentType: "image/webp" }),
    ).rejects.toThrow("clientKey is required");
  });

  test("requires a uid", async () => {
    await expect(
      uploadAvatar({ uid: "", scope: "account", bytes, contentType: "image/webp" }),
    ).rejects.toThrow("uid is required");
  });

  test("rejects an unsupported contentType", async () => {
    await expect(
      uploadAvatar({ uid: "user-1", scope: "account", bytes, contentType: "application/pdf" }),
    ).rejects.toThrow("unsupported contentType");
  });

  test("surfaces a Storage error", async () => {
    uploadError = { message: "bucket not found" };
    await expect(
      uploadAvatar({ uid: "user-1", scope: "account", bytes, contentType: "image/webp" }),
    ).rejects.toThrow("uploadAvatar: bucket not found");
  });
});
