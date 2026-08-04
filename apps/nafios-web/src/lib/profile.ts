import { signAvatarUrlFromBrowser } from "@nafios/storage/browser";
import { queryOptions } from "@tanstack/react-query";
import { getDb } from "~/lib/database";

// ── Shell profile read (ADR-0026) ───────────────────────────────────────────
//
// The signed-in session carries only the account (id + email); the display
// avatar lives in `profiles.avatar_url` as a *private*-bucket object path, not a
// URL. This reads that path and mints a short-lived signed URL so the shell
// chrome (the sidebar user menu) can render it in an `<img>`. It is the same
// read-and-sign the onboarding resume-hydration performs
// (`getOnboardingProfile`), lifted to a shell-wide query any chrome can consume.

/** The shell-relevant slice of the user's profile. */
export interface ShellProfile {
  /** A freshly-signed, displayable avatar URL, or `undefined` when none is set. */
  avatarUrl?: string;
}

/** Query key for the shell profile, scoped per user. */
export const profileQueryKey = (userId: string) => ["profile", userId] as const;

/**
 * TanStack Query options for the shell profile. Reads `profiles.avatar_url` and
 * signs it for display.
 *
 * **Never rejects:** a missing row, a missing path, or a broken/expired object
 * all resolve to an empty profile, so the user menu simply falls back to
 * initials — a display avatar must not be able to break the shell.
 *
 * `staleTime` sits just under the 1-hour signed-URL lifetime (`DEFAULT_EXPIRES_IN`
 * in `@nafios/storage`), so a background refetch re-signs the URL before the one
 * in hand expires.
 */
export function profileQueryOptions(userId: string) {
  return queryOptions({
    queryKey: profileQueryKey(userId),
    queryFn: async (): Promise<ShellProfile> => {
      const db = getDb();
      const { data } = await db
        .from("profiles")
        .select("avatar_url")
        .eq("id", userId)
        .maybeSingle();

      if (!data?.avatar_url) return {};

      try {
        const { url } = await signAvatarUrlFromBrowser(db, { path: data.avatar_url });
        return { avatarUrl: url };
      } catch {
        // A broken/expired object must not break the shell — fall back to initials.
        return {};
      }
    },
    staleTime: 50 * 60 * 1000,
  });
}
