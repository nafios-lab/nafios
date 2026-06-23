import { mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import * as ReactRouter from "@tanstack/react-router";
import { createElement } from "react";

GlobalRegistrator.register();

// ─── Server-fn runtime, mocked process-wide ────────────────────────────────
//
// bun's mock.module is process-global and rewires EVERY importer of a module —
// so a module can't be "real" in one test file and "mocked" in another. We
// therefore never mock the leaf server-fn modules (lib/auth-fns, lib/onboarding
// -fns); instead we mock the runtime + data boundaries they sit on, ONCE, here
// in the preload (which runs before any test file loads):
//
//   • `createServerFn` — the real factory wires into the Start runtime, which
//     only exists behind the Vite/Start transform, and it runs at MODULE-EVAL
//     time. The stub returns a directly-callable handler so the server-fn
//     modules build everywhere and their REAL handler bodies run under test.
//   • `@nafios/auth-core` / `@nafios/database` / `react-start/server` — the
//     auth, db, and cookie primitives the handlers call. Exposed as shared
//     spies so every test (component or unit) drives the same seams.
//
// The upshot: the server fns are always the real implementations, exercised for
// coverage, and tests steer them via the spies below.

mock.module("@tanstack/react-start", () => ({
  createServerFn() {
    let validator: ((input: unknown) => unknown) | undefined;
    const builder = {
      validator(fn: (input: unknown) => unknown) {
        validator = fn;
        return builder;
      },
      handler(handlerFn: (ctx: { data: unknown }) => unknown) {
        return async (input?: { data?: unknown }) => {
          const data = validator ? validator(input?.data) : input?.data;
          return handlerFn({ data });
        };
      },
    };
    return builder;
  },
}));

// ─── auth-core spies ────────────────────────────────────────────────────────
// Return types are intentionally wide so tests can resolve success or error
// shapes via mockResolvedValue without fighting a narrow inferred default.
type AuthResult = { error: unknown; data?: unknown };

export const getSession = mock(
  (..._args: unknown[]): Promise<AuthResult> =>
    Promise.resolve({ error: null, data: { session: null } }),
);
export const getUser = mock(
  (..._args: unknown[]): Promise<AuthResult> =>
    Promise.resolve({ error: null, data: { user: null } }),
);
export const signOut = mock(
  (..._args: unknown[]): Promise<AuthResult> => Promise.resolve({ error: null }),
);
export const signUp = mock(
  (..._args: unknown[]): Promise<AuthResult> =>
    Promise.resolve({ error: null, data: { user: null } }),
);
export const signInWithPassword = mock(
  (..._args: unknown[]): Promise<AuthResult> =>
    Promise.resolve({ error: null, data: { user: null, session: null } }),
);
export const createServerClient = mock((..._args: unknown[]) => ({ __authClient: true }));
export const updateUserMetadata = mock(
  (..._args: unknown[]): Promise<AuthResult> =>
    Promise.resolve({ error: null, data: { user: null } }),
);

mock.module("@nafios/auth-core", () => ({
  createServerClient,
  getSession,
  getUser,
  signInWithPassword,
  signOut,
  signUp,
  updateUserMetadata,
}));

// ─── database spies ───────────────────────────────────────────────────────
// Chainable PostgREST stub: from(...).select(...).eq(...).maybeSingle(). Drive
// the result via `maybeSingle.mockResolvedValue(...)` per test.
export const maybeSingle = mock(
  (): Promise<{
    data: { onboarding_completed_at: string | null; avatar_url?: string | null } | null;
  }> => Promise.resolve({ data: null }),
);
export const eq = mock(() => ({ maybeSingle }));
export const select = mock(() => ({ eq }));
export const from = mock(() => ({ select }));
export const createServerDb = mock((..._args: unknown[]) => ({ from }));
export const insertUserProfile = mock((..._args: unknown[]) => Promise.resolve(undefined));
export const saveOnboardingProfile = mock((..._args: unknown[]) => Promise.resolve(undefined));

mock.module("@nafios/database", () => ({
  createServerDb,
  insertUserProfile,
  saveOnboardingProfile,
}));

// ─── storage spies ──────────────────────────────────────────────────────────
export const uploadAvatar = mock(
  (..._args: unknown[]): Promise<{ path: string }> =>
    Promise.resolve({ path: "avatars/u1/avatar.webp" }),
);
export const signAvatarUrl = mock(
  (..._args: unknown[]): Promise<{ url: string }> =>
    Promise.resolve({ url: "https://signed.example/avatars/u1/avatar.webp?token=t" }),
);

mock.module("@nafios/storage", () => ({ uploadAvatar, signAvatarUrl }));

// ─── framework request/response cookie primitives ───────────────────────────
export const setCookie = mock(
  (_name: string, _value: string, _options: Record<string, unknown>) => {},
);
// Header source for getRequestHeader("cookie"); swap via setRequestCookieHeader.
let requestCookieHeader: string | undefined;
export function setRequestCookieHeader(value: string | undefined): void {
  requestCookieHeader = value;
}

mock.module("@tanstack/react-start/server", () => ({
  getRequestHeader: (name: string) => (name === "cookie" ? requestCookieHeader : undefined),
  setCookie,
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

/** Reset every shared server-fn spy to its success default. Call in beforeEach. */
export function resetServerFnMocks(): void {
  getSession.mockReset();
  getSession.mockResolvedValue({ error: null, data: { session: null } });
  getUser.mockReset();
  getUser.mockResolvedValue({ error: null, data: { user: null } });
  signOut.mockReset();
  signOut.mockResolvedValue({ error: null });
  signUp.mockReset();
  signUp.mockResolvedValue({ error: null, data: { user: null } });
  signInWithPassword.mockReset();
  signInWithPassword.mockResolvedValue({ error: null, data: { user: null, session: null } });
  createServerClient.mockReset();
  createServerClient.mockReturnValue({ __authClient: true });
  updateUserMetadata.mockReset();
  updateUserMetadata.mockResolvedValue({ error: null, data: { user: null } });

  maybeSingle.mockReset();
  maybeSingle.mockResolvedValue({ data: null });
  eq.mockClear();
  select.mockClear();
  from.mockClear();
  createServerDb.mockReset();
  createServerDb.mockReturnValue({ from });
  insertUserProfile.mockReset();
  insertUserProfile.mockResolvedValue(undefined);
  saveOnboardingProfile.mockReset();
  saveOnboardingProfile.mockResolvedValue(undefined);
  uploadAvatar.mockReset();
  uploadAvatar.mockResolvedValue({ path: "avatars/u1/avatar.webp" });
  signAvatarUrl.mockReset();
  signAvatarUrl.mockResolvedValue({ url: "https://signed.example/avatars/u1/avatar.webp?token=t" });

  setCookie.mockReset();
  requestCookieHeader = undefined;

  navigate.mockReset();
}
