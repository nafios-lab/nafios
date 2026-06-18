import { type AuthSession, createServerClient, getSession } from "@nafios/auth-core";
import { createServerDb, type InsertUserProfileInput, insertUserProfile } from "@nafios/database";
import { createServerFn } from "@tanstack/react-start";
import { getRequestCookieAdapter } from "./server-cookies";

/**
 * Persists the user's profile and family members after signup, as a single
 * atomic unit (see `@nafios/database` `insertUserProfile`). Must run after
 * `signUpFn` has set the session cookie — it relies on that authenticated
 * session so the DB derives the profile owner from `auth.uid()`.
 */
export const insertUserProfileFn = createServerFn({ method: "POST" })
  .validator((input: InsertUserProfileInput) => input)
  .handler(async ({ data }): Promise<{ success: true }> => {
    const db = createServerDb(await getRequestCookieAdapter());
    await insertUserProfile(db, data);
    return { success: true };
  });

/**
 * The onboarding gate's view of the current request: is there a session, and
 * has that user finished onboarding (`profiles.onboarding_completed_at` set)?
 *
 * Route guards use this to keep a signed-in-but-incomplete user out of the app:
 * such a session is bounced back into the signup flow to finish, rather than
 * into the dashboard. Completion is an explicit timestamp, not a proxy — a user
 * may legitimately finish with zero family members.
 */
export const getOnboardingStatusFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ session: AuthSession | null; onboardingCompleted: boolean }> => {
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

    return { session, onboardingCompleted: Boolean(data?.onboarding_completed_at) };
  },
);
