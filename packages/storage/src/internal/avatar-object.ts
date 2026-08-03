// Shared avatar-object internals: bucket name, accepted MIME types, the
// deterministic object-key convention, and the small guards. Both the
// service-role server surface (src/upload-avatar.ts, src/sign-avatar-url.ts)
// and the RLS-scoped browser surface (src/browser/*) build on these so the
// path convention and validation have exactly one source of truth.

/** The private bucket avatars live in. Provisioned against staging (infra). */
export const BUCKET = "avatars";

/** MIME types the bucket accepts — mirrors the bucket's `allowed_mime_types`. */
export const ALLOWED_CONTENT_TYPES = new Set(["image/webp", "image/jpeg", "image/png"]);

/**
 * Default validity window for a signed avatar URL, in seconds (1 hour). Long
 * enough to render an onboarding / profile view, short enough that a leaked URL
 * expires on its own.
 */
export const DEFAULT_EXPIRES_IN = 3600;

export type AvatarScope = "account" | "family";

/** The (uid, scope, clientKey) tuple the object key is derived from. */
export interface AvatarObjectKeyInput {
  /** The owning user id — owns the object's path prefix. */
  uid: string;
  scope: AvatarScope;
  /** Required when `scope === "family"`; a stable client-generated key. */
  clientKey?: string;
}

/**
 * The bucket-relative object key. Deterministic per (uid, scope, clientKey) so
 * an upsert retry overwrites the same object instead of creating a new one. The
 * `.webp` extension is fixed (the real encoding travels in `contentType`).
 *
 * The `uid` is always the FIRST path segment — the owner-isolation storage RLS
 * policies key on exactly that (see the avatars-storage-rls migration).
 */
export function objectKey(input: AvatarObjectKeyInput): string {
  if (input.scope === "family") {
    if (!input.clientKey) {
      throw new Error("uploadAvatar: clientKey is required for the 'family' scope");
    }
    return `${input.uid}/family/${input.clientKey}.webp`;
  }
  return `${input.uid}/avatar.webp`;
}

/** Throws when `contentType` is not one the bucket accepts. */
export function assertContentType(contentType: string): void {
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new Error(`uploadAvatar: unsupported contentType '${contentType}'`);
  }
}

/**
 * Strips the stored path's leading `avatars/` bucket segment to the
 * bucket-relative key the Storage API expects. Throws on a path outside the
 * `avatars` bucket.
 */
export function toBucketRelativeKey(path: string): string {
  const prefix = `${BUCKET}/`;
  if (!path.startsWith(prefix)) {
    throw new Error(`signAvatarUrl: path must start with '${prefix}' (got '${path}')`);
  }
  return path.slice(prefix.length);
}
