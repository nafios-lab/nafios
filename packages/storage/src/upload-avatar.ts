import { createServiceRoleClient } from "@nafios/supabase-core";

/** The private bucket avatars live in. Provisioned against staging (infra). */
const BUCKET = "avatars";

/** MIME types the bucket accepts — mirrors the bucket's `allowed_mime_types`. */
const ALLOWED_CONTENT_TYPES = new Set(["image/webp", "image/jpeg", "image/png"]);

export type AvatarScope = "account" | "family";

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
 * The bucket-relative object key. Deterministic per (uid, scope, clientKey) so
 * an upsert retry overwrites the same object instead of creating a new one. The
 * `.webp` extension is fixed (the real encoding travels in `contentType`).
 */
function objectKey(input: UploadAvatarInput): string {
  if (input.scope === "family") {
    if (!input.clientKey) {
      throw new Error("uploadAvatar: clientKey is required for the 'family' scope");
    }
    return `${input.uid}/family/${input.clientKey}.webp`;
  }
  return `${input.uid}/avatar.webp`;
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
 */
export async function uploadAvatar(input: UploadAvatarInput): Promise<UploadAvatarResult> {
  if (!input.uid) throw new Error("uploadAvatar: uid is required");
  if (!ALLOWED_CONTENT_TYPES.has(input.contentType)) {
    throw new Error(`uploadAvatar: unsupported contentType '${input.contentType}'`);
  }

  const key = objectKey(input);
  const client = createServiceRoleClient();

  const { error } = await client.storage.from(BUCKET).upload(key, input.bytes, {
    contentType: input.contentType,
    upsert: true,
  });

  if (error) throw new Error(`uploadAvatar: ${error.message}`);

  return { path: `${BUCKET}/${key}` };
}
