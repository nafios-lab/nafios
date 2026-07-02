import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { RouteProgress } from "../../src/components/route-progress.tsx";
import { setRouterState } from "../setup.ts";

// Reset the shared router-state seam to idle before each test so the bar starts
// from a clean, unmounted state.
beforeEach(() => setRouterState({ status: "idle", isLoading: false, isTransitioning: false }));
afterEach(cleanup);

// The trickle fill is the only element carrying the brand token.
const findBar = (root: HTMLElement) => root.querySelector<HTMLElement>(".bg-brand");

describe("RouteProgress", () => {
  test("renders nothing while the router is idle", () => {
    const { container } = render(<RouteProgress />);
    expect(container.firstChild).toBeNull();
  });

  test("shows a partial bar once a navigation is pending", () => {
    const { container, rerender } = render(<RouteProgress />);

    setRouterState({ status: "pending" });
    rerender(<RouteProgress />);

    const bar = findBar(container);
    expect(bar).not.toBeNull();
    // Starts partway and holds below the finish line while in flight.
    const width = Number.parseFloat(bar?.style.width ?? "0");
    expect(width).toBeGreaterThan(0);
    expect(width).toBeLessThan(100);
    expect(bar?.style.opacity).toBe("1");
  });

  test("trickles forward while the navigation stays in flight", async () => {
    const { container, rerender } = render(<RouteProgress />);

    setRouterState({ status: "pending" });
    rerender(<RouteProgress />);
    const startWidth = Number.parseFloat(findBar(container)?.style.width ?? "0");

    // The 200ms trickle interval nudges the bar upward on its own — no
    // navigation change needed — but never reaches the 100% finish line.
    await waitFor(() => {
      const width = Number.parseFloat(findBar(container)?.style.width ?? "0");
      expect(width).toBeGreaterThan(startWidth);
      expect(width).toBeLessThan(100);
    });
  });

  test("also reacts to the isLoading flag without a pending status", () => {
    const { container, rerender } = render(<RouteProgress />);

    setRouterState({ status: "idle", isLoading: true });
    rerender(<RouteProgress />);

    expect(findBar(container)).not.toBeNull();
  });

  test("completes to 100% then unmounts after the navigation settles", async () => {
    const { container, rerender } = render(<RouteProgress />);

    setRouterState({ status: "pending" });
    rerender(<RouteProgress />);
    expect(findBar(container)).not.toBeNull();

    // Navigation done → snap to full width and fade, then remove from the DOM.
    setRouterState({ status: "idle", isLoading: false });
    rerender(<RouteProgress />);

    const bar = findBar(container);
    expect(bar?.style.width).toBe("100%");
    expect(bar?.style.opacity).toBe("0");

    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  test("stays hidden when the router settles without ever starting", async () => {
    const { container, rerender } = render(<RouteProgress />);

    // A stray idle→idle re-render must not flash a completed bar.
    setRouterState({ status: "idle", isLoading: false });
    rerender(<RouteProgress />);

    expect(container.firstChild).toBeNull();
    // Give the reset timer a tick — nothing should appear.
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  test("keeps the bar decorative — outside the accessibility tree", () => {
    const { container, rerender } = render(<RouteProgress />);

    setRouterState({ status: "pending" });
    rerender(<RouteProgress />);

    expect(container.querySelector("[aria-hidden='true']")).not.toBeNull();
  });
});
