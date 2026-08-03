# 0027. Browser avatar uploads via Supabase Storage RLS

- **Status:** Accepted
- **Date:** 2026-08-03
- **Source:** Porting the onboarding flow into the `apps/nafios-web` SPA. The old
  flow uploaded avatars through a server function calling `@nafios/storage`'s
  service-role helpers; the SPA has no server runtime (ADR-0026), so avatar
  storage needed a browser path. Extends [ADR-0026](0026-modules-client-side-data-server-fns-shell-only.md)
  to Storage and supersedes the "service-role only, storage RLS deferred" choice
  in [specs/data/avatars-storage-bucket.md](../specs/data/avatars-storage-bucket.md) (decision #4).

## Context

[ADR-0026](0026-modules-client-side-data-server-fns-shell-only.md) moved
domain-module reads and writes into the browser, governed by TanStack Query with
**RLS as the security boundary**, because the shell SPA (`apps/nafios-web`) has
no server functions. Onboarding is shell-owned, but in the SPA it too runs
entirely client-side: mobile → `updateUserMetadata`, family members + completion
→ the `insert_user_profile` RPC, all through the browser client under RLS.

Avatars were the one piece with no browser path. `@nafios/storage` was built
**server-only**: it uploads and signs via `createServiceRoleClient()` (the
service-role key, which bypasses RLS). The avatars-storage-bucket spec chose that
deliberately (its decision #4) and **deferred storage RLS**, explicitly to avoid
writing RLS on `storage.objects` while every app table still ran RLS-off under
[ADR-0019](0019-app-layer-authz-rls-deferred.md) — two opposing postures.

That premise no longer holds. [ADR-0024](0024-rls-for-auth-epic-tables.md) enabled
owner-isolation RLS on the auth-epic tables and [ADR-0023](0023-rls-for-owned-domain-tables.md)
on the finance tables, so RLS-on is now the standard posture; ADR-0026 made the
browser client, under RLS, the sanctioned data path for the SPA. Uploading avatars
from the browser under storage RLS is the natural, consistent extension — the
alternative (a service-role upload) is impossible without the server runtime the
SPA deliberately drops.

## Decision

Sanction **browser-side avatar uploads governed by Supabase Storage RLS**, for
the SPA shell:

1. **Owner-isolation policies on `storage.objects`** for the private `avatars`
   bucket (migration `20260803000000_avatars_storage_rls.sql`), keyed on the
   object's first path segment: `(storage.foldername(name))[1] = auth.uid()::text`.
   All of INSERT/SELECT/UPDATE/DELETE are granted to owners — the upsert path used
   for idempotent retries needs INSERT + SELECT + UPDATE together (INSERT alone
   makes a replacement silently fail). This matches the deterministic per-user
   path `@nafios/storage` already writes (`{uid}/avatar.webp`, `{uid}/family/{key}.webp`).
2. **A browser surface on `@nafios/storage`** (`@nafios/storage/browser`):
   `uploadAvatarFromBrowser(client, …)` and `signAvatarUrlFromBrowser(client, …)`
   take the caller's own session client instead of constructing a service-role
   client, sharing the path/validation logic with the server surface. The default
   barrel stays SERVER-ONLY; the two surfaces never mix in one import.

The service-role server surface is unchanged and remains the path for the SSR app
(`apps/web`) until it is retired.

## Consequences

- The SPA can complete onboarding — avatars included — with **no server runtime**,
  consistent with ADR-0026. `uid` in the browser input forms the path only; it is
  not a trust boundary — the RLS policy rejects any prefix that is not the
  caller's own `auth.uid()`, so a spoofed uid fails the write rather than crossing
  tenants.
- Storage now carries RLS policies like every owned table — one coherent
  RLS-on posture across DB and Storage, closing the exception ADR-0019 had left.
- Two upload surfaces exist during the migration (service-role for `apps/web`,
  RLS-scoped for `apps/nafios-web`). They share one path convention and collapse
  to just the browser surface once `apps/web` is deleted at cutover.
- The `avatars` bucket is now reproducible from a migration (idempotent bucket
  upsert) rather than a one-off dashboard/SQL step.

## Alternatives considered

- **Keep service-role only; add a tiny upload endpoint.** Rejected: it
  reintroduces a server runtime the SPA deliberately drops (ADR-0026), for the one
  operation that motivated the split.
- **Skip avatars in the SPA.** Rejected here (they are optional in the flow, so a
  viable stopgap) because the team chose full parity; the storage RLS work is
  small and removes a standing exception.
- **Direct `client.storage` calls in the app.** Rejected: it leaks the bucket name
  and path convention into the app and spreads Storage semantics past the
  `@nafios/*` boundary — the same reason `@nafios/storage` exists.
