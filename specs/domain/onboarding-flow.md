---
title: Onboarding flow (signup → profile → family → review)
status: active
version: 2.0.0
updated: 2026-06-23
owner: Hanafi
related_adrs: [0016, 0018, 0019, 0021]
---

# Onboarding Flow — Specification

## Purpose

Defines how a new NafiOS account goes from "no user" to "ready to use the app":
a minimal **signup** phase that creates the auth credential, followed by an
authenticated **onboarding wizard** (Profile → Family → Review) that enriches the
account and, at the very end, stamps it complete. Persistence is **per step** —
each step writes its own data when the user submits it, and the completion stamp
is written last.

> **v2.0.0 supersedes v1** (the single combined 4-step wizard on `/auth/signup`).
> The design proposal and full refactor history live in
> [`issues/nafios-onboarding-flow.md`](../../issues/nafios-onboarding-flow.md).
> **This file is the authoritative contract.**

## Scope

**In:** the phase split (signup vs. onboarding), the three-step wizard model, the
per-step persistence contract, where each field lands, route guards, re-entry /
resume behavior, and **reading saved Step-2 data back to hydrate the wizard on
reload** (avatar via a signed URL, mobile via `user_metadata`).

**Out:** email confirmation (deferred — `enable_confirmations = false`), general
profile-display / avatar rendering **outside** onboarding (Settings, navbar — a
later follow-up; onboarding signs its own avatar for reload hydration), username
uniqueness, and the module-mount machinery behind the dashboard.

## The step model (canonical numbering)

Three logical steps; the last spans two wizard screens.

| Step | What | Persists to DB? | Where |
|---|---|---|---|
| **Step 1 — Signup** | `email` + `password` → create the auth user | ✅ `auth.users` (credential) | Phase A, standalone form at `/auth/signup` |
| **Step 2 — Profile** | `avatar` + `mobile` — **both optional, skippable** | ✅ on **Save** (skipped → nothing) | onboarding wizard, screen 1 |
| **Step 3 — Family + Review** | enter 0–10 family members, then review everything | ✅ on **Confirm** (family rows + completion stamp) | onboarding wizard, screens 2 & 3 |

> **No `username`.** v2.0.0 collects only `avatar` and `mobile` in the Profile
> step. The `profiles.username` column exists (nullable, non-unique) but is **not
> captured by onboarding** — it is a deferred field, written by no flow today.

## Entities

```ts
// Profile step (apps/web — features/auth/schemas/onboarding-schema.ts)
interface ProfileValues {
  avatar?: string;   // in-memory data URL while editing; uploaded to Storage on Save
  phone?: string;    // formatted SG mobile, e.g. "(+65) 9123 4567"
}

// Family step (one or more)
interface FamilyMemberValues {
  name: string;                    // required
  relationship: "spouse" | "child" | "parent" | "sibling" | "other";
  avatar?: string;                 // data URL → Storage on final Confirm
  nric?: string;
  phone?: string;                  // formatted SG mobile
  dateOfBirth?: string;            // ISO YYYY-MM-DD
}
```

### Where every field lands

| Field | Step | Persisted to | Notes |
|---|---|---|---|
| `email` / `password` | Step 1 | `auth.users` (credential) | created by `signUp` |
| account `avatar` | Step 2 | `public.profiles.avatar_url` | uploaded to Storage; column holds the **object path** `avatars/{uid}/avatar.webp`, not a data URL |
| `mobile` | Step 2 | `auth.users` **`user_metadata.mobile`** | written via `auth.updateUser({ data })`; **no** SMS verification; kept with the auth identity for future optional SMS 2FA |
| family members (0–10) | Step 3 | `public.family_members.*` | avatars → Storage `avatars/{uid}/family/{clientKey}.webp` |
| `onboarding_completed_at` | Step 3 (Confirm) | `public.profiles` | the completion stamp — written **last** |

> **Why `user_metadata.mobile`, not the native `auth.users.phone` column:** the
> field is a human-formatted display string `(+65) 9123 4567`, not E.164, and the
> native column triggers Supabase's SMS phone-change verification (an SMS provider
> we do not run). `user_metadata` stores the value as-is with no verification.

## Step 2 — Profile (the focus of v2.0.0)

Both fields are optional. The user either **Saves** what they entered or **Skips**
the whole step; either way the wizard advances to Family.

**On Save** — two independent, each-optional operations run server-side, in order:

1. **Avatar upload** — *only if an avatar was provided.* Decode the in-memory data
   URL → bytes; upload to `avatars/{uid}/avatar.webp` (upsert, deterministic path);
   write the returned object path into `profiles.avatar_url` via the
   `save_onboarding_profile` RPC.
2. **Mobile write** — *only if a mobile was provided.* `auth.updateUser({ data: {
   mobile } })` → `user_metadata.mobile`.

Empty fields are not processed (no upload, no metadata write). After both succeed,
the submitted values are kept in wizard state and the wizard advances to Family.

**On Skip** — no writes at all; advance to Family.

**Auto-populate on back-navigation (required behavior):** if the user advances
past Profile and then navigates **back** to it, the form must re-populate with
whatever was last submitted — **both the avatar preview and the mobile** — from
in-session wizard state.

**Re-populate on reload (required behavior):** a full page reload wipes in-memory
wizard state, so the wizard hydrates Step 2 from the backend. The `/onboarding`
route loader calls `getOnboardingProfileFn`, which reads `profiles.avatar_url`
(minted into a short-lived **signed URL** via `@nafios/storage`'s `signAvatarUrl`,
since the bucket is private) and `user_metadata.mobile` (now surfaced on
`AuthUser`), and seeds the wizard provider's initial data. Without this the form
remounts empty for data that is already persisted, reading as data loss. The
hydrated avatar arrives as a signed URL (not a `data:` URL), so re-Saving an
unchanged avatar correctly skips re-upload. The wizard **always reopens at the
Profile step** with these fields restored — there is no furthest-step resume
(see D6).

## Persistence model — per-step (incremental)

```
STEP 1 — Signup        signUp({ email, password }) → auth.users
                       trigger handle_new_user() → bare profiles row (onboarding_completed_at = NULL)
                       session established immediately (confirmations OFF) → redirect /onboarding

STEP 2 — Profile       [Skip] → no writes; advance to Family
                       [Save] → saveOnboardingProfileFn({ avatar?, mobile? })
                                ├─ if avatar: upload → Storage; save_onboarding_profile(p_avatar_url)
                                └─ if mobile: updateUserMetadata({ mobile }) → user_metadata
                                (each idempotent; does NOT stamp onboarding_completed_at)

STEP 3 — Family+Review Family screen → collect members in wizard state (NO write)
                       Review → [Confirm] → completeOnboardingFn({ familyMembers })
                                └─ family rows + UPDATE profiles SET onboarding_completed_at = now()  ← COMMIT POINT
```

**Why it's safe:** every step writes only its own data on an explicit
submit/confirm; `onboarding_completed_at` is stamped only by the final step, so any
interruption leaves the account *incomplete* and the guards resume it; every write
is idempotent (deterministic avatar path, `COALESCE` profile update, identical
metadata, family `DELETE`+`INSERT`).

## Invariants

1. Every domain row FKs to `public.profiles`, never `auth.users` directly (ADR-0016).
2. `onboarding_completed_at` is the **only** completion signal — written last, by the
   final step's RPC. A bare profile row (created by the signup trigger) ≠ onboarded.
3. `mobile` lives in `user_metadata` and is **never** an authorization input (ADR-0019).
4. Phase B requires the Phase A session: every onboarding RPC derives the owner from
   `auth.uid()` and raises if unauthenticated.
5. Every step's write is idempotent and self-contained — re-running a step never
   duplicates rows or corrupts state, and no step but the last writes the stamp.
6. The web app never imports `@supabase/*` directly — auth, data, and storage all go
   through `@nafios/*` packages.
7. Profile fields are optional; **Skip writes nothing** and is always a valid path.

## Public API (surfaces this spec governs)

```ts
// apps/web/src/lib/onboarding-fns.ts (TanStack server functions)
saveOnboardingProfileFn(input: { avatar?: string; mobile?: string })
  : Promise<{ ok: true } | { ok: false; code: string }>
completeOnboardingFn(input: { familyMembers: FamilyMemberInput[] })  // Step 3 (pending)
  : Promise<{ ok: true } | { ok: false; code: string }>
getOnboardingStatusFn(): Promise<{
  session: AuthSession | null;
  onboardingCompleted: boolean;   // the only gate — the wizard always opens at Profile
}>
getOnboardingProfileFn(): Promise<{
  avatar: string | null;          // signed URL for profiles.avatar_url (display), or null
  phone: string;                  // user_metadata.mobile, or "" — for reload hydration
}>

// @nafios/database
saveOnboardingProfile(db, { avatarUrl?: string }): Promise<void>   // → save_onboarding_profile RPC

// @nafios/auth-core
updateUserMetadata(client, metadata: { mobile?: string }): Promise<AuthResult<{ user: AuthUser }>>

// @nafios/storage
uploadAvatar(input: { uid; scope: "account" | "family"; clientKey?; bytes; contentType })
  : Promise<{ path: string }>     // upserts to a deterministic path; returns the object path

// @nafios/supabase-core
createServiceRoleClient(): SupabaseClient   // SERVER-ONLY, bypasses RLS — used by @nafios/storage
```

### Storage

Private bucket `avatars` (`public = false`, 5 MiB, `image/webp|jpeg|png`). All writes
go through a **service-role** client server-side (no storage RLS — consistent with
ADR-0019 app-layer authz). Object paths: account `avatars/{uid}/avatar.webp`, family
`avatars/{uid}/family/{clientKey}.webp`. `*.avatar_url` stores the object path; reads
are signed at display time via `@nafios/storage`'s `signAvatarUrl` (used by
`getOnboardingProfileFn` for reload hydration).

### Routing & guards

`/onboarding` (under the `_protected` layout, a sibling of the `_app` completion
gate) hosts the wizard. The single source of truth for "ready" is
`onboarding_completed_at`.

| Route | No session | Session, **incomplete** | Session, **complete** |
|---|---|---|---|
| `/` | → `/auth/login` | → `/onboarding` | → `/dashboard` |
| `/auth/*` | stay | → `/` (→ onboarding) | → `/` (→ dashboard) |
| `/onboarding` | → `/auth/login` | render the wizard | (guard may send to `/dashboard`) |
| `/_protected/_app/*` | → `/auth/login` | → `/onboarding` | render the app |

### Re-entry / resume (D6)

Resume keys off a single bit — `onboarding_completed_at` — and **always opens the
wizard at the Profile step** (no per-step pointer, no furthest-step routing):

```
onboarding_completed_at set        → /dashboard
otherwise                          → /onboarding @ Profile (Step 2), fields rehydrated
```

> **Decision:** the wizard does **not** jump a returning user forward to the step
> they last reached. On every (incomplete) re-entry — including a mid-flow reload —
> it opens at Profile, with its saved fields restored by `getOnboardingProfileFn`
> (avatar via a signed URL, mobile from `user_metadata`). This is intentional and
> final: Step 2 is one-click skippable, so re-landing there costs a returning user
> nothing, and it avoids a step-pointer column and the "skipped vs. never-reached"
> ambiguity entirely. (Furthest-step resume was considered and dropped.)

## Error modes

With no `username` uniqueness, onboarding introduces **no** user-fixable errors — the
only user-actionable failure in the whole flow is a duplicate email at signup.

| Failure | Surfaced as | Recovery |
|---|---|---|
| Duplicate email (Step 1) | inline, user-actionable | edit email / sign in |
| Avatar upload / profile write (Step 2) | `system` | retried ≤3×; on exhaustion → held on Step 2 / generic error |
| `updateUser` mobile write (Step 2) | `system` | retried ≤3×; on exhaustion → held on Step 2 |
| Family + completion write (Step 3) | `system` | retried ≤3×; stamp not written → account stays incomplete, reopens at Profile |
| Prior partial attempt | resume | reopens at Profile with fields rehydrated; idempotent ops prevent duplication |

Server functions return **errors as data** (`{ ok: false, code }`); the calling hook
retries up to `MAX_PROFILE_ATTEMPTS` (3) on `system` faults.

## Examples

```ts
// Step 2 — user set both fields, then Save
await saveOnboardingProfileFn({ avatar: "data:image/webp;base64,…", mobile: "(+65) 9123 4567" });
// → uploads avatars/{uid}/avatar.webp, save_onboarding_profile(p_avatar_url),
//   updateUserMetadata({ mobile }); wizard advances to Family.

// Step 2 — user set only a mobile
await saveOnboardingProfileFn({ mobile: "(+65) 9123 4567" });
// → no upload, no avatar write; only updateUserMetadata runs.

// Step 2 — Skip
// → no server call at all; wizard advances to Family.
```

## Open questions

- **Username** — column exists but no flow writes it; uniqueness + "username taken" UX
  is a deliberate future change.
- **General profile-display / avatar rendering** — onboarding now signs its own
  avatar for reload hydration (`signAvatarUrl`); a broader read path for Settings,
  the navbar, etc. (and any URL caching) is still a follow-up.
- ~~**Read-back of `mobile`**~~ — **done.** `AuthUser` now mirrors
  `user_metadata.mobile`, consumed by `getOnboardingProfileFn` for reload hydration.
- **Mobile normalization** — stored as the formatted SG string; normalize to E.164
  if/when queried, deduplicated, or used for SMS 2FA.
- ~~**Furthest-step resume / `onboarding_step` pointer**~~ — **dropped.** Re-entry
  always opens at Profile with fields rehydrated (see D6); no step pointer.
- **Step 3 final write** — `complete_onboarding` RPC + `completeOnboardingFn` land with
  the Family/Review implementation pass.
