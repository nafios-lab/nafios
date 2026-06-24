import { createServiceRoleClient } from "@nafios/supabase-core";

/** The private bucket avatars live in (mirrors `uploadAvatar`). */
const BUCKET = "avatars";

/**
 * Default validity window for a signed avatar URL, in seconds (1 hour). Long
 * enough to render an onboarding / profile view, short enough that a leaked URL
 * expires on its own.
 */
const DEFAULT_EXPIRES_IN = 3600;

export interface SignAvatarUrlInput {
  /**
   * The stored object path exactly as `uploadAvatar` returns it / as written
   * into a `*.avatar_url` column, e.g. `"avatars/{uid}/avatar.webp"`.
   */
  path: string;
  /** Validity window in seconds. @default 3600 */
  expiresIn?: number;
}

export interface SignAvatarUrlResult {
  /** A time-limited, signed HTTPS URL a browser can render in an `<img>`. */
  url: string;
}

/**
 * Mints a short-lived signed URL for a stored avatar object so a browser can
 * display it. SERVER-ONLY — uses the service-role client (bypasses RLS). The
 * `avatars` bucket is private, so a bare object path is not directly fetchable;
 * this is the read counterpart to {@link uploadAvatar}.
 *
 * Accepts the path with its leading bucket segment (`"avatars/…"`, as stored)
 * and strips it to the bucket-relative key the Storage API expects. Throws on a
 * path outside the `avatars` bucket or any Storage error (message prefixed
 * `signAvatarUrl:`).
 */
export async function signAvatarUrl(input: SignAvatarUrlInput): Promise<SignAvatarUrlResult> {
  const prefix = `${BUCKET}/`;
  if (!input.path.startsWith(prefix)) {
    throw new Error(`signAvatarUrl: path must start with '${prefix}' (got '${input.path}')`);
  }

  const key = input.path.slice(prefix.length);
  const expiresIn = input.expiresIn ?? DEFAULT_EXPIRES_IN;

  const client = createServiceRoleClient();
  const { data, error } = await client.storage.from(BUCKET).createSignedUrl(key, expiresIn);

  if (error) throw new Error(`signAvatarUrl: ${error.message}`);
  if (!data?.signedUrl) throw new Error("signAvatarUrl: no signed URL returned");

  return { url: data.signedUrl };
}
