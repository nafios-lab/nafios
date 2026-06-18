import {
  type AuthSession,
  type AuthUser,
  createServerClient,
  getSession,
  getUser,
  signOut,
  signUp,
} from "@nafios/auth-core";
import { createServerFn } from "@tanstack/react-start";
import { getRequestCookieAdapter } from "./server-cookies";

async function getServerAuthClient() {
  return createServerClient(await getRequestCookieAdapter());
}

export const getSessionFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ session: AuthSession | null }> => {
    const client = await getServerAuthClient();
    const result = await getSession(client);
    if (result.error) return { session: null };
    return { session: result.data.session };
  },
);

export const getUserFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ user: AuthUser | null }> => {
    const client = await getServerAuthClient();
    const result = await getUser(client);
    if (result.error) return { user: null };
    return { user: result.data.user };
  },
);

export const signOutFn = createServerFn({ method: "POST" }).handler(async () => {
  const client = await getServerAuthClient();
  await signOut(client);
  return { success: true };
});

/**
 * Input contract for {@link signUpFn} — derived from auth-core's `signUp` so it
 * stays the single source of truth. The forms (client) and Supabase (the trust
 * boundary) own validation; this server fn is a thin authenticated pass-through.
 */
export type SignUpInput = Parameters<typeof signUp>[1];

/**
 * Discriminated outcome of {@link signUpFn}. Auth-level failures (e.g. the email
 * is already registered) come back as `{ ok: false }` *data* — not a thrown
 * error — so the caller can classify them by `code` across the server-fn
 * boundary (thrown errors lose their custom fields in transit). Genuinely
 * unexpected failures (network, etc.) still reject the call.
 */
export type SignUpResult =
  | { ok: true; user: AuthUser | null }
  | { ok: false; code: string | undefined; message: string };

export const signUpFn = createServerFn({ method: "POST" })
  .validator((input: SignUpInput) => input)
  .handler(async ({ data }): Promise<SignUpResult> => {
    const client = await getServerAuthClient();

    // Resume path: a prior attempt may have created the auth user (and session)
    // but failed at the profile step. The user no longer needs re-registering —
    // return the existing user so the caller proceeds straight to the profile
    // step. Re-running signUp here would fail with "user already registered".
    const existing = await getSession(client);
    if (!existing.error && existing.data.session) {
      return { ok: true, user: existing.data.session.user };
    }

    const result = await signUp(client, data);
    if (result.error) {
      return { ok: false, code: result.error.code, message: result.error.message };
    }
    return { ok: true, user: result.data.user };
  });
