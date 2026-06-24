---
title: "@nafios/storage"
status: active
version: 0.2.0
updated: 2026-06-23
owner: Hanafi
related_adrs: [0006, 0019, 0021]
---

# @nafios/storage — Specification

## Purpose

Sanctioned, server-side access to Supabase Storage for NafiOS. Owns the avatar
upload path (account holder + family members) so that `apps/web` never imports
`@supabase/*` directly. Builds on `@nafios/supabase-core`'s service-role client.

## Scope

**In:** uploading avatar objects to the private `avatars` bucket at a
deterministic, per-user path (returning the stored object path); minting a
short-lived signed read URL for a stored avatar so a browser can display it.

**Out:** image processing (`fitAvatar` lives in `@nafios/ui`, runs in the
browser), bucket provisioning (infra — done against staging), object deletion,
and any non-avatar storage.

## Entities

```ts
type AvatarScope = "account" | "family";

interface UploadAvatarInput {
  /** The owning user id — from the VERIFIED server session, never the client. */
  uid: string;
  scope: AvatarScope;
  /** Required when scope === "family"; a stable client-generated key. */
  clientKey?: string;
  /** The fitted image bytes (webp, or jpeg/png fallback) from the browser. */
  bytes: ArrayBuffer | Uint8Array | Blob;
  /** "image/webp" | "image/jpeg" | "image/png". */
  contentType: string;
}

interface UploadAvatarResult {
  /** Stored object path, e.g. "avatars/{uid}/avatar.webp". Written into *.avatar_url. */
  path: string;
}

interface SignAvatarUrlInput {
  /** Stored object path exactly as uploadAvatar returns it, e.g. "avatars/{uid}/avatar.webp". */
  path: string;
  /** Validity window in seconds. @default 3600 */
  expiresIn?: number;
}

interface SignAvatarUrlResult {
  /** Time-limited signed HTTPS URL a browser can render in an <img>. */
  url: string;
}
```

## Public API

```ts
/**
 * Upserts an avatar image to the private `avatars` bucket at a deterministic
 * path and returns the stored object path. SERVER-ONLY (uses the service-role
 * client). Idempotent: the same (uid, scope, clientKey) always targets the same
 * path, so retries overwrite rather than duplicate.
 */
function uploadAvatar(input: UploadAvatarInput): Promise<UploadAvatarResult>;

/**
 * Mints a short-lived signed URL for a stored avatar so a browser can display
 * it. SERVER-ONLY (service-role client). The read counterpart to uploadAvatar —
 * the bucket is private, so a bare path is not directly fetchable. Accepts the
 * path with its leading `avatars/` segment (as stored) and strips it to the
 * bucket-relative key Storage expects.
 */
function signAvatarUrl(input: SignAvatarUrlInput): Promise<SignAvatarUrlResult>;
```

### Paths

| scope | object path |
|---|---|
| `account` | `avatars/{uid}/avatar.webp` |
| `family`  | `avatars/{uid}/family/{clientKey}.webp` |

The `.webp` extension is fixed so the path stays deterministic (idempotent
upsert); the true encoding travels in the object's `contentType` metadata.

## Invariants

1. **SERVER-ONLY.** Uses `createServiceRoleClient()` (service-role key, bypasses
   RLS). Never import into browser-reachable code.
2. The `uid` and object path are owned by the caller's verified session — the
   client never picks the path (ADR-0019, app-layer authz).
3. Uploads use `{ upsert: true }` to a deterministic path → idempotent retries.
4. `uploadAvatar` returns the **object path**, not a URL — the column stores the
   path. Displaying it is a separate, explicit read: `signAvatarUrl` mints a
   short-lived signed URL on demand (no URLs are persisted).
5. `@supabase/*` is reached only via `@nafios/supabase-core`; this package never
   imports the SDK directly.
6. No build step — consumed as TypeScript source (ADR-0006).

## Error modes

`uploadAvatar` throws (rejects) on: missing `uid`; `scope === "family"` without
`clientKey`; unsupported `contentType`; or any Storage API error (message
prefixed `uploadAvatar:`). `signAvatarUrl` throws on: a `path` outside the
`avatars/` bucket; or any Storage API error / empty result (message prefixed
`signAvatarUrl:`). Callers (server functions) classify these as `system` faults.

## Examples

```ts
const { path } = await uploadAvatar({
  uid: session.user.id,
  scope: "account",
  bytes: webpBytes,
  contentType: "image/webp",
});
// path === "avatars/<uid>/avatar.webp" → write into profiles.avatar_url

// Later — read it back for display (e.g. onboarding resume / profile view):
const { url } = await signAvatarUrl({ path: profile.avatar_url });
// url === "https://…/storage/v1/object/sign/avatars/<uid>/avatar.webp?token=…"
```

## Open questions

- **Remove on avatar clear** — onboarding only writes; a delete helper can land
  when Settings supports removing an avatar.
- **Configurable TTL per surface** — 1h default suits onboarding/profile views;
  revisit if a longer-lived or cache-friendly URL is needed.
