import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useTheme } from "../../src/hooks/use-theme.ts";

beforeEach(() => {
  // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API unavailable in test env
  document.cookie = "nafios-theme=; max-age=0; path=/";
  document.documentElement.classList.remove("dark");
});

afterEach(cleanup);

describe("useTheme", () => {
  test("returns theme, setTheme, and resolvedTheme", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBeDefined();
    expect(typeof result.current.setTheme).toBe("function");
    expect(["light", "dark"]).toContain(result.current.resolvedTheme);
  });

  test("setTheme updates to dark", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme("dark"));

    expect(result.current.theme).toBe("dark");
    expect(result.current.resolvedTheme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  test("setTheme updates to light", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme("light"));

    expect(result.current.theme).toBe("light");
    expect(result.current.resolvedTheme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  test("persists theme choice in cookie", () => {
    const cookieWrites: string[] = [];
    const originalDescriptor =
      Object.getOwnPropertyDescriptor(Document.prototype, "cookie") ??
      Object.getOwnPropertyDescriptor(document, "cookie");

    Object.defineProperty(document, "cookie", {
      set(value: string) {
        cookieWrites.push(value);
        originalDescriptor?.set?.call(this, value);
      },
      get() {
        return originalDescriptor?.get?.call(this) ?? "";
      },
      configurable: true,
    });

    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme("dark"));

    const themeCookie = cookieWrites.find((c) => c.startsWith("nafios-theme=dark"));
    expect(themeCookie).toBeDefined();
    expect(themeCookie).toContain("SameSite=Lax");

    // Restore
    if (originalDescriptor) {
      Object.defineProperty(document, "cookie", originalDescriptor);
    }
  });

  test("system theme resolves to light or dark", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme("system"));

    expect(result.current.theme).toBe("system");
    expect(["light", "dark"]).toContain(result.current.resolvedTheme);
  });
});
