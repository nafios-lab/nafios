# 0008. Workspace resolution over `tsconfig` path aliases

- **Status:** Accepted
- **Date:** 2026-06-08
- **Source:** A1

## Context

Packages import shared code as `@nafios/<name>`. There are two ways to make this
work: `tsconfig` `paths` aliases, or Bun workspace resolution via the `exports`
field in each package's `package.json`.

## Decision

Use **Bun workspace resolution** (package `exports` field) instead of `tsconfig`
`paths` aliases.

## Consequences

- Resolution works identically at runtime and type-check time — no divergence
  between what `tsc` sees and what Bun executes.
- Adding a new package requires only `package.json` `exports`; no need to update
  a shared `tsconfig.base.json` paths map.
- Agents don't need to keep `tsconfig` paths in sync with workspace layout —
  one fewer coordination point.
- IDE "go to definition" works via the `exports` field; no extra TS config needed.

## Alternatives considered

- **`tsconfig` `paths` aliases** — common pattern, but creates a second source
  of truth for module resolution. Every new package or renamed export requires
  updating both `package.json` and `tsconfig`. Drift between the two causes
  confusing "works in IDE but fails at runtime" bugs.
- **Barrel re-exports from a root index** — collapses the module graph into one
  entry point, defeating tree-shaking and making dependency boundaries invisible.
