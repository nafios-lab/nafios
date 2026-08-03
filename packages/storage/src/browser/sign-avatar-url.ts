import { BUCKET, DEFAULT_EXPIRES_IN, toBucketRelativeKey } from "../internal/avatar-object";
import type { SignAvatarUrlInput, SignAvatarUrlResult } from "../sign-avatar-url";
import type { AvatarStorageClient } from "./upload-avatar";

export type { SignAvatarUrlInput, SignAvatarUrlResult };

/**
 * Browser (RLS-scoped) counterpart to {@link import("../sign-avatar-url").signAvatarUrl}.
 * Mints a short-lived signed URL for a stored avatar object so it can render in
 * an `<img>` — the `avatars` bucket is private, so the bare object path is not
 * directly fetchable.
 *
 * Runs with the user's own session client, so signing is authorized by the
 * `avatars` owner-isolation SELECT policy: a user can only sign objects under
 * their own uid prefix. Accepts the stored path (`"avatars/…"`) and strips it
 * to the bucket-relative key. Throws on a path outside the bucket or any
 * Storage error (message prefixed `signAvatarUrl:`).
 */
export async function signAvatarUrlFromBrowser(
  client: AvatarStorageClient,
  input: SignAvatarUrlInput,
): Promise<SignAvatarUrlResult> {
  const key = toBucketRelativeKey(input.path);
  const expiresIn = input.expiresIn ?? DEFAULT_EXPIRES_IN;

  const { data, error } = await client.storage.from(BUCKET).createSignedUrl(key, expiresIn);

  if (error) throw new Error(`signAvatarUrl: ${error.message}`);
  if (!data?.signedUrl) throw new Error("signAvatarUrl: no signed URL returned");

  return { url: data.signedUrl };
}
