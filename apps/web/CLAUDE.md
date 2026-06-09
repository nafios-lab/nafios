# @nafios/web

The NafiOS web platform application. Currently minimal — serves as the staging
deployment target (S3) and will grow into the main user-facing app.

## What this app does

TanStack Start SSR app. Currently renders a staging marker page showing
`NafiOS Staging — build <SHA>` and a `/health` route.

## Stack

- TanStack Start (Vite + Nitro SSR)
- `@netlify/vite-plugin-tanstack-start` for Netlify deployment
- Own Tailwind CSS (best-effort `@nafios/ui` integration deferred — Vite bundler
  can't resolve workspace CSS exports yet)

## Scripts

```sh
bun run dev       # local dev server on :3000
bun run build     # production build → .output/
bun run preview   # preview production build locally
bun run typecheck # tsc --noEmit
```

## Build output

After `bun run build`:
- Client assets: `.output/public/` (served as static files)
- Server bundle: `.output/server/index.mjs` (Node SSR server)
- Netlify SSR function: `.netlify/v1/functions/server.mjs` (auto-emitted by plugin)
- Netlify publish dir for S2: `.output/public`

## Root context

See [root CLAUDE.md](../../CLAUDE.md) for monorepo-wide conventions.
