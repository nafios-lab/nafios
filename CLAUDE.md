# NafiOS — Agent Context

NafiOS is a Bun + TanStack monorepo: a suite of AI-native apps (Finance, Budgeting,
Document, Drive, SmartTodo, Calendar, Mini Radio Station) plus an AI assistant layer
that can operate any app in the suite.

## Quick Orientation

- `apps/` — deployable user-facing applications
- `services/` — headless backend services (REST, workers, AI agents)
- `packages/` — shared libraries, published as `@nafios/*`
- `specs/` — authoritative specifications; read before changing any public API
- `adr/` — architectural decisions; **grep here before deviating from a pattern**
- `tooling/` — generators and dev scripts

## Before You Code

1. Read `.claude/context/conventions.md` — naming, structure, file layout.
2. Read `.claude/context/tech-stack.md` — chosen libraries and why.
3. Check `specs/` for any spec governing the area you're touching.
4. To create a package, use the generator (`/new-package`) — never hand-scaffold.

## Hard Rules

- Import shared code via its package name (`@nafios/<name>`), never deep/relative
  paths into another package, and never from another package's `internal/`.
- All public APIs must have a spec in `specs/` before implementation.
- Run `bun run check` before declaring any work complete.
- If a package opts into a build step, never edit its `dist/` (generated output).
  See [ADR-0006](adr/0006-no-build-internal-packages.md) for the no-build convention.

## Pointers

- Canonical package example: `packages/core-utils` — model new packages on it.
- Architecture overview: `.claude/context/architecture.md`
- Glossary of domain terms: `.claude/context/glossary.md`
- Each package/service has its own `CLAUDE.md` with local context.
