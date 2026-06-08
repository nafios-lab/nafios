# Conventions

The rules every package, service, and app follows. Predictability is the point —
learn the pattern once and stop deciding. These rules are enforced automatically
by Biome (lint/format) and the convention guards; this file is the readable source.
→ Enforcement: see [ADR-0005](../../adr/0005-biome-over-eslint-prettier.md) (Biome)
and the [structural guards](../../tooling/scripts/verify-workspace.ts) (C2).

## Package naming

`@nafios/<domain>-<kind>` — e.g. `@nafios/auth-core`, `@nafios/auth-react`,
`@nafios/ui-*`, `@nafios/ai-core`. Scope is always `@nafios/`.

## Directory / file naming

- Directories, apps, services: **kebab-case** (`services/api-gateway`).
- Source files: **kebab-case**; domain modules use `<domain>.<role>.ts`
  (`users.service.ts`, `users.repository.ts`). One glob finds the role.
- Biome enforces kebab-case filenames at error level — builds break on violation.

## Package anatomy

Barrel `src/index.ts` (exports only) · `src/internal/` (never imported across
packages) · `tests/` · `docs/` · co-located `spec.md` · package `CLAUDE.md`.
→ Canonical example to copy: **[`packages/core-utils`](../../packages/core-utils/)**
(`@nafios/core-utils`).

## The `internal/` boundary

Code under `src/internal/` is private to its package. Cross-package imports of
another package's `internal/` are forbidden — Biome blocks `@nafios/*/internal/*`
at lint time and the guard validates it structurally.

## Import rules

Import shared code via its package name (`@nafios/<name>`), never deep/relative
paths into another package. Module resolution uses Bun workspace resolution,
not `tsconfig` path aliases.
→ [ADR-0008](../../adr/0008-workspace-resolution-over-path-aliases.md).

## Spec location

Package specs are **co-located**: `packages/<x>/spec.md`. `specs/` holds only
**cross-cutting** specs (shared APIs, events, domain models).
→ Decision: [ADR-0011](../../adr/0011-co-locate-package-specs.md).

## Required files per workspace

Every package in `apps/`, `packages/`, `services/`, `tooling/` must have:
- `CLAUDE.md` — local agent context.
  → [ADR-0009](../../adr/0009-claude-md-canonical-agent-context.md).
- `typecheck` and `test` scripts in `package.json` — required for `bun run check`.
- `spec.md` — required for `packages/` and `services/` (apps exempt).

## Anti-examples (don't do this)

- Don't put business logic in routes — routes call services.
- Don't import from another package's `internal/`.
- Don't PascalCase source files (`UserService.ts`) — harder to grep.
- Don't restate a rule that lives in an ADR — link it.
- Don't use `tsconfig` path aliases — use workspace resolution.
- Don't hand-scaffold packages — use the generator (`/new-package`).

→ Terms: [glossary.md](glossary.md) · Stack: [tech-stack.md](tech-stack.md) · System shape: [architecture.md](architecture.md)
