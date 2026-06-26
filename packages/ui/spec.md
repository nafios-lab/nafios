---
title: "@nafios/ui"
status: active
version: 1.1.0
updated: 2026-06-18
owner: Hanafi
related_adrs: [0006]
---

# @nafios/ui Specification

## Purpose

Shared UI package for NafiOS: houses Tailwind v4 configuration, shadcn/ui
components, NafiOS brand theming, and composites built from primitives.

## Public API

### Stylesheet

- `@nafios/ui/globals.css` — Tailwind v4 base + NafiOS theme CSS variables.
  Must be imported once in the app root.

### Utilities

- `cn(...inputs: ClassValue[]): string` — Tailwind class merge (clsx + twMerge).

### Hooks

- `useTheme(): { theme, setTheme, resolvedTheme }` — Toggle light/dark/system.
  Persists choice via cookie. SSR-safe.
- `useScreenLoader(opts?: { renderLoader?: () => ReactNode }): { show, hide }` —
  Imperatively drive the global `<ScreenLoader>` overlay. `show(renderLoader?)`
  raises the overlay; `hide()` lowers it. Each call owns one ref-counted slot:
  the overlay is visible while **any** slot is active, so overlapping consumers
  never hide each other's loader, and the slot is auto-released on unmount.
  Loader precedence: `show(fn)` arg → hook's `renderLoader` → root `defaultLoader`.

### Components (shadcn primitives)

Re-exported from `@nafios/ui/components/ui/*`:
`Button`, `Input`, `Label`, `Dialog` (+ sub-parts), `DropdownMenu` (+ sub-parts), `Separator`.

### Components (NafiOS composites)

Re-exported from `@nafios/ui/components/*`:
`ConfirmDialog` — confirmation modal composed from Dialog + Button.
`UserMenu` — account dropdown anchored to the user's avatar, composed from
DropdownMenu + Avatar. Takes a presentation-focused `user`
(`{ name?, email?, avatarUrl? }`) and optional `onProfile` / `onSettings` /
`onLogout` callbacks; each action is a no-op when its callback is omitted. The
avatar falls back to derived initials, then a generic icon, when no image is
supplied.
`ScreenLoader` — global full-screen loading overlay. Portals to `document.body`
(renders above all app content regardless of JSX location), SSR-safe (renders
nothing on the server / before client mount), locks body scroll while visible,
and exposes `role="status"` / `aria-live` / `aria-busy`. Accepts an optional
`defaultLoader` for the app-wide loader UI. **Mount exactly once** at the app
root — driven via `useScreenLoader`. A second mount would render a second overlay.

## Invariants

1. No build step — consumed as TypeScript/TSX source.
2. shadcn primitives are not forked; extend via composition only.
3. Tailwind v4 CSS-first: no `tailwind.config.ts`.
4. Theme tokens use shadcn's variable names; only values change.
5. Components are added on demand, not pre-stocked.

## Deferred

- Visual regression testing (deferred, no false greens).
- Per-app theme settings UI (owned by each app).
- Third "brand" theme variant (only if a real need appears).
