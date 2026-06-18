import { useCallback, useEffect, useRef } from "react";
import { activate, deactivate, type RenderLoader } from "../internal/screen-loader-store.ts";

export interface UseScreenLoaderOptions {
  /**
   * Loader UI for this instance, overriding the root `<ScreenLoader defaultLoader>`
   * while this instance's `show()` is active. A `renderLoader` passed directly to
   * `show()` takes precedence over this one.
   */
  renderLoader?: RenderLoader;
}

export interface ScreenLoaderControls {
  /** Show the global overlay for this instance, optionally with a one-off loader. */
  show: (renderLoader?: RenderLoader) => void;
  /** Hide the overlay for this instance. */
  hide: () => void;
}

/**
 * Imperatively control the global screen loader from anywhere in the tree.
 *
 * Requires a single `<ScreenLoader />` mounted at the app root. Each call owns one
 * ref-counted slot, so overlapping consumers don't hide each other's loader, and the
 * slot is released automatically on unmount (no overlay left stuck after navigation).
 *
 * @example
 * const { show, hide } = useScreenLoader({ renderLoader: () => <Spinner /> });
 * useEffect(() => {
 *   if (isLoading) show();
 *   else hide();
 * }, [isLoading]);
 */
export function useScreenLoader(options?: UseScreenLoaderOptions): ScreenLoaderControls {
  // One stable slot id per hook instance.
  const slotRef = useRef<symbol | null>(null);
  if (slotRef.current === null) {
    slotRef.current = Symbol("screen-loader-slot");
  }
  const slot = slotRef.current;

  // Hold the latest renderLoader so show() reads the current closure, not a stale one
  // captured when the inline `() => <div/>` was first created.
  const renderLoaderRef = useRef(options?.renderLoader);
  renderLoaderRef.current = options?.renderLoader;

  const show = useCallback(
    (renderLoader?: RenderLoader) => {
      activate(slot, renderLoader ?? renderLoaderRef.current ?? null);
    },
    [slot],
  );

  const hide = useCallback(() => {
    deactivate(slot);
  }, [slot]);

  // Release this slot if the consumer unmounts while still showing.
  useEffect(() => {
    return () => {
      deactivate(slot);
    };
  }, [slot]);

  return { show, hide };
}
