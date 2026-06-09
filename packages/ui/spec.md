---
title: "@nafios/ui"
status: active
version: 1.0.0
updated: 2026-06-09
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

### Components (shadcn primitives)

Re-exported from `@nafios/ui/components/ui/*`:
`Button`, `Input`, `Label`, `Dialog` (+ sub-parts), `DropdownMenu` (+ sub-parts), `Separator`.

### Components (NafiOS composites)

Re-exported from `@nafios/ui/components/*`:
`ConfirmDialog` — confirmation modal composed from Dialog + Button.

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
