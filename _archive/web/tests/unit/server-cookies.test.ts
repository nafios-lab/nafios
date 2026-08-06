import { beforeEach, describe, expect, test } from "bun:test";
// server-cookies bridges the framework's request/response cookie primitives to
// Supabase's CookieAdapter. `@tanstack/react-start/server` is stubbed in
// tests/setup.ts: getRequestHeader reads a header set via setRequestCookieHeader,
// and setCookie is a shared spy. The real adapter logic runs against them.
import { getRequestCookieAdapter } from "../../src/lib/server-cookies.ts";
import { setCookie, setRequestCookieHeader } from "../setup.ts";

beforeEach(() => {
  setRequestCookieHeader(undefined);
  setCookie.mockReset();
});

describe("getRequestCookieAdapter().getAll", () => {
  test("returns [] when no Cookie header is present", async () => {
    setRequestCookieHeader(undefined);
    const adapter = await getRequestCookieAdapter();
    expect(adapter.getAll()).toEqual([]);
  });

  test("parses a single name=value pair", async () => {
    setRequestCookieHeader("sb-access-token=abc123");
    const adapter = await getRequestCookieAdapter();
    expect(adapter.getAll()).toEqual([{ name: "sb-access-token", value: "abc123" }]);
  });

  test("parses multiple semicolon-separated pairs and trims whitespace", async () => {
    setRequestCookieHeader("a=1; b=2;  c=3");
    const adapter = await getRequestCookieAdapter();
    expect(adapter.getAll()).toEqual([
      { name: "a", value: "1" },
      { name: "b", value: "2" },
      { name: "c", value: "3" },
    ]);
  });

  test("preserves '=' inside the cookie value (e.g. base64 padding)", async () => {
    setRequestCookieHeader("token=aGVsbG8=");
    const adapter = await getRequestCookieAdapter();
    expect(adapter.getAll()).toEqual([{ name: "token", value: "aGVsbG8=" }]);
  });
});

describe("getRequestCookieAdapter().setAll", () => {
  test("forwards each cookie to setCookie with mapped options", async () => {
    const adapter = await getRequestCookieAdapter();
    adapter.setAll([
      {
        name: "sb-access-token",
        value: "tok",
        options: {
          domain: "nafios.local",
          path: "/app",
          maxAge: 3600,
          httpOnly: true,
          secure: true,
          sameSite: "lax",
        },
      },
    ]);

    expect(setCookie).toHaveBeenCalledTimes(1);
    expect(setCookie).toHaveBeenCalledWith("sb-access-token", "tok", {
      domain: "nafios.local",
      path: "/app",
      maxAge: 3600,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    });
  });

  test("defaults path to '/' when none is supplied", async () => {
    const adapter = await getRequestCookieAdapter();
    adapter.setAll([{ name: "x", value: "y", options: {} }]);

    expect(setCookie).toHaveBeenCalledWith("x", "y", expect.objectContaining({ path: "/" }));
  });

  test("writes every cookie in a multi-cookie batch", async () => {
    const adapter = await getRequestCookieAdapter();
    adapter.setAll([
      { name: "a", value: "1", options: { path: "/" } },
      { name: "b", value: "2", options: { path: "/" } },
    ]);

    expect(setCookie).toHaveBeenCalledTimes(2);
  });
});
