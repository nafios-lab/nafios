import type { Db } from "./client";

/** A family member to attach to the user's profile during onboarding. */
export interface FamilyMemberInput {
  name: string;
  relationship: "spouse" | "child" | "parent" | "sibling" | "other";
  /** Avatar as a data URL or storage URL. */
  avatarUrl?: string | null;
  nric?: string | null;
  mobileNo?: string | null;
  /** ISO date string (`YYYY-MM-DD`). */
  dateOfBirth?: string | null;
}

/** Input for {@link insertUserProfile}. The profile owner is the authenticated user. */
export interface InsertUserProfileInput {
  /** Avatar for the account holder's own profile row. */
  avatarUrl?: string | null;
  familyMembers: FamilyMemberInput[];
}

/**
 * Completes the authenticated user's profile and inserts their family members
 * as a single atomic unit of work.
 *
 * Delegates to the `insert_user_profile` Postgres function so the profile
 * update and the family-member inserts share one transaction — they commit or
 * roll back together. The owning `profile_id` is derived server-side from
 * `auth.uid()`, so it is never trusted from the client.
 *
 * Must run with an authenticated client (a session cookie / JWT); the function
 * raises if `auth.uid()` is null. Throws on any database error.
 */
export async function insertUserProfile(db: Db, input: InsertUserProfileInput): Promise<void> {
  const { error } = await db.rpc("insert_user_profile", {
    p_avatar_url: input.avatarUrl ?? undefined,
    p_family_members: input.familyMembers.map((member) => ({
      name: member.name,
      relationship: member.relationship,
      avatar_url: member.avatarUrl ?? null,
      nric: member.nric ?? null,
      mobile_no: member.mobileNo ?? null,
      date_of_birth: member.dateOfBirth ?? null,
    })),
  });

  if (error) throw new Error(error.message);
}
