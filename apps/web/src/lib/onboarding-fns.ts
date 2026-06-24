import {
  type AuthSession,
  createServerClient,
  getSession,
  getUser,
  updateUserMetadata,
} from "@nafios/auth-core";
import {
  createServerDb,
  type FamilyMemberInput,
  insertUserProfile,
  saveOnboardingProfile,
} from "@nafios/database";
import { signAvatarUrl, uploadAvatar } from "@nafios/storage";
import { createServerFn } from "@tanstack/react-start";
import { getRequestCookieAdapter } from "./server-cookies";

/** Input for {@link saveOnboardingProfileFn}. Both fields optional (Skip = neither). */
export interface SaveOnboardingProfileInput {
  /**
   * The account-holder avatar as an in-memory data URL
   * (`data:image/webp;base64,…`) from the `AvatarUpload` field. Omit when the
   * user did not set/keep an avatar. A value that is already a stored object
   * path (not a `data:` URL) is left as-is and not re-uploaded.
   */
  avatar?: string;
  /** Formatted SG mobile string, e.g. `(+65) 9123 4567`. Omit when not set. */
  mobile?: string;
}

/** Errors-as-data result so the calling hook can retry `system` faults. */
export type SaveOnboardingProfileResult = { ok: true } | { ok: false; code: string };

/** Parses a `data:[<mime>][;base64],<data>` URL into its mime + raw bytes. */
function decodeDataUrl(dataUrl: string): { contentType: string; bytes: Uint8Array } {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("saveOnboardingProfile: malformed avatar data URL");
  const [, contentType, base64Flag, payload] = match;
  const bytes = base64Flag
    ? new Uint8Array(Buffer.from(payload, "base64"))
    : new Uint8Array(Buffer.from(decodeURIComponent(payload), "utf-8"));
  return { contentType, bytes };
}

/**
 * Onboarding **Step 2 (Profile)** write. Runs with the active session from
 * Phase A. Both inputs are optional and processed **independently**, only when
 * present (an empty field is skipped — no upload, no metadata write):
 *
 *   1. **Avatar** (if a `data:` URL is given) → upload bytes to the `avatars`
 *      Storage bucket, then `save_onboarding_profile(p_avatar_url)` writes the
 *      returned object path into `profiles.avatar_url`.
 *   2. **Mobile** (if given) → `updateUserMetadata({ mobile })` writes
 *      `auth.users.user_metadata.mobile` (no SMS verification).
 *
 * Both ops are idempotent and neither stamps `onboarding_completed_at` — the
 * account stays cleanly resumable on the Profile step until the final step.
 * Returns errors as data; the caller retries `system` faults.
 */
export const saveOnboardingProfileFn = createServerFn({ method: "POST" })
  .validator((input: SaveOnboardingProfileInput) => input)
  .handler(async ({ data }): Promise<SaveOnboardingProfileResult> => {
    const cookies = await getRequestCookieAdapter();

    const authClient = createServerClient(cookies);
    const sessionResult = await getSession(authClient);
    const session = sessionResult.error ? null : sessionResult.data.session;
    if (!session) return { ok: false, code: "no_session" };

    try {
      // 1) Avatar → Storage → profiles.avatar_url (only a freshly-picked data URL).
      if (data.avatar?.startsWith("data:")) {
        const { contentType, bytes } = decodeDataUrl(data.avatar);
        const { path } = await uploadAvatar({
          uid: session.user.id,
          scope: "account",
          bytes,
          contentType,
        });
        await saveOnboardingProfile(createServerDb(cookies), { avatarUrl: path });
      }

      // 2) Mobile → auth.users.user_metadata.mobile.
      if (data.mobile) {
        const result = await updateUserMetadata(authClient, { mobile: data.mobile });
        if (result.error) return { ok: false, code: result.error.code ?? "update_metadata_failed" };
      }

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        code: error instanceof Error ? error.message : "save_profile_failed",
      };
    }
  });

/** One family member as collected by the wizard (the spec `FamilyMemberValues`). */
export interface CompleteOnboardingMember {
  name: string;
  relationship: "spouse" | "child" | "parent" | "sibling" | "other";
  /** In-memory avatar data URL (`data:…`); uploaded here on Finish. */
  avatar?: string;
  nric?: string;
  mobileNo?: string;
  /** ISO `YYYY-MM-DD`. */
  dateOfBirth?: string;
}

/** Input for {@link completeOnboardingFn} — the wizard's collected family members. */
export interface CompleteOnboardingInput {
  familyMembers: CompleteOnboardingMember[];
}

/** Errors-as-data result so the calling hook can retry `system` faults. */
export type CompleteOnboardingResult = { ok: true } | { ok: false; code: string };

/**
 * Onboarding **Step 3 (Family) — Finish**: the completion commit point. Runs with
 * the active session from Phase A. For each family member:
 *
 *   1. **Avatar** (if a `data:` URL) → upload bytes to `avatars/{uid}/family/
 *      {clientKey}.webp` and keep the returned object path. `clientKey` is minted
 *      server-side per upload (the wizard's session-only key never crosses the
 *      wire); the family rows are replaced wholesale below, so a stable key is
 *      unnecessary. An already-stored path is passed through unchanged.
 *
 * Then the mapped members (avatar → `avatarUrl`) are handed to the idempotent
 * `insert_user_profile` RPC via {@link insertUserProfile}, which **replaces** the
 * profile's family rows and stamps `onboarding_completed_at` in one transaction.
 * The account avatar is **not** passed — it was written in Step 2 and the RPC
 * `COALESCE`s, so omitting it preserves the existing value.
 *
 * Returns errors as data; the caller retries `system` faults. Completing with
 * **zero** family members is valid — the RPC clears any rows and stamps done.
 */
export const completeOnboardingFn = createServerFn({ method: "POST" })
  .validator((input: CompleteOnboardingInput) => input)
  .handler(async ({ data }): Promise<CompleteOnboardingResult> => {
    const cookies = await getRequestCookieAdapter();

    const authClient = createServerClient(cookies);
    const sessionResult = await getSession(authClient);
    const session = sessionResult.error ? null : sessionResult.data.session;
    if (!session) return { ok: false, code: "no_session" };

    try {
      const uid = session.user.id;

      const familyMembers: FamilyMemberInput[] = [];
      for (const member of data.familyMembers) {
        let avatarUrl: string | undefined;
        if (member.avatar?.startsWith("data:")) {
          const { contentType, bytes } = decodeDataUrl(member.avatar);
          const { path } = await uploadAvatar({
            uid,
            scope: "family",
            clientKey: crypto.randomUUID(),
            bytes,
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

      await insertUserProfile(createServerDb(cookies), { familyMembers });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        code: error instanceof Error ? error.message : "complete_onboarding_failed",
      };
    }
  });

/**
 * The onboarding gate's view of the current request: is there a session, and has
 * that user finished onboarding (`profiles.onboarding_completed_at` set)?
 *
 * Route guards use `onboardingCompleted` to keep a signed-in-but-incomplete user
 * out of the app (bounced to `/onboarding`). The wizard always reopens at the
 * Profile step — its saved fields are restored by `getOnboardingProfileFn` — so
 * there is **no** furthest-step resume and no "how far did they get" signal is
 * needed here. Completion is an explicit timestamp, not a proxy — a user may
 * legitimately finish with zero family members.
 */
export const getOnboardingStatusFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    session: AuthSession | null;
    onboardingCompleted: boolean;
  }> => {
    const cookies = await getRequestCookieAdapter();

    const sessionResult = await getSession(createServerClient(cookies));
    const session = sessionResult.error ? null : sessionResult.data.session;
    if (!session) return { session: null, onboardingCompleted: false };

    const db = createServerDb(cookies);
    const { data } = await db
      .from("profiles")
      .select("onboarding_completed_at")
      .eq("id", session.user.id)
      .maybeSingle();

    return {
      session,
      onboardingCompleted: Boolean(data?.onboarding_completed_at),
    };
  },
);

/**
 * The already-saved **Step 2 (Profile)** values, for hydrating the wizard when
 * the user reloads mid-onboarding. Without this the form remounts empty even
 * though the data is persisted (avatar in Storage, mobile in `user_metadata`),
 * which reads as data loss.
 *
 * - `avatar` — a short-lived **signed** URL for `profiles.avatar_url` (the bucket
 *   is private, so the stored object path is not directly displayable), or
 *   `null` when none is saved or signing fails (a broken/expired object must not
 *   break the onboarding load).
 * - `phone` — the saved `user_metadata.mobile`, or `""` when none.
 *
 * Returns empty values (never throws) when there is no session — the route guard
 * already handles the unauthenticated case.
 */
export const getOnboardingProfileFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ avatar: string | null; phone: string }> => {
    const cookies = await getRequestCookieAdapter();

    // Verified read (validates the JWT with the auth server) so freshly-written
    // user_metadata.mobile is reflected after a save + reload.
    const userResult = await getUser(createServerClient(cookies));
    if (userResult.error) return { avatar: null, phone: "" };
    const user = userResult.data.user;

    const db = createServerDb(cookies);
    const { data } = await db.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle();

    let avatar: string | null = null;
    if (data?.avatar_url) {
      try {
        avatar = (await signAvatarUrl({ path: data.avatar_url })).url;
      } catch {
        avatar = null;
      }
    }

    return { avatar, phone: user.mobile ?? "" };
  },
);
