---
title: Avatars storage bucket — setup & wiring
status: active
version: 1.0.0
updated: 2026-06-25
owner: Hanafi
related_adrs: [0019, 0021, 0016]
---

# Supabase Storage — `avatars` Bucket Setup & Wiring (Pre-work)

> **Type:** Dev guide / infra + wiring prep
> **Status:** Open
> **Owner:** Hanafi
> **Package:** `@nafios/supabase-core` · `@nafios/storage` · `supabase/`
> **Depends on:** C3 migrations (done — `profiles.avatar_url`, `family_members.avatar_url` exist)
> **Blocks:** avatar upload flow (onboarding Step 2 + family step) — see
> the [onboarding-flow spec](../domain/onboarding-flow.md) ("D3 — Avatar storage")
> **Related:** [ADR-0019 app-layer authz](../../adr/0019-app-layer-authz-rls-deferred.md) ·
> [ADR-0021 supabase-core](../../adr/0021-supabase-core-connection-foundation.md) ·
> [supabase/README.md](../../supabase/README.md)

---

## 0. TL;DR — the checklist

Everything needed *before* a single line of avatar-upload UI/server code is written.
Items marked **🔧 Handoff** are run by you against hosted staging (house convention:
Claude does codebase setup; you run all Supabase CLI/dashboard steps). Items marked
**⌨️ Code** are codebase changes to be implemented in the upload epic — **this guide
only documents them; it makes no code changes.**

- [ ] **🔧 A1** Create the private `avatars` bucket on `nafios-staging` (SQL or dashboard).
- [ ] **🔧 A2** Verify the bucket row (`public=false`, size limit, MIME types).
- [ ] **⌨️ A3** Keep the `[storage.buckets.avatars]` block in `config.toml` (local parity / docs).
- [ ] **🔧 A4** Confirm `SUPABASE_SERVICE_ROLE_KEY` is filled in `.env` (server-only).
- [ ] **⌨️ B1** Add `createServiceRoleClient()` to `@nafios/supabase-core` (+ spec/tests).
- [ ] **⌨️ B2** Add a storage upload helper (new `@nafios/storage` pkg) on top of it (+ spec).
- [ ] **⌨️ C1** Record the authz decision (service-role + app-layer; storage RLS deferred).
- [ ] **🔧 D1** Smoke-test: upload → signed URL → remove with the service-role key.

> Why now: the `avatar_url` columns already exist (the clean seam noted in
> `nafios-auth-d4-onboarding-avatar-upload.md` (working doc) §4.5). What's missing is
> **somewhere to put the bytes** (the bucket) and **a sanctioned way to put them there**
> (a server-side client + helper). This guide stands those up.

---

## 1. Context & current state

| Thing | State today |
|-------|-------------|
| `public.profiles.avatar_url` | exists, `text`, nullable ([migration](../../supabase/migrations/20260613000000_create_profiles_table.sql)) |
| `public.family_members.avatar_url` | exists, `text`, nullable ([migration](../../supabase/migrations/20260613000001_create_family_members_table.sql)) |
| Storage bucket | **none** — nothing to upload to |
| Service-role client | **not provided** — deferred in [supabase-core spec](../../packages/supabase-core/spec.md) "Open Questions" ("add when a server-only workload needs it") — this is that workload |
| `apps/web` Supabase access | **never** imports `@supabase/*` directly — house rule; all access via `@nafios/*` packages |
| Local Docker stack | **sunset** — all dev targets hosted `nafios-staging` ([README](../../supabase/README.md)) |

The upload flow (built later) will: **server fn → upload bytes to `avatars` bucket →
write the object path into the existing `avatar_url` column.** This guide prepares the
bucket and the two code seams that flow depends on.

---

## 2. Decisions (settle these before coding)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Bucket visibility | **Private** (`public = false`) | Avatars are user content; reads go through signed URLs later. |
| 2 | Bucket name / id | `avatars` | Matches the onboarding plan; one bucket for account-holder + family. |
| 3 | Limits | `5 MiB`, mime `image/webp, image/jpeg, image/png` | Matches the client-side `fitAvatar` output (webp, ~256px) + raw-file guard. |
| 4 | Write client | **Service-role, server-side** | No storage RLS to maintain — consistent with [ADR-0019](../../adr/0019-app-layer-authz-rls-deferred.md) (authz at the app layer). The server fn derives `uid` from the verified session and owns the path; the client never picks it. |
| 5 | Helper home | **New `@nafios/storage` package** | supabase-core spec anticipates "future storage" feature packages; keeps `@supabase/*` out of `apps/web`. |
| 6 | What goes in `avatar_url` | **Object path** (e.g. `avatars/{uid}/avatar.webp`) | Private bucket → a plain public URL won't resolve; store the path, sign at read time. |
| 7 | Read / display | **Out of scope** | Signed-URL display is owned by the profile-display follow-up. We only *write* here. |

> **Alternative considered (not chosen):** authenticated user-client uploads + RLS policies
> on `storage.objects`. Rejected for now because it means writing RLS against `storage.objects`
> while every app table deliberately runs RLS-off (ADR-0019) — two opposing postures. Also note
> the Supabase trap: **storage upsert needs INSERT + SELECT + UPDATE policies** (INSERT alone makes
> file replacement silently fail). Service-role bypasses RLS entirely and sidesteps this.

---

## Part A — Infra: create the bucket (🔧 you, against staging)

> `config.toml`'s `[storage.buckets.*]` only provisions the **local** stack (and
> `supabase seed buckets`). Local Docker is sunset here, and `supabase db push` does
> **not** create buckets. So the bucket must be created **directly on hosted staging**.
> The `supabase storage` CLI group is object-only (`ls/cp/mv/rm`) — it cannot create a
> remote bucket. Use SQL (recommended — reviewable & idempotent) or the dashboard.

### A1 — Create the bucket

**Option 1 — SQL (recommended).** Run in Dashboard → SQL Editor, or
`psql "$DATABASE_URL"`. Idempotent, so safe to re-run:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  5242880,                                      -- 5 MiB in BYTES (5 * 1024 * 1024)
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
```

> ⚠️ Via SQL, `file_size_limit` is **bytes** (`bigint`). The dashboard and the
> supabase-js `createBucket()` accept human strings (`'5MB'`) instead — don't mix the units.

**Option 2 — Dashboard.** Storage → **New bucket** → name `avatars` → **Private** →
expand *Additional configuration* → set max file size `5 MB` and restrict MIME types to
`image/webp, image/jpeg, image/png` → Create.

### A2 — Verify

```sql
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'avatars';
-- expect: avatars | f | 5242880 | {image/webp,image/jpeg,image/png}
```

### A4 — Env

`SUPABASE_SERVICE_ROLE_KEY` is already a key in [`.env.example`](../../.env.example) and `.env`.
Confirm it's **filled** in your `.env` (Dashboard → Project Settings → API → secret /
`service_role`). It is **server-only** — never expose it to the browser (it bypasses RLS).

---

## Part B — Codebase wiring (⌨️ to implement in the upload epic — described, not built here)

### B1 — Service-role client in `@nafios/supabase-core`

The only package allowed to import `@supabase/*`. Resolve the spec's open question by adding
a privileged factory alongside [`createServerClient` / `createBrowserClient`](../../packages/supabase-core/src/client.ts):

```ts
// src/service-role-client.ts  (NEW — sketch, do not commit yet)
import { createClient } from "@supabase/supabase-js";

/**
 * Privileged, session-less server client. Bypasses RLS — SERVER-ONLY.
 * Never import where browser bundles can reach it.
 */
export function createServiceRoleClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Missing env: SUPABASE_URL");
  if (!key) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

- Use **`createClient` from `@supabase/supabase-js`** — *not* the `@supabase/ssr`
  cookie client. This is a stateless service, not a user session.
- Export it from the barrel ([`src/index.ts`](../../packages/supabase-core/src/index.ts)).
- Update [`spec.md`](../../packages/supabase-core/spec.md) (resolve the "Service-role client"
  open question; add `SUPABASE_SERVICE_ROLE_KEY` to the env table + a server-only invariant),
  `CLAUDE.md`, and add unit tests (missing-env throws).

### B2 — Storage upload helper (new `@nafios/storage` package)

Scaffold with the generator — **never hand-scaffold** (`/new-package`, see root CLAUDE.md).
Write its `spec.md` first (hard rule: public APIs need a spec before implementation). It
builds on B1's service-role client and keeps `@supabase/*` out of `apps/web`.

```ts
// proposed public API (sketch)
interface UploadAvatarInput {
  uid: string;                 // from the verified session, NOT the client
  scope: "account" | "family";
  clientKey?: string;          // required when scope === "family"
  bytes: ArrayBuffer | Blob;   // the fitted webp from the browser
  contentType: string;         // "image/webp" | "image/jpeg" | "image/png"
}
/** Upserts to a deterministic path; returns the stored object path. */
function uploadAvatar(input: UploadAvatarInput): Promise<{ path: string }>;
```

- Upload with `{ upsert: true }` to a **deterministic path** so retries are idempotent
  (matches the onboarding "every write is idempotent" invariant):
  - account holder → `avatars/{uid}/avatar.webp`
  - family member → `avatars/{uid}/family/{clientKey}.webp`
- Return the **object path** (not a URL) for the caller to write into `avatar_url`.
- The web app calls a **server function**, which calls this helper — `apps/web` stays
  free of any `@supabase/*` import.

> The server function + RPC plumbing (`saveOnboardingProfileFn`, family uploads) is owned by
> the [onboarding-flow spec](../domain/onboarding-flow.md) (Slices 2–3) — out of scope here.
> This guide stops at "the bucket exists and a sanctioned helper can write to it."

---

## Part C — Specs & ADRs to update before coding (⌨️)

- [ ] [`packages/supabase-core/spec.md`](../../packages/supabase-core/spec.md) — resolve the
      service-role open question; document the new factory, env var, and server-only invariant.
- [ ] `packages/storage/spec.md` — **new**, co-located with the new package (public API above).
- [ ] **Authz note (C1):** before deviating, grep `adr/` (hard rule). The chosen posture —
      *storage writes via service-role + app-layer authz; storage RLS deferred alongside table
      RLS* — is a natural extension of [ADR-0019](../../adr/0019-app-layer-authz-rls-deferred.md).
      Capture it either as a short addendum to ADR-0019 or a one-paragraph new ADR so the
      "no storage policies yet" choice is intentional and discoverable.

---

## Part D — Smoke test (🔧 after A1, before/while building B)

A throwaway server-side script (not committed) using the **service-role** key, to prove the
bucket, key, and limits all work end-to-end:

1. Upload a tiny `image/webp` to `avatars/smoketest/x.webp` with `{ upsert: true }`.
2. `createSignedUrl('avatars/smoketest/x.webp', 60)` → fetch it → 200.
3. Re-upload the same path → succeeds (upsert works; INSERT-only would fail here).
4. Upload a `application/pdf` or a >5 MiB blob → **rejected** (MIME / size limits enforced).
5. `storage.remove(['smoketest/x.webp'])` → cleanup.

After the upload code lands, the real gate is:
- `bun run check` (lint + typecheck across the workspace).
- Confirm **no** `@supabase/*` import appears anywhere under `apps/web`.

---

## 5. Out of scope (so the seam stays clean)

- **Display / read path** — signed-URL generation and rendering avatars (profile-display
  follow-up).
- **Upload UI & `fitAvatar`** — already specced in `nafios-auth-d4-onboarding-avatar-upload.md`
  (working doc).
- **Server functions / RPC reshape** — onboarding Slices 2–3.
- **Storage RLS policies** — deferred with table RLS (ADR-0019); revisit in a data-security epic.
- **Image transformation / CDN resizing** — Pro-plan feature, not needed (we pre-fit to ~256px client-side).

---

## 6. References

- Repo: [supabase/README.md](../../supabase/README.md) (CLI runbook) ·
  [config.toml](../../supabase/config.toml) `[storage]` ·
  [.env.example](../../.env.example)
- Packages: [@nafios/supabase-core spec](../../packages/supabase-core/spec.md) ·
  [client.ts](../../packages/supabase-core/src/client.ts) ·
  [@nafios/database repo](../../packages/database/src/user-profiles.repo.ts)
- ADRs: [0019 app-layer authz](../../adr/0019-app-layer-authz-rls-deferred.md) ·
  [0016 auth schema referenced](../../adr/0016-auth-schema-referenced-not-owned.md) ·
  [0021 supabase-core](../../adr/0021-supabase-core-connection-foundation.md)
- Sibling docs: [onboarding-flow spec](../domain/onboarding-flow.md) ·
  `nafios-auth-d4-onboarding-avatar-upload.md` (working doc)
- Supabase docs: [Creating buckets](https://supabase.com/docs/guides/storage/buckets/creating-buckets) ·
  [Access control](https://supabase.com/docs/guides/storage/security/access-control)
