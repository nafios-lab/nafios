import {
  createServerClient,
  getSession,
  getUser,
  signOut,
  type AuthSession,
  type AuthUser,
  type CookieAdapter,
} from "@nafios/auth-core";
import { createServerFn } from "@tanstack/react-start";

function createCookieAdapter(
  rawCookie: string | undefined,
  setCookieFn: (name: string, value: string, options: Record<string, unknown>) => void,
): CookieAdapter {
  return {
    getAll() {
      if (!rawCookie) return [];
      return rawCookie.split(";").map((pair) => {
        const [name, ...rest] = pair.trim().split("=");
        return { name, value: rest.join("=") };
      });
    },
    setAll(cookies) {
      for (const { name, value, options } of cookies) {
        setCookieFn(name, value, {
          domain: options.domain,
          path: options.path ?? "/",
          maxAge: options.maxAge,
          httpOnly: options.httpOnly,
          secure: options.secure,
          sameSite: options.sameSite,
        });
      }
    },
  };
}

async function getServerAuthClient() {
  const { getRequestHeader, setCookie } = await import("@tanstack/react-start/server");
  const raw = getRequestHeader("cookie");
  return createServerClient(createCookieAdapter(raw, setCookie));
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
