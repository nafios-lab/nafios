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

mock.module("@nafios/auth-core", () => ({
  createBrowserClient,
  getSession,
  getUser,
  signInWithPassword,
  signUp,
  signOut,
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
  navigate.mockReset();
}
