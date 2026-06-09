# @nafios/storybook

Storybook preview for `@nafios/ui` components.

## What this does

Provides a browsable, theme-switchable component preview using Storybook 8
(`@storybook/react-vite`). Imports `@nafios/ui/globals.css` so components
render with NafiOS brand theming. A toolbar toggle switches light/dark.

## Scripts

```sh
bun run preview   # launch Storybook at localhost:6006
bun run build     # production build (used in CI)
bun run typecheck # tsc --noEmit
```

## Adding stories

Stories live co-located with components in `packages/ui/src/`.
Convention: one `*.stories.tsx` per component, showing main variants.

## Root context

See [root CLAUDE.md](../../CLAUDE.md) for monorepo-wide conventions.
