# 0010. Per-package typecheck (`tsc --noEmit` via `--filter`), not project refs

- **Status:** Accepted
- **Date:** 2026-06-08
- **Source:** A3

## Context

TypeScript type-checking in a monorepo can be done two ways: a single root
`tsc` with project references linking packages, or independent per-package
`tsc --noEmit` invocations.

## Decision

Run **`tsc --noEmit` independently in each package** via `bun --filter '*' typecheck`.
Do not use TypeScript project references.

## Consequences

- Each package owns its own `tsconfig.json` with no cross-references — simple to
  reason about and no build graph to maintain.
- `bun run check` runs `typecheck` (then `test`, `lint`, `format:check`) in
  fail-fast order (`&&`). First failing category stops the pipeline.
- No incremental cross-package type cache; each package checks from scratch.
  Acceptable at current scale; if typecheck times grow, project references can
  be reconsidered.
- Adding a new package only requires a local `tsconfig.json` — no updates to a
  root project-references list.

## Alternatives considered

- **TypeScript project references** — enables incremental cross-package builds,
  but adds `references` arrays in every `tsconfig.json`, a root `tsconfig.json`
  build orchestrator, and coupling between package configs. Premature complexity.
- **Single root `tsc`** — simpler invocation but blurs package boundaries; errors
  from unrelated packages appear together, and the single config file becomes
  unwieldy.
