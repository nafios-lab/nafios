import type { CookieAdapter } from "@nafios/auth-core";

/**
 * Builds a `CookieAdapter` that bridges the raw request `Cookie` header and the
 * framework's `setCookie` with Supabase's session-cookie management. Shared by
 * every server fn that constructs a Supabase client (auth and data).
 */
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

/**
 * Reads the current request's cookies and returns a `CookieAdapter` bound to
 * this request/response. Call inside a server fn handler.
 */
export async function getRequestCookieAdapter(): Promise<CookieAdapter> {
  const { getRequestHeader, setCookie } = await import("@tanstack/react-start/server");
  return createCookieAdapter(getRequestHeader("cookie"), setCookie);
}
