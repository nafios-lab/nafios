# @nafios/nafios-web

The NafiOS shell as a pure **Vite + React 19 SPA**. Replaces the TanStack
**Start** app in `apps/web`: no SSR, no server functions — auth and all data run
client-side via the Supabase browser client, with **RLS as the security
boundary** (ADR-0026). Both apps coexist during the migration; this one is the
target. Scaffold guide: [SETUP.md](./SETUP.md).

> Package name is `@nafios/nafios-web` (not `@nafios/web`) — Bun workspaces reject
> two packages sharing a name.

## What this app does

Session-gated shell. A public auth flow (`/auth/*`) and a protected area
(`/_protected/*`) behind a client-side session gate. There is no SSR: route
guards run **after** the JS bundle loads, so an unauthenticated user may see a
brief shell flash before the redirect. This is not a security regression — RLS
is the boundary and protected data never loads (ADR-0026); it is first-paint UX,
the standard Supabase-SPA posture.

## Stack

- **Vite 8 + `@vitejs/plugin-react`** — no Nitro, no Netlify plugin. **Node 22
  required** (Vite 8; `nvm use 22`).
- **TanStack Router** (`@tanstack/router-plugin/vite`) — file-based routing in
  `src/routes/`; the plugin generates `src/routeTree.gen.ts` on dev/build (never
  edit it, never hand-write it). The router is created in `src/router.tsx`.
- **TanStack Query** — the shell's single client-side cache (ADR-0026). One
  `QueryClient` is created in `router.tsx`, wired to the router context, and
  provided via the router's `Wrap`. There is no SSR/hydration integration.
- **Tailwind v4** via `@tailwindcss/vite`; design system from `@nafios/ui`.
- **No direct `@supabase/*` imports** — auth and data go through `@nafios/*`
  packages (`@nafios/auth-core`, `@nafios/database`, …).

### Env inlining (no server runtime)

`vite.config.ts` loads the root `.env` and `define`s **only** the public anon
creds (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) so `createBrowserClient()` can read
`process.env.*` in the browser. **Never** inline `SERVICE_ROLE_KEY` /
`DATABASE_URL`.

## Auth foundation (`src/lib/auth.ts` + `features/auth/`)

Auth is the only real *logic* in the shell (everything else is ported UI):

- **`src/lib/auth.ts`** — the lazy browser-client singleton (`getAuthClient()`),
  the `['session']` query (`sessionQueryOptions` → `getSession(client)`, normalized
  to `AuthSession | null`), and `invalidateSession(queryClient)`. Route guards
  read the session via `context.queryClient.ensureQueryData(sessionQueryOptions)`.
- **`features/auth/`** — login / signup / sign-out UI, hooks, and schemas. The
  hooks call `signInWithPassword` / `signUp` / `signOut` **directly** on the
  browser client (no server fn), then `invalidateSession` so guards observe the
  new state on the next navigation. `use-account-signup` ports the signup
  resume-path logic (`getUser` first) from `apps/web`'s old `auth-fns.ts`.

Reactive `onAuthStateChange` is intentionally not used — `auth-core` doesn't
export it today. Multi-tab live session sync would be a small passthrough to add
to that package later.

## Route structure

| Group     | File                                | URL           | Guard                                                    |
| --------- | ----------------------------------- | ------------- | ------------------------------------------------------- |
| Root      | `routes/index.tsx`                  | `/`           | Redirects: session → `/home`, else → `/auth/login`      |
| Auth      | `routes/auth/route.tsx` + children  | `/auth/*`     | Redirects to `/` if already signed in                   |
| Protected | `routes/_protected.tsx` (pathless)  | children only | Redirects to `/auth/login` (with `redirect`) if no session |

`/_protected/home` is a **Phase 7 placeholder** that proves the session gate and
sign-out loop end-to-end. The real shell (navbar, onboarding-completion gate,
mounted domain modules) is Phase 8 — it replaces `home` and layers the
onboarding gate below `_protected`.

## Source structure

```
src/
  routes/            file-based routing — TanStack Router owns this tree
  features/          frontend feature slices (components, hooks, schemas)
  shared/components/ shell-wide shared UI (error boundaries, error screen, route progress)
  lib/               client-side app infrastructure (auth.ts: browser client + session query)
  main.tsx           client mount (createRoot + RouterProvider)
  router.tsx         Router + QueryClient wiring
  styles.css         @import "@nafios/ui/globals.css"
  routeTree.gen.ts   generated — never edit
```

- **`routes/` is routing only.** Route files are thin — they compose from
  `features/` and `shared/`; no business logic, form handling, or data-fetching.
- **`features/<name>/` is frontend only** (components, hooks, schemas). Not
  shared across features — lift shared UI to `shared/components/` or a `@nafios/*`
  package. Unlike `apps/web`, there are **no server functions** here.
- **`lib/` is client infrastructure** — no server/cookie code (there is no server
  runtime). Never put React components/hooks here.
- **`~` aliases `src/`.** Import shared code via `@nafios/<name>`, never deep paths.
- **kebab-case filenames**, enforced by Biome.

## Testing

- `bunfig.toml` preloads `tests/setup.ts` and enforces a **90% per-file coverage
  gate** (under `--coverage` only; `routes/`, `router.tsx`, the generated tree,
  stories, barrels, and tests are excluded — see ADR-0020).
- `tests/setup.ts` registers happy-dom and mocks `@nafios/auth-core`'s **browser**
  client + ops as shared spies (this is a fresh SPA harness — it deliberately
  does **not** copy `apps/web`'s `createServerFn`/cookie-seam setup). Hooks that
  invalidate `['session']` need a `QueryClient` — use `tests/query-wrapper.tsx`.
- `tests/types.d.ts` references `@types/bun` so `bun:test` resolves under `tsc`
  (this SPA dropped the Netlify/Nitro deps that pulled it in transitively).

```sh
bun run dev            # Vite dev server on :3000 (needs Node 22)
bun run build          # static SPA build → dist/
bun run typecheck      # tsc --noEmit
bun test               # run tests
bun run test:coverage  # tests + 90% gate
```

## Cutover (later, at parity)

Once `nafios-web` reaches feature parity: delete `apps/web`. The root scripts
(`web:dev` / `web:build` / `web:deploy:staging`) already target this package. The
build is a portable static `dist/`; the only host requirement is a SPA rewrite
(`/* → /index.html`). Deployment host is still in planning.

## Root context

See [root CLAUDE.md](../../CLAUDE.md) for monorepo-wide conventions.
