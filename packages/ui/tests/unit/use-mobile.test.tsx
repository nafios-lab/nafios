import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";

// Capture the matchMedia change listeners so a test can fire them, mirroring the
// useTheme test. The hook reads window.innerWidth (not the MQL's `matches`), so
// the viewport helper drives the result.
const listeners: Array<(e: MediaQueryListEvent) => void> = [];

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: (_event: string, listener: (e: MediaQueryListEvent) => void) => {
    listeners.push(listener);
  },
  removeEventListener: (_event: string, listener: (e: MediaQueryListEvent) => void) => {
    const i = listeners.indexOf(listener);
    if (i >= 0) listeners.splice(i, 1);
  },
  dispatchEvent: () => true,
})) as typeof window.matchMedia;

const { useIsMobile } = await import("../../src/hooks/use-mobile.ts");

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
}

beforeEach(() => {
  listeners.length = 0;
});

afterEach(cleanup);

describe("useIsMobile", () => {
  test("returns false for a desktop-width viewport (>= 768px)", () => {
    setViewport(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  test("returns true for a viewport below the 768px breakpoint", () => {
    setViewport(500);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  test("treats exactly 768px as not mobile (breakpoint is exclusive)", () => {
    setViewport(768);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  test("reacts when the viewport crosses the breakpoint", () => {
    setViewport(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    // A registered media-query listener flips the value on the next change.
    expect(listeners.length).toBeGreaterThan(0);
    act(() => {
      setViewport(420);
      for (const listener of listeners) listener({} as MediaQueryListEvent);
    });
    expect(result.current).toBe(true);
  });

  test("removes its listener on unmount", () => {
    setViewport(1024);
    const { unmount } = renderHook(() => useIsMobile());
    expect(listeners.length).toBeGreaterThan(0);
    unmount();
    expect(listeners.length).toBe(0);
  });
});
