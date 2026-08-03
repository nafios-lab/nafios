# @nafios/storage

Supabase Storage access for NafiOS. Owns the **avatar upload** path (account
holder + family members) so no app imports `@supabase/*` directly. Two surfaces
on one path convention, both on `@nafios/supabase-core`:

- **`@nafios/storage` (default) — SERVER-ONLY**, service-role client (bypasses
  RLS). Used by the SSR app (`apps/web`) from a server function.
- **`@nafios/storage/browser` — RLS-scoped**, takes the caller's own session
  client. Used by the SPA (`apps/nafios-web`), which writes avatars from the
  browser under the `avatars` owner-isolation storage RLS policies (ADR-0026/0027).

## What this package does

- **`uploadAvatar(input)`** / **`uploadAvatarFromBrowser(client, input)`** —
  upsert a fitted image to the private `avatars` bucket at a deterministic
  per-user path and return the stored object path (for a `*.avatar_url` column).
- **`signAvatarUrl(input)`** / **`signAvatarUrlFromBrowser(client, input)`** —
  the read counterpart: mint a short-lived signed URL for a stored path so a
  browser can display it (the bucket is private).

## Public API surface

- **`src/index.ts`** (server barrel): `uploadAvatar`, `signAvatarUrl`; types
  `AvatarScope`, `UploadAvatarInput/Result`, `SignAvatarUrlInput/Result`.
- **`src/browser.ts`** (browser barrel — `@nafios/storage/browser`):
  `uploadAvatarFromBrowser`, `signAvatarUrlFromBrowser`; types
  `AvatarStorageClient`, `UploadAvatarFromBrowserInput`, and re-exported result
  types.
- **`src/internal/avatar-object.ts`**: the shared bucket name, MIME allow-list,
  and deterministic object-key convention (not public — both surfaces use it).

## Invariants

1. **The default barrel is SERVER-ONLY** (`createServiceRoleClient()`, bypasses
   RLS) — never import it into browser code. **`/browser` is the browser surface**
   — it builds no client, takes the caller's session client, and relies on
   storage RLS. Don't mix the two in one import.
2. The object path is caller-owned: server derives `uid` from a verified session
   (ADR-0019); browser forms the path from `uid` but the `avatars` owner RLS
   policies are the real boundary (ADR-0026/0027).
3. Uploads are `{ upsert: true }` to a deterministic path → idempotent retries.
   The browser upsert needs INSERT + SELECT + UPDATE owner policies (INSERT alone
   makes replacement silently fail).
4. `uploadAvatar*` returns the object **path**, not a URL; reads are an explicit,
   separate step (`signAvatarUrl*`) — nothing is persisted as a URL.
5. Reaches `@supabase/*` only via `@nafios/supabase-core`.
6. No build step — consumed as TypeScript source (ADR-0006).

## Object paths

| scope | path |
|---|---|
| `account` | `avatars/{uid}/avatar.webp` |
| `family`  | `avatars/{uid}/family/{clientKey}.webp` |

## Non-obvious gotchas

- **The `avatars` bucket must exist on staging before this works.** `supabase db
  push` does not create buckets — it is provisioned via SQL/dashboard against
  hosted staging. See [`specs/data/avatars-storage-bucket.md`](../../specs/data/avatars-storage-bucket.md).
- **`SUPABASE_SERVICE_ROLE_KEY` must be set** (server env). The service-role
  client throws synchronously if it is missing.
- **The `.webp` extension is fixed** for a deterministic path; the real encoding
  is carried by the object's `contentType`.

## Scripts

```sh
bun test          # run unit tests
bun run typecheck # tsc --noEmit
```

## Structure

```
src/
  index.ts               # server barrel (SERVER-ONLY, service-role)
  browser.ts             # browser barrel — @nafios/storage/browser (RLS-scoped)
  upload-avatar.ts       # uploadAvatar (service-role) + input/result types
  sign-avatar-url.ts     # signAvatarUrl (service-role) + input/result types
  browser/
    upload-avatar.ts     # uploadAvatarFromBrowser (session client)
    sign-avatar-url.ts   # signAvatarUrlFromBrowser (session client)
  internal/
    avatar-object.ts     # shared bucket / MIME / object-key convention
tests/unit/              # bun:test unit tests
spec.md                  # package specification
```

## Root context

See [root CLAUDE.md](../../CLAUDE.md) for monorepo-wide conventions.
