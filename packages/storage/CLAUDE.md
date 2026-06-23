# @nafios/storage

Server-side Supabase Storage access for NafiOS. Owns the **avatar upload** path
(account holder + family members) so `apps/web` never imports `@supabase/*`
directly. Builds on `@nafios/supabase-core`'s service-role client.

## What this package does

- **`uploadAvatar(input)`** — upserts a fitted image to the private `avatars`
  bucket at a deterministic per-user path and returns the stored object path
  (for writing into a `*.avatar_url` column).
- **`signAvatarUrl(input)`** — the read counterpart: mints a short-lived signed
  URL for a stored object path so a browser can display it (the bucket is
  private, so the bare path is not directly fetchable).

## Public API surface

All public exports live in `src/index.ts` (the barrel):

- `uploadAvatar(input): Promise<{ path }>` — server-side avatar upsert
- `signAvatarUrl(input): Promise<{ url }>` — server-side signed read URL
- Types: `AvatarScope`, `UploadAvatarInput`, `UploadAvatarResult`,
  `SignAvatarUrlInput`, `SignAvatarUrlResult`

## Invariants

1. **SERVER-ONLY.** Uses `createServiceRoleClient()` (service-role key, bypasses
   RLS). Never import into browser-reachable code.
2. `uid` and the object path are owned by the caller's verified session — the
   client never picks the path (ADR-0019).
3. Uploads are `{ upsert: true }` to a deterministic path → idempotent retries.
4. `uploadAvatar` returns the object **path**, not a URL; reads are an explicit,
   separate step (`signAvatarUrl` mints a short-lived signed URL — nothing is
   persisted as a URL).
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
  hosted staging. See `issues/nafios-storage-avatars-bucket-setup.md`.
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
  index.ts           # barrel — public exports only
  upload-avatar.ts   # uploadAvatar + input/result types
  sign-avatar-url.ts # signAvatarUrl + input/result types
tests/unit/          # bun:test unit tests
spec.md              # package specification
```

## Root context

See [root CLAUDE.md](../../CLAUDE.md) for monorepo-wide conventions.
