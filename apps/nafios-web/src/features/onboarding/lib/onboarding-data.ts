import { getUser, updateUserMetadata } from "@nafios/auth-core";
import { type FamilyMemberInput, insertUserProfile, saveOnboardingProfile } from "@nafios/database";
import { signAvatarUrlFromBrowser, uploadAvatarFromBrowser } from "@nafios/storage/browser";
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { getAuthClient } from "~/lib/auth";
import { getDb } from "~/lib/database";
import type { FamilyMemberValues } from "../schemas/onboarding-schema";
import { dataUrlToBlob } from "./avatar";

// ── Client-side onboarding data layer (ADR-0026 / ADR-0027) ─────────────────
//
// The SPA has no server functions, so this ports apps/web's `onboarding-fns.ts`
// to the browser: the profile write, the completion write, the resume-hydration
// read, and the completion-gate read all run against the browser data client
// (`getDb()`, RLS-scoped) and the browser auth client (`getAuthClient()`).
// Avatars upload through `@nafios/storage/browser` under the `avatars`
// owner-isolation storage RLS policies.

/**
 * The authenticated user id, validated with the Auth server (not read from the
 * cookie). Only needed for the avatar object path — the DB writes derive
 * ownership from `auth.uid()` server-side. Throws when signed out.
 */
async function requireUid(): Promise<string> {
  const result = await getUser(getAuthClient());
  if (result.error) throw new Error("no_session");
  return result.data.user.id;
}

/** Input for {@link saveProfile}. Both fields optional (Skip = neither). */
export interface SaveProfileInput {
  /**
   * Account-holder avatar as an in-memory data URL from `AvatarUpload`. A value
   * that is already a stored object path (not a `data:` URL) is left as-is and
   * not re-uploaded. Omit when the user set no avatar.
   */
  avatar?: string;
  /** Formatted SG mobile string, e.g. `(+65) 9123 4567`. Omit when not set. */
  mobile?: string;
}

/**
 * Onboarding **Step 2 (Profile)** write. Both inputs are optional and processed
 * **independently**, only when present (an empty field is skipped):
 *
 *   1. **Avatar** (a freshly-picked `data:` URL) → upload bytes to the `avatars`
 *      bucket, then `save_onboarding_profile(p_avatar_url)` writes the returned
 *      object path into `profiles.avatar_url`.
 *   2. **Mobile** → `updateUserMetadata({ mobile })`.
 *
 * Both ops are idempotent and neither stamps `onboarding_completed_at` — the
 * account stays cleanly resumable on the Profile step until the final step.
 */
export async function saveProfile(input: SaveProfileInput): Promise<void> {
  if (input.avatar?.startsWith("data:")) {
    const uid = await requireUid();
    const { blob, contentType } = dataUrlToBlob(input.avatar);
    const { path } = await uploadAvatarFromBrowser(getDb(), {
      uid,
      scope: "account",
      bytes: blob,
      contentType,
    });
    await saveOnboardingProfile(getDb(), { avatarUrl: path });
  }

  if (input.mobile) {
    const result = await updateUserMetadata(getAuthClient(), { mobile: input.mobile });
    if (result.error) throw new Error(result.error.message);
  }
}

/** Input for {@link completeOnboarding} — the wizard's collected family members. */
export interface CompleteOnboardingInput {
  familyMembers: FamilyMemberValues[];
}

/**
 * Onboarding **Step 3 (Family) — Finish**: the completion commit point. For each
 * member with a freshly-picked `data:` avatar, upload the bytes to
 * `avatars/{uid}/family/{key}.webp` and keep the returned object path (`key` is
 * minted per upload; the family rows are replaced wholesale, so a stable key is
 * unnecessary). Then the mapped members (avatar → `avatarUrl`) go to the
 * idempotent `insert_user_profile` RPC, which **replaces** the profile's family
 * rows and stamps `onboarding_completed_at` in one transaction. The account
 * avatar is not re-passed — Step 2 wrote it and the RPC `COALESCE`s.
 *
 * Completing with **zero** family members is valid — the RPC clears any rows and
 * stamps done.
 */
export async function completeOnboarding(input: CompleteOnboardingInput): Promise<void> {
  const db = getDb();
  let uid: string | undefined;

  const familyMembers: FamilyMemberInput[] = [];
  for (const member of input.familyMembers) {
    let avatarUrl: string | undefined;
    if (member.avatar?.startsWith("data:")) {
      uid ??= await requireUid();
      const { blob, contentType } = dataUrlToBlob(member.avatar);
      const { path } = await uploadAvatarFromBrowser(db, {
        uid,
        scope: "family",
        clientKey: crypto.randomUUID(),
        bytes: blob,
        contentType,
      });
      avatarUrl = path;
    } else if (member.avatar) {
      // Defensive: already a stored object path (no re-upload).
      avatarUrl = member.avatar;
    }

    familyMembers.push({
      name: member.name,
      relationship: member.relationship,
      avatarUrl,
      nric: member.nric,
      mobileNo: member.mobileNo,
      dateOfBirth: member.dateOfBirth,
    });
  }

  await insertUserProfile(db, { familyMembers });
}

/** The already-saved Step 2 values, for hydrating the wizard on reload. */
export interface OnboardingProfileHydration {
  /** Short-lived signed URL for `profiles.avatar_url`, or null when none/failed. */
  avatar: string | null;
  /** Saved `user_metadata.mobile`, or "" when none. */
  phone: string;
}

/**
 * Reads back the persisted Profile step so a mid-onboarding reload does not
 * present an empty form. Verified read (validates the JWT) so a mobile written
 * this session is reflected after a reload. Never throws — returns empty values
 * when signed out (the route guard already handles that case).
 */
export async function getOnboardingProfile(): Promise<OnboardingProfileHydration> {
  const userResult = await getUser(getAuthClient());
  if (userResult.error) return { avatar: null, phone: "" };
  const user = userResult.data.user;

  const db = getDb();
  const { data } = await db.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle();

  let avatar: string | null = null;
  if (data?.avatar_url) {
    try {
      avatar = (await signAvatarUrlFromBrowser(db, { path: data.avatar_url })).url;
    } catch {
      // A broken/expired object must not break the onboarding load.
      avatar = null;
    }
  }

  return { avatar, phone: user.mobile ?? "" };
}

/**
 * Whether the user has finished onboarding (`profiles.onboarding_completed_at`
 * is set). The completion flag route guards gate the app on. Takes the user id
 * from the already-cached session so it needs no extra `getUser` round-trip; RLS
 * scopes the read to the caller's own row regardless.
 */
export async function getOnboardingStatus(userId: string): Promise<boolean> {
  const { data } = await getDb()
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("id", userId)
    .maybeSingle();
  return Boolean(data?.onboarding_completed_at);
}

/** Query key for the onboarding-completion gate, scoped per user. */
export const onboardingStatusQueryKey = (userId: string) => ["onboarding-status", userId] as const;

/**
 * TanStack Query options for the completion gate. Route guards read it with
 * `ensureQueryData`, which caches the result across navigations — so the sibling
 * `/onboarding` and `/welcome` gates share one read. {@link resetOnboardingStatus}
 * clears it after Finish so `/welcome` sees the freshly-stamped completion.
 */
export function onboardingStatusQueryOptions(userId: string) {
  return queryOptions({
    queryKey: onboardingStatusQueryKey(userId),
    queryFn: () => getOnboardingStatus(userId),
  });
}

/**
 * Drop the cached completion status so the next guard re-reads it from the DB.
 * Must **remove** (not invalidate) for the same reason as the session query
 * (see `~/lib/auth`): `ensureQueryData` returns cached-but-stale data without
 * refetching, so an invalidated `false` would bounce a just-finished user back
 * to `/onboarding`. Removing forces a fresh authoritative read.
 */
export function resetOnboardingStatus(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: ["onboarding-status"] });
}
