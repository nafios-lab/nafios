import { Loader2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  getServerSnapshot,
  getSnapshot,
  type RenderLoader,
  subscribe,
} from "../internal/screen-loader-store.ts";
import { cn } from "../lib/utils.ts";

export interface ScreenLoaderProps {
  /**
   * Default loader UI shown when no consumer supplies its own via
   * `useScreenLoader({ renderLoader })` or `show(renderLoader)`. Falls back to a
   * spinner when omitted.
   */
  defaultLoader?: RenderLoader;
  /** Extra classes for the backdrop. */
  className?: string;
}

function DefaultSpinner() {
  return <Loader2 className="size-8 animate-spin text-foreground" aria-hidden="true" />;
}

/**
 * Global, portal-rendered loading overlay. Mount exactly once at the app root; drive
 * it imperatively from anywhere with {@link useScreenLoader}.
 *
 * Rendering goes through a portal to `document.body`, so the JSX location of this
 * component is cosmetic — it always sits above app content. SSR-safe: renders nothing
 * on the server and until the client has mounted, so `createPortal` never touches an
 * undefined `document`.
 */
export function ScreenLoader({ defaultLoader, className }: ScreenLoaderProps) {
  const { visible, loader } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll while the overlay is up; restore on hide/unmount.
  useEffect(() => {
    if (!visible) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [visible]);

  if (!mounted || !visible) return null;

  const render = loader ?? defaultLoader;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "fixed inset-0 z-100 flex items-center justify-center bg-background/80 backdrop-blur-sm",
        className,
      )}
    >
      {render ? render() : <DefaultSpinner />}
    </div>,
    document.body,
  );
}
