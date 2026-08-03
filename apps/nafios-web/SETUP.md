# nafios-web — SPA Setup Guide

A hand-follow guide to scaffold `apps/nafios-web`: a pure **Vite + React 19 SPA**
that replaces the TanStack **Start** app in `apps/web`. No SSR, no server
functions — auth and all data run client-side via the Supabase browser client,
with **RLS as the security boundary** (see [ADR-0026](../../adr/0026-domain-modules-fetch-data-client-side.md)).

The scaffold needs **zero package changes** — every `@nafios/*` package,
tooling, and Tailwind config is reused as-is.

## Ground rules

- **Package name is `@nafios/nafios-web`** (not `@nafios/web`). Both apps coexist
  during the migration, and Bun workspaces reject two packages sharing a name.
- **`useTheme` toggles `.dark` on `<html>` itself** — the root component just
  calls `useTheme()`; there is no `<html className>` to render in a SPA.
- Follow the phases in order. **By the end of Phase 6 you have a running,
  themed SPA.** Auth (Phase 7) and feature ports (Phase 8) come after.

---

## Phase 0 — Prereqs
- [ ] `nvm use 22` — Vite 8 needs Node 22.
- [ ] Work from repo root: `/Users/3001663/workspace/SWE/nafiOS/nafios`.

## Phase 1 — `apps/nafios-web/package.json`

This is `apps/web`'s dep set **minus** Start / Nitro / Netlify / ssr-query,
**plus** `@tanstack/router-plugin` (Start used to generate the route tree; now
the plugin does).

```json
{
  "name": "@nafios/nafios-web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "@nafios/auth-core": "workspace:*",
    "@nafios/database": "workspace:*",
    "@nafios/finance": "workspace:*",
    "@nafios/storage": "workspace:*",
    "@nafios/ui": "workspace:*",
    "@tanstack/react-form": "^1.33.0",
    "@tanstack/react-query": "^5.101.4",
    "@tanstack/react-router": "^1.170.15",
    "date-fns": "^4.4.0",
    "lucide-react": "^1.18.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@fontsource-variable/inter": "^5.2.8",
    "@fontsource-variable/jetbrains-mono": "^5.2.8",
    "@fontsource-variable/outfit": "^5.2.8",
    "@happy-dom/global-registrator": "15.11.7",
    "@tailwindcss/vite": "^4.2.2",
    "@tanstack/react-devtools": "^0.10.5",
    "@tanstack/react-form-devtools": "^0.2.29",
    "@tanstack/react-query-devtools": "^5.101.4",
    "@tanstack/router-plugin": "^1.170.15",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1",
    "@types/react": "^19.0.8",
    "@types/react-dom": "^19.0.3",
    "@vitejs/plugin-react": "^6.0.1",
    "happy-dom": "15.11.7",
    "tailwindcss": "^4.2.2",
    "typescript": "^6.0.2",
    "vite": "^8.0.14"
  }
}
```

> The 3 `@fontsource-*` deps are required even though you never import them
> directly — `@nafios/ui`'s `globals.css` `@import`s them.
>
> If `@tanstack/router-plugin@^1.170.15` 404s, run
> `bun add -D @tanstack/router-plugin@latest` in the app dir after Phase 2.

## Phase 2 — Install
- [ ] From repo root: `bun install`

## Phase 3 — Copy these **verbatim** from `apps/web`

No changes needed:

- [ ] `tsconfig.json` — from `apps/web/tsconfig.json`
- [ ] `bunfig.toml` — from `apps/web/bunfig.toml` (keeps the 90% coverage gate +
      route-layer ignores)
- [ ] `src/styles.css` — the one-liner `@import "@nafios/ui/globals.css";`
- [ ] `src/components/error-boundaries.tsx` and `src/components/route-progress.tsx`
      (pure UI, referenced by the router/root — no server-fn coupling)
- [ ] `.gitignore` — then strip the Netlify / `.output` / `.tanstack` lines that
      no longer apply; keep `node_modules`, `dist`.

## Phase 4 — SPA config & entry (the parts that differ from `web`)

### `apps/nafios-web/index.html` (new)

Start generated the HTML; a SPA needs a real entry file. The `<body>` classes
move here from `web`'s old `__root`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>NafiOS</title>
  </head>
  <body class="min-h-screen bg-background text-foreground font-body antialiased">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### `apps/nafios-web/vite.config.ts`

router-plugin + react + tailwind. **Keep the `define:` env inlining** — this is
what lets `createBrowserClient()` read `process.env.*` in the browser with zero
package change. Dropped: `tanstackStart`, `nitro`, `netlify`, and the `tslib`
alias (a Nitro-SSR workaround, irrelevant in a SPA).

```ts
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const monorepoRoot = path.resolve(import.meta.dirname, "../..");

// Load root .env into process.env at build time so `define` can inline the
// public anon creds. There is no server runtime in this app.
Object.assign(process.env, loadEnv("development", monorepoRoot, ""));

export default defineConfig({
  envDir: monorepoRoot,
  // Inline ONLY the public anon URL + key. NEVER SERVICE_ROLE_KEY / DATABASE_URL.
  define: {
    "process.env.SUPABASE_URL": JSON.stringify(process.env.SUPABASE_URL),
    "process.env.SUPABASE_ANON_KEY": JSON.stringify(process.env.SUPABASE_ANON_KEY),
  },
  resolve: { alias: { "~": path.resolve(import.meta.dirname, "src") } },
  server: { port: 3000 },
  plugins: [
    tailwindcss(),
    // Generates src/routeTree.gen.ts from src/routes/**. MUST precede viteReact().
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    viteReact(),
  ],
});
```

### `apps/nafios-web/src/main.tsx` (new — the client mount)

```tsx
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { getRouter } from "./router";

const router = getRouter();
const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

createRoot(rootEl).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
```

### `apps/nafios-web/src/router.tsx`

Same as `web`'s but `setupRouterSsrQueryIntegration` → a plain `Wrap` that
provides the Query context (loaders still read `context.queryClient`):

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { GlobalErrorBoundary, GlobalNotFound } from "./components/error-boundaries";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    scrollRestoration: true,
    defaultErrorComponent: GlobalErrorBoundary,
    defaultNotFoundComponent: GlobalNotFound,
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
```

## Phase 5 — Minimal route tree to boot

### `apps/nafios-web/src/routes/__root.tsx`

SPA root: **no** `<html>/<head>/<body>/<Scripts>/<HeadContent>` (those were
Start SSR). Just the visual chrome:

```tsx
import { ScreenLoader } from "@nafios/ui/components/screen-loader";
import { ThemeToggle } from "@nafios/ui/components/theme-toggle";
import { useTheme } from "@nafios/ui/hooks/use-theme";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { formDevtoolsPlugin } from "@tanstack/react-form-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { RouteProgress } from "../components/route-progress";
import "../styles.css";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootDocument,
});

function RootDocument() {
  useTheme(); // applies `.dark` to the real <html> from index.html
  return (
    <>
      <RouteProgress />
      <Outlet />
      <ScreenLoader />
      <ThemeToggle className={import.meta.env.DEV ? "bottom-24" : undefined} />
      {import.meta.env.DEV && (
        <TanStackDevtools
          config={{ hideUntilHover: true }}
          plugins={[
            formDevtoolsPlugin(),
            { name: "TanStack Query", render: <ReactQueryDevtoolsPanel /> },
          ]}
        />
      )}
    </>
  );
}
```

### `apps/nafios-web/src/routes/index.tsx` (smoke-test route)

```tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => <div className="p-8 text-2xl">nafios-web SPA is alive ✅</div>,
});
```

> `src/routeTree.gen.ts` is created automatically by the router plugin the first
> time you run dev — don't hand-write it.

## Phase 6 — Run & verify the skeleton
- [ ] `cd apps/nafios-web && bun run dev`
- [ ] Open http://localhost:3000 → see the "alive ✅" text, correct fonts /
      background, and the theme toggle flipping light/dark.
- [ ] `bun run typecheck` passes.

> **✅ Checkpoint:** a working, themed, host-agnostic SPA with the design system
> wired in — and no server runtime.

---

## Phase 7 — Auth foundation (next milestone)

The only real *logic* to build (everything else is porting UI). Key moves:

- [ ] `src/lib/auth.ts` — get the browser client from `createBrowserClient()`
      (`@nafios/auth-core`) and expose session state. **Simplest
      zero-package-change path:** a `['session']` TanStack Query calling
      `getSession(client)`, invalidated after sign-in/out.
      - Reactive `onAuthStateChange` isn't exported by `auth-core` today. If you
        later want live multi-tab session sync, that's a small passthrough to
        add to the package — not now.
- [ ] `src/routes/_protected.tsx` — same `beforeLoad` guard shape, but read the
      session via `context.queryClient.ensureQueryData(...)` →
      `redirect({ to: "/auth/login" })` if null. No server fn.
- [ ] `src/routes/auth/login.tsx` + `signup.tsx` — call `signInWithPassword` /
      `signUp` **directly** on the browser client, then invalidate `['session']`
      and navigate. The signup resume-path logic from
      `apps/web/src/lib/auth-fns.ts` ports straight across.
- [ ] ⚠️ **Do NOT copy `apps/web/tests/setup.ts` verbatim** — it's built entirely
      around `createServerFn` + `@tanstack/react-start/server` cookie seams that
      don't exist here. Start a fresh minimal `tests/setup.ts`
      (`GlobalRegistrator.register()` + mock `@nafios/auth-core`'s browser
      client/ops) and grow it. Remember the `asDb` mock requirement when you
      import `@nafios/finance`.

## Phase 8 — Port features

- [ ] Do **Finance first** — it's already client-side (ADR-0026), so it proves
      the module pattern end-to-end with the least friction.
- [ ] Then port the rest of the route tree, swapping each server-fn call for its
      browser-client equivalent. Keep the 90% coverage gate green as you go
      (`bun test --coverage` from the app dir).

---

## Trade-off to accept consciously

Losing SSR means route guards run **after** the JS bundle loads, not before. An
unauthenticated user hitting `/finance` gets a brief shell flash before the
client guard redirects. **This is not a security regression** — RLS is the
boundary, protected data never loads, and shipping app JS to everyone is fine
for an authed app with no SEO needs. It's purely first-paint UX, and it's the
standard Supabase-SPA posture.

## Cutover (later, at parity)

Once `nafios-web` reaches feature parity: delete `apps/web`, then repoint the
root `package.json` scripts (`web:dev` / `web:build` / `web:deploy:staging`,
which all target `@nafios/web`). Deployment host is still in planning — the build
is a portable static `dist/`; the only host requirement is a SPA rewrite
(`/* → /index.html`).
