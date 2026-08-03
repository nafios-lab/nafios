import { createServiceRoleClient } from "@nafios/supabase-core";
import { type AvatarScope, assertContentType, BUCKET, objectKey } from "./internal/avatar-object";

export type { AvatarScope };

export interface UploadAvatarInput {
  /** The owning user id — from the VERIFIED server session, never the client. */
  uid: string;
  scope: AvatarScope;
  /** Required when `scope === "family"`; a stable client-generated key. */
  clientKey?: string;
  /** The fitted image bytes (webp, or jpeg/png fallback) from the browser. */
  bytes: ArrayBuffer | Uint8Array | Blob;
  /** "image/webp" | "image/jpeg" | "image/png". */
  contentType: string;
}

export interface UploadAvatarResult {
  /** Stored object path, e.g. "avatars/{uid}/avatar.webp". Goes into *.avatar_url. */
  path: string;
}

/**
 * Upserts an avatar image to the private `avatars` bucket and returns the stored
 * object path. SERVER-ONLY — uses the service-role client (bypasses RLS); the
 * caller must derive `uid` from a verified session and owns the path. Idempotent:
 * the same input always targets the same path, so retries overwrite cleanly.
 *
 * Returns the object path (not a URL) for the caller to write into the relevant
 * `avatar_url` column. Read-time signing is out of scope (profile-display
 * follow-up). Throws on bad input or any Storage error.
 *
 * The browser (RLS-scoped) counterpart is `uploadAvatarFromBrowser` in
 * `@nafios/storage/browser`.
 */
export async function uploadAvatar(input: UploadAvatarInput): Promise<UploadAvatarResult> {
  if (!input.uid) throw new Error("uploadAvatar: uid is required");
  assertContentType(input.contentType);

  const key = objectKey(input);
  const client = createServiceRoleClient();

  const { error } = await client.storage.from(BUCKET).upload(key, input.bytes, {
    contentType: input.contentType,
    upsert: true,
  });

  if (error) throw new Error(`uploadAvatar: ${error.message}`);

  return { path: `${BUCKET}/${key}` };
}
