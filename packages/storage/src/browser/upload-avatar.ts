import type { SupabaseClient } from "@nafios/supabase-core";
import { type AvatarScope, assertContentType, BUCKET, objectKey } from "../internal/avatar-object";
import type { UploadAvatarResult } from "../upload-avatar";

export type { AvatarScope, UploadAvatarResult };

/**
 * Any Supabase client with a `.storage` handle — the app passes its browser
 * data client (`@nafios/database`'s `createBrowserDb()`), which carries the
 * user's session, so `auth.uid()` resolves and the owner-isolation storage RLS
 * policies apply. Typed structurally (just `.storage`) to stay decoupled from
 * the DB schema generic.
 */
export type AvatarStorageClient = Pick<SupabaseClient, "storage">;

export interface UploadAvatarFromBrowserInput {
  /**
   * The owning user id. Unlike the server helper (which derives it from a
   * verified session), here it comes from the browser session — but it is not a
   * trust boundary: it only forms the object path, and the owner-isolation RLS
   * policy rejects any path whose first segment is not the caller's own
   * `auth.uid()`. A spoofed uid fails the upload, it does not cross tenants.
   */
  uid: string;
  scope: AvatarScope;
  /** Required when `scope === "family"`; a stable client-generated key. */
  clientKey?: string;
  /** The fitted image bytes (webp, or jpeg/png fallback) from the browser. */
  bytes: Blob | ArrayBuffer | Uint8Array;
  /** "image/webp" | "image/jpeg" | "image/png". */
  contentType: string;
}

/**
 * Browser (RLS-scoped) counterpart to {@link import("../upload-avatar").uploadAvatar}.
 * Upserts a fitted avatar image to the private `avatars` bucket at the same
 * deterministic per-user path and returns the stored object path (for writing
 * into a `*.avatar_url` column).
 *
 * Runs with the user's own session client — NOT the service role — so it is
 * authorized solely by the `avatars` owner-isolation storage RLS policies
 * (which require INSERT + SELECT + UPDATE for the upsert to replace cleanly).
 * Idempotent: the same input always targets the same path. Throws on bad input
 * or any Storage error.
 */
export async function uploadAvatarFromBrowser(
  client: AvatarStorageClient,
  input: UploadAvatarFromBrowserInput,
): Promise<UploadAvatarResult> {
  if (!input.uid) throw new Error("uploadAvatar: uid is required");
  assertContentType(input.contentType);

  const key = objectKey(input);

  const { error } = await client.storage.from(BUCKET).upload(key, input.bytes, {
    contentType: input.contentType,
    upsert: true,
  });

  if (error) throw new Error(`uploadAvatar: ${error.message}`);

  return { path: `${BUCKET}/${key}` };
}
