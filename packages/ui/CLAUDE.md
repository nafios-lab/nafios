# @nafios/ui

Shared UI package: shadcn/ui + Tailwind v4. Apps consume components from here.

## What this package does

Provides the design system for NafiOS: themed shadcn components, Tailwind
globals, the `cn` utility, and a theme toggle hook. Apps import components
and the stylesheet — they never re-initialise Tailwind or shadcn.

## Public API surface

- `@nafios/ui/globals.css` — Tailwind + NafiOS theme variables (import in app root)
- `@nafios/ui/components/ui/*` — shadcn primitives (`Button`, `Input`, `Label`, `Dialog`, …)
- `@nafios/ui/components/*` — NafiOS composites (`ConfirmDialog`, `UserMenu`, `ScreenLoader`, `ProductSwitcher`, …)
- `@nafios/ui/lib/utils` — `cn()` class merge helper
- `@nafios/ui/hooks/use-theme` — `useTheme()` for light/dark switching

## Component convention — use-as-is vs. wrap

- **Use as-is:** import shadcn primitives directly (`Button`, `Input`, …).
  Don't re-wrap a primitive just to rename it.
- **Wrap (compose):** when NafiOS needs specific behavior, build a composite
  from primitives — e.g. `<ConfirmDialog>` made from `Dialog` + `Button`.
  Composites live in `src/components/` (not `src/components/ui/`).
- **Never** edit a primitive's internals to change shared behavior — extend
  by composition or props so a future `shadcn add` re-pull doesn't clobber
  custom logic.
- All styling uses Tailwind utilities + the theme variables — no hardcoded
  colors.

## Adding a new shadcn component

1. Try the CLI first: `bunx shadcn@latest add <name>` from the workspace root.
   If the CLI chokes on monorepo resolution, copy the component source from
   shadcn's GitHub into `src/components/ui/<name>.tsx`.
2. Use `cn()` from `../../lib/utils.ts` and `cva` for variants.
3. Add a story in the Storybook (`tooling/storybook`).

## Theming

Tailwind v4 CSS-first — no `tailwind.config.ts`. All tokens live in
`src/styles/globals.css` as CSS variables (`:root` = light, `.dark` = dark).
The `useTheme()` hook toggles `.dark` on `<html>` and persists the choice
in a cookie so SSR can read it.

## Invariants

1. No build step — consumed as TSX source via Bun workspace resolution.
2. `src/components/ui/` = shadcn primitives (owned by shadcn, not forked).
3. `src/components/` = NafiOS composites (composed from primitives).
4. Components added on demand, not the whole shadcn library upfront.

## Scripts

```sh
bun test          # run unit tests
bun run typecheck # tsc --noEmit
```

## Structure

```
src/
  index.ts                    # barrel — public re-exports
  styles/globals.css          # Tailwind + NafiOS theme tokens
  lib/utils.ts                # cn() helper
  hooks/use-theme.ts          # light/dark toggle hook
  components/ui/              # shadcn primitives (button, input, …)
  components/                 # NafiOS composites (confirm-dialog, …)
  internal/                   # package-private helpers
tests/unit/                   # bun:test unit tests
docs/                         # human-facing docs
spec.md                       # package specification
```

## Root context

See [root CLAUDE.md](../../CLAUDE.md) for monorepo-wide conventions.
