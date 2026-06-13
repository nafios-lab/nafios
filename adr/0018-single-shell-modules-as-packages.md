# 0018. Single TanStack Start shell with modules as packages

- **Status:** Accepted
- **Date:** 2026-06-13
- **Source:** nafios-auth epic (A1)

## Context

NafiOS is a suite of apps (Finance, Budgeting, Document, Drive, SmartTodo,
Calendar, Mini Radio Station). The question is whether each app gets its own
TanStack Start deployable under `apps/`, or whether a single shell hosts all
of them as mounted modules.

ADR-0002 chose TanStack Start as the web framework. ADR-0001 established the
Bun monorepo with `apps/`, `services/`, and `packages/` directories. The auth
epic is the first product-shaped epic and needs a clear answer: how many shells
exist, and where does domain code live?

Key forces:

- **Shared session** — a single auth session must span all products. Multiple
  shells would require cross-origin session sharing or a shared auth service.
- **Deployment simplicity** — one build, one deploy target, one set of
  environment variables. Multiple shells multiply CI/CD pipelines and credit
  burn (see ADR-0017).
- **Module composition** — domain products are largely independent UI surfaces
  that share a navigation shell, user context, and design system.
- **Code ownership** — each product's code should live in its own package with
  a clear public API, not interleaved in a monolithic `apps/web/src/` tree.

## Decision

**`apps/web` is the single TanStack Start shell.** It owns the root layout,
authentication flow, navigation, and route mounting. Domain products (Finance,
Budgeting, etc.) are implemented as **packages** under `packages/` and mounted
into the shell's route tree as modules.

The shell is responsible for:

- Root layout and navigation chrome
- Authentication and session management (via `@nafios/auth-core`)
- Route group structure: `(public)/`, `(auth)/`, `(protected)/`
- Mounting domain module routes into the `(protected)/` group

Domain packages are responsible for:

- Their own UI components, pages, and business logic
- Exporting route definitions that the shell mounts
- Keeping internal implementation behind `internal/` boundaries

The exact module-mounting machinery (how a package's routes are integrated into
the shell's router) is deferred to the first domain-module epic. This ADR
establishes the architectural direction, not the wiring details.

## Consequences

- One deployment artifact for the entire web experience — simpler CI/CD, one
  Netlify site, one set of environment variables.
- Shared session is trivial — the shell owns it and passes user context down.
- Domain teams (or agents) work in isolated packages with clear boundaries,
  reducing merge conflicts in the shell.
- The shell's `package.json` depends on each mounted domain package — adding a
  new product means adding a workspace dependency and a route mount.
- A large number of mounted modules may increase the shell's bundle size. This
  is acceptable at current scale; code-splitting per route mitigates it.
- Related: ADR-0002 (TanStack Start), ADR-0006 (no-build packages), ADR-0008
  (workspace resolution), ADR-0017 (single deploy pipeline).

## Alternatives considered

- **Multiple TanStack Start apps** — each product gets its own `apps/<name>`
  deployable. Maximum isolation, but session sharing becomes a cross-origin
  problem, deploy costs multiply, and the shared navigation shell must be
  duplicated or extracted into a micro-frontend layer.
- **Monolithic `apps/web` with all code inline** — simplest to start, but
  domain code lacks ownership boundaries. As the suite grows, the single app
  becomes a merge bottleneck with no clear public API per product.
- **Micro-frontends (Module Federation / single-spa)** — maximum runtime
  isolation, but adds significant infrastructure complexity that is unjustified
  at NafiOS's current scale and team size.
