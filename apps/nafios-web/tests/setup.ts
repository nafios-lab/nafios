import { mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import * as ReactRouter from "@tanstack/react-router";
import { createElement } from "react";

GlobalRegistrator.register();

// ─── @nafios/auth-core, mocked process-wide ─────────────────────────────────
//
// This is a pure SPA: there are no server fns. Every auth hook calls the
// Supabase *browser* client directly, so — unlike apps/web's setup, which
// stubbed `createServerFn` + cookie seams — we stub auth-core's browser client
// and ops as shared spies. `getAuthClient()` (src/lib/auth.ts) hands out the
// opaque `authClient` below; tests steer each op's outcome through its spy and
// restore the success defaults via `resetAuthMocks()`.
//
// bun's `mock.module` is process-global (it rewires EVERY importer), so this
// lives in the preload — which runs before any test file loads.

type AuthResult = { error: unknown; data?: unknown };

/** The opaque client every op is expected to be called with. */
export const authClient = { __authClient: true };

export const createBrowserClient = mock((): unknown => authClient);

export const getSession = mock(
  (..._args: unknown[]): Promise<AuthResult> =>
    Promise.resolve({ error: null, data: { session: null } }),
);
// Default = no authenticated user. Real `getUser` signals "signed out" with an
// error (it validates the JWT with the Auth server), not a null user — the
// signup resume check treats "no error" as an existing user, so the default
// keeps tests on the fresh-signup path. Tests that want a user set a success.
export const getUser = mock(
  (..._args: unknown[]): Promise<AuthResult> =>
    Promise.resolve({ error: { message: "Auth session missing!" }, data: null }),
);
export const signInWithPassword = mock(
  (..._args: unknown[]): Promise<AuthResult> =>
    Promise.resolve({ error: null, data: { user: null, session: null } }),
);
export const signUp = mock(
  (..._args: unknown[]): Promise<AuthResult> =>
    Promise.resolve({ error: null, data: { user: null, session: null } }),
);
export const signOut = mock(
  (..._args: unknown[]): Promise<AuthResult> => Promise.resolve({ error: null }),
);
// Onboarding Step 2 writes the mobile here. Default success; tests set an error
// to drive the retry/system-fault paths.
export const updateUserMetadata = mock(
  (..._args: unknown[]): Promise<AuthResult> =>
    Promise.resolve({ error: null, data: { user: { id: "u1" } } }),
);

mock.module("@nafios/auth-core", () => ({
  createBrowserClient,
  getSession,
  getUser,
  signInWithPassword,
  signUp,
  signOut,
  updateUserMetadata,
}));

// ─── @nafios/database + @nafios/storage/browser, mocked process-wide ────────
//
// The client-side onboarding data layer (`features/onboarding/lib/onboarding-data`)
// reads/writes through the browser data client and the browser storage helpers.
// Mock the package boundary — `getDb()` (src/lib/database.ts) hands out the
// opaque `db` sentinel below; the RPC wrappers and storage helpers are shared
// spies tests steer, and `setProfileRow()` seeds the one `profiles` read the
// data layer performs (`.from().select().eq().maybeSingle()`).

/** The `profiles` row the chained read resolves to (null = no row). */
let profileRow: unknown = null;
export function setProfileRow(row: unknown): void {
  profileRow = row;
}

// Chainable stub for the single read the data layer makes.
const dbQuery = {
  select: () => dbQuery,
  eq: () => dbQuery,
  maybeSingle: () => Promise.resolve({ data: profileRow, error: null }),
};
/** The opaque data client every RPC/storage op is expected to be called with. */
export const db = { from: () => dbQuery };

export const createBrowserDb = mock((): unknown => db);
export const insertUserProfile = mock((..._args: unknown[]): Promise<void> => Promise.resolve());
export const saveOnboardingProfile = mock(
  (..._args: unknown[]): Promise<void> => Promise.resolve(),
);

mock.module("@nafios/database", () => ({
  createBrowserDb,
  insertUserProfile,
  saveOnboardingProfile,
}));

export const uploadAvatarFromBrowser = mock(
  (..._args: unknown[]): Promise<{ path: string }> =>
    Promise.resolve({ path: "avatars/u1/avatar.webp" }),
);
export const signAvatarUrlFromBrowser = mock(
  (..._args: unknown[]): Promise<{ url: string }> =>
    Promise.resolve({ url: "https://signed.example/avatar.webp?token=abc" }),
);

mock.module("@nafios/storage/browser", () => ({
  uploadAvatarFromBrowser,
  signAvatarUrlFromBrowser,
}));

// ─── router boundary ────────────────────────────────────────────────────────
// Components call useNavigate()/Link without a live router under test. Mocked
// here (not per-file) so the shared `navigate` spy is the single seam — mocking
// react-router in two files would clobber across the global registry.
export const navigate = mock((_opts?: unknown) => {});

mock.module("@tanstack/react-router", () => ({
  ...ReactRouter,
  useNavigate: () => navigate,
  Link: ({ children, to, ...props }: { children?: unknown; to?: string }) =>
    createElement("a", { href: to, ...props }, children as never),
}));

/** Reset every shared auth spy to its success default. Call in beforeEach. */
export function resetAuthMocks(): void {
  createBrowserClient.mockReset();
  createBrowserClient.mockReturnValue(authClient);
  getSession.mockReset();
  getSession.mockResolvedValue({ error: null, data: { session: null } });
  getUser.mockReset();
  getUser.mockResolvedValue({ error: { message: "Auth session missing!" }, data: null });
  signInWithPassword.mockReset();
  signInWithPassword.mockResolvedValue({ error: null, data: { user: null, session: null } });
  signUp.mockReset();
  signUp.mockResolvedValue({ error: null, data: { user: null, session: null } });
  signOut.mockReset();
  signOut.mockResolvedValue({ error: null });
  updateUserMetadata.mockReset();
  updateUserMetadata.mockResolvedValue({ error: null, data: { user: { id: "u1" } } });
  navigate.mockReset();
}

/**
 * Reset every onboarding data-layer spy to its success default (and the auth
 * spies too, via {@link resetAuthMocks}). Mirrors apps/web's `resetServerFnMocks`
 * as the single beforeEach reset for onboarding tests.
 */
export function resetOnboardingMocks(): void {
  resetAuthMocks();
  profileRow = null;
  createBrowserDb.mockReset();
  createBrowserDb.mockReturnValue(db);
  insertUserProfile.mockReset();
  insertUserProfile.mockResolvedValue(undefined);
  saveOnboardingProfile.mockReset();
  saveOnboardingProfile.mockResolvedValue(undefined);
  uploadAvatarFromBrowser.mockReset();
  uploadAvatarFromBrowser.mockResolvedValue({ path: "avatars/u1/avatar.webp" });
  signAvatarUrlFromBrowser.mockReset();
  signAvatarUrlFromBrowser.mockResolvedValue({
    url: "https://signed.example/avatar.webp?token=abc",
  });
}
