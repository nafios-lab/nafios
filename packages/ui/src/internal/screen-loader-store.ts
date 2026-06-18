import type { ReactNode } from "react";

/**
 * Package-private store backing {@link ScreenLoader} and {@link useScreenLoader}.
 *
 * Mirrors the `sonner` pattern: a module-level state source + imperative API + a
 * single root component, with no React Provider. The hook and the root component
 * communicate exclusively through this store.
 *
 * Visibility is slot-based (ref-counted): every `useScreenLoader` instance owns one
 * slot, and the overlay is shown while *any* slot is active. The loader UI rendered
 * is the override registered by the most recent `activate(slot, loader)` call, or
 * the root `defaultLoader` when no override is set.
 */

export type RenderLoader = () => ReactNode;

export interface ScreenLoaderSnapshot {
  /** True while at least one slot is active. */
  readonly visible: boolean;
  /** Override loader from the most recent activation, or null to use the root default. */
  readonly loader: RenderLoader | null;
}

const listeners = new Set<() => void>();
const activeSlots = new Set<symbol>();

/**
 * Stack of slots that registered an override loader, newest last. We keep the whole
 * stack (not just the latest) so that when the newest override's slot deactivates,
 * the loader falls back to the previous override rather than vanishing while another
 * slot is still active.
 */
const overrideStack: Array<{ slot: symbol; loader: RenderLoader }> = [];

// `useSyncExternalStore` compares snapshots by reference, so we cache the current
// snapshot and only rebuild it when state actually changes.
let snapshot: ScreenLoaderSnapshot = { visible: false, loader: null };

const SERVER_SNAPSHOT: ScreenLoaderSnapshot = { visible: false, loader: null };

function rebuildSnapshot(): void {
  const top = overrideStack.at(-1) ?? null;
  snapshot = {
    visible: activeSlots.size > 0,
    loader: top?.loader ?? null,
  };
}

function emit(): void {
  rebuildSnapshot();
  for (const listener of listeners) {
    listener();
  }
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): ScreenLoaderSnapshot {
  return snapshot;
}

export function getServerSnapshot(): ScreenLoaderSnapshot {
  return SERVER_SNAPSHOT;
}

/** Activate a slot, optionally registering an override loader for it. */
export function activate(slot: symbol, loader?: RenderLoader | null): void {
  activeSlots.add(slot);

  // A slot owns at most one override entry; drop any prior one before re-pushing so
  // repeated show() calls keep the slot at the top of the stack without duplicating.
  removeOverride(slot);
  if (loader) {
    overrideStack.push({ slot, loader });
  }

  emit();
}

/** Deactivate a slot and clear any override it registered. */
export function deactivate(slot: symbol): void {
  activeSlots.delete(slot);
  removeOverride(slot);
  emit();
}

function removeOverride(slot: symbol): void {
  const index = overrideStack.findIndex((entry) => entry.slot === slot);
  if (index !== -1) {
    overrideStack.splice(index, 1);
  }
}
