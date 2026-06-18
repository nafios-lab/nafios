import { describe, expect, test } from "bun:test";
import {
  ACCEPTED_AVATAR_TYPES,
  MAX_AVATAR_BYTES,
  validateAvatarFile,
} from "../../src/internal/avatar-validation.ts";

/** Build a File whose reported `size` we control without allocating real bytes. */
function fakeFile(type: string, size: number): File {
  const file = new File(["x"], "avatar", { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("validateAvatarFile", () => {
  for (const type of ACCEPTED_AVATAR_TYPES) {
    test(`accepts ${type} within the size limit`, () => {
      expect(validateAvatarFile(fakeFile(type, 1024))).toEqual({ ok: true });
    });
  }

  test("rejects an unsupported MIME type", () => {
    const result = validateAvatarFile(fakeFile("image/gif", 1024));
    expect(result).toEqual({ ok: false, message: "Use a PNG, JPG, or WebP image." });
  });

  test("rejects a non-image file", () => {
    const result = validateAvatarFile(fakeFile("application/pdf", 1024));
    expect(result.ok).toBe(false);
  });

  test("accepts a file exactly at the size limit", () => {
    expect(validateAvatarFile(fakeFile("image/png", MAX_AVATAR_BYTES))).toEqual({ ok: true });
  });

  test("rejects a file one byte over the size limit", () => {
    const result = validateAvatarFile(fakeFile("image/png", MAX_AVATAR_BYTES + 1));
    expect(result).toEqual({ ok: false, message: "Image must be 5 MB or smaller." });
  });

  test("checks type before size", () => {
    // Wrong type AND oversized → type message wins (cheaper check runs first).
    const result = validateAvatarFile(fakeFile("image/gif", MAX_AVATAR_BYTES + 1));
    expect(result).toEqual({ ok: false, message: "Use a PNG, JPG, or WebP image." });
  });
});
