/** Image MIME types accepted for avatar upload. */
export const ACCEPTED_AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/** Maximum raw file size accepted before decoding (5 MB). */
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export type AvatarValidationResult = { ok: true } | { ok: false; message: string };

/**
 * Validates a chosen file is an acceptable avatar source by type and size.
 * Runs before any decoding so oversized/wrong-type files are rejected cheaply.
 */
export function validateAvatarFile(file: File): AvatarValidationResult {
  if (!ACCEPTED_AVATAR_TYPES.includes(file.type as (typeof ACCEPTED_AVATAR_TYPES)[number])) {
    return { ok: false, message: "Use a PNG, JPG, or WebP image." };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { ok: false, message: "Image must be 5 MB or smaller." };
  }
  return { ok: true };
}
