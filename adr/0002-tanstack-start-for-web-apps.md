# 0002. TanStack Start for web apps

- **Status:** Accepted
- **Date:** 2026-06-08
- **Source:** nafios-foundation epic

## Context

NafiOS web apps (Finance, Budgeting, Document, etc.) need a full-stack React
framework that supports SSR, file-based routing, and type-safe data loading.

## Decision

Use **TanStack Start** as the web application framework for all apps in `apps/`.

## Consequences

- Apps get SSR, file-based routing, and type-safe loaders/actions out of the box.
- The TanStack ecosystem (Router, Query, Form, Table) composes naturally —
  one mental model across the stack.
- We bet on a newer framework; community resources are smaller than Next.js.
  Acceptable given the team's willingness to read source and the framework's
  rapid maturation.
- Bun serves as the runtime for TanStack Start's server component.

## Alternatives considered

- **Next.js** — largest ecosystem, but its App Router model and Vercel coupling
  add opinions we don't want. Server Components model is still evolving.
- **Remix / React Router v7** — solid, but TanStack Start's type-safe routing and
  tighter integration with TanStack Query gave it the edge.
- **Vite + SPA** — no SSR; unacceptable for apps that need fast first paint and SEO.
