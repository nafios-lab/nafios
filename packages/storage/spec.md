---
title: "@nafios/storage"
status: active
version: 0.3.0
updated: 2026-08-03
owner: Hanafi
related_adrs: [0006, 0019, 0021, 0024, 0026, 0027]
---

# @nafios/storage — Specification

## Purpose

Sanctioned access to Supabase Storage for NafiOS. Owns the avatar upload path
(account holder + family members) so no app imports `@supabase/*` directly. Two
surfaces on one path convention:

- **`.` (default barrel) — SERVER-ONLY.** Service-role client (bypasses RLS).
  Used by the SSR app (`apps/web`) from a server function that derives `uid`
  from a verified session.
- **`./browser` — RLS-scoped.** Takes the caller's own session client. Used by
  the SPA shell (`apps/nafios-web`), which has no server runtime and writes
  avatars directly from the browser, authorized by the `avatars` owner-isolation
  storage RLS policies (ADR-0026, ADR-0027).

Both build on `@nafios/supabase-core`.

## Scope

**In:** uploading avatar objects to the private `avatars` bucket at a
deterministic, per-user path (returning the stored object path); minting a
short-lived signed read URL for a stored avatar so a browser can display it —
each via **both** a service-role (server) and an RLS-scoped (browser) surface.

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

### Browser surface — `@nafios/storage/browser` (RLS-scoped)

Same path convention and validation, but each helper takes the caller's own
Supabase session client (`AvatarStorageClient` = any client with `.storage`,
e.g. `@nafios/database`'s `createBrowserDb()`) instead of constructing a
service-role client. Authorization is the `avatars` owner-isolation storage RLS
policies — a user reaches only objects under their own `auth.uid()` prefix.
`uid` in the input forms the path only; it is **not** a trust boundary (RLS
rejects a mismatched prefix).

```ts
type AvatarStorageClient = Pick<SupabaseClient, "storage">;

interface UploadAvatarFromBrowserInput {
  uid: string;                    // forms the path; RLS enforces ownership
  scope: AvatarScope;
  clientKey?: string;             // required when scope === "family"
  bytes: Blob | ArrayBuffer | Uint8Array;
  contentType: string;
}

/** RLS-scoped counterpart to uploadAvatar. Upserts via the caller's session client. */
function uploadAvatarFromBrowser(
  client: AvatarStorageClient,
  input: UploadAvatarFromBrowserInput,
): Promise<UploadAvatarResult>;

/** RLS-scoped counterpart to signAvatarUrl. Signs via the caller's session client. */
function signAvatarUrlFromBrowser(
  client: AvatarStorageClient,
  input: SignAvatarUrlInput,
): Promise<SignAvatarUrlResult>;
```

Storage upsert needs INSERT + SELECT + UPDATE policies (INSERT alone makes a
replacement silently fail); the avatars-storage-rls migration grants all of
INSERT/SELECT/UPDATE/DELETE to owners.

### Paths

| scope | object path |
|---|---|
| `account` | `avatars/{uid}/avatar.webp` |
| `family`  | `avatars/{uid}/family/{clientKey}.webp` |

The `.webp` extension is fixed so the path stays deterministic (idempotent
upsert); the true encoding travels in the object's `contentType` metadata.

## Invariants

1. **The `.` barrel is SERVER-ONLY** — `createServiceRoleClient()` (service-role
   key, bypasses RLS); never import it into browser-reachable code. **`./browser`
   is the browser surface** — it constructs no client, takes the caller's
   session client, and is authorized by storage RLS. The two surfaces never mix
   in one import.
2. The object path is owned by the caller — for the server surface, `uid` comes
   from a verified session; for the browser surface, `uid` forms the path but
   the `avatars` owner-isolation RLS policies are the trust boundary (ADR-0026,
   ADR-0027). The client never picks a path outside its own prefix.
3. Uploads use `{ upsert: true }` to a deterministic path → idempotent retries.
   The browser upsert relies on INSERT + SELECT + UPDATE owner policies.
4. `uploadAvatar*` returns the **object path**, not a URL — the column stores the
   path. Displaying it is a separate, explicit read: `signAvatarUrl*` mints a
   short-lived signed URL on demand (no URLs are persisted).
5. `@supabase/*` is reached only via `@nafios/supabase-core`; this package never
   imports the SDK directly. The path convention and validation live in
   `src/internal/avatar-object.ts`, shared by both surfaces.
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
