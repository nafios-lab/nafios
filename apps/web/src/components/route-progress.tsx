import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

/**
 * Top-line navigation progress bar (NProgress-style).
 *
 * Driven directly by TanStack Router's navigation state rather than a fake
 * timer: the bar appears the moment the router enters a pending/loading state
 * (route loaders resolving, code-split chunks fetching during an SSR-backed
 * navigation) and completes when the router settles. While in flight it
 * "trickles" toward 90% so long navigations still feel like progress; on
 * completion it snaps to 100% and fades out.
 *
 * Mount once at the app root. Renders nothing (returns `null`) when idle, so
 * it is SSR-safe and adds no DOM until the first navigation.
 */
export function RouteProgress() {
  const isNavigating = useRouterState({
    select: (s) => s.status === "pending" || s.isLoading,
  });

  // 0 means fully idle → nothing rendered. 1..100 is the visible width.
  const [progress, setProgress] = useState(0);
  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const stopTrickle = () => {
      if (trickleRef.current) {
        clearInterval(trickleRef.current);
        trickleRef.current = null;
      }
    };

    if (isNavigating) {
      if (resetRef.current) {
        clearTimeout(resetRef.current);
        resetRef.current = null;
      }
      setProgress((p) => (p > 0 && p < 100 ? p : 10));
      trickleRef.current = setInterval(() => {
        // Ease toward 90% and stop — the real completion pushes us to 100%.
        setProgress((p) => (p >= 90 ? p : p + Math.max(0.5, (90 - p) * 0.08)));
      }, 200);
    } else {
      stopTrickle();
      // Only "complete" if a navigation had actually started.
      setProgress((p) => (p > 0 ? 100 : 0));
      resetRef.current = setTimeout(() => setProgress(0), 300);
    }

    return stopTrickle;
  }, [isNavigating]);

  if (progress === 0) return null;

  const done = progress >= 100;

  return (
    // Decorative activity indicator; the router's own pending UI carries the
    // semantics, so keep this out of the accessibility tree.
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-200 h-0.5">
      <div
        // While trickling: a *linear* glide whose duration outruns the 200ms
        // trickle tick, so the fill is always mid-transition toward a moving
        // target — continuous motion instead of the ease-out stall-and-lurch at
        // each tick boundary. On completion: a quick ease-out fill + fade.
        className={`h-full bg-brand shadow-[0_0_8px] shadow-brand/60 motion-reduce:transition-none ${
          done
            ? "transition-[width,opacity] duration-200 ease-out"
            : "transition-[width] duration-300 ease-linear"
        }`}
        style={{ width: `${progress}%`, opacity: done ? 0 : 1 }}
      />
    </div>
  );
}
