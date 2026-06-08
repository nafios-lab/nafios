# 0006. No-build internal packages (consume TS `src/`; no `dist/`)

- **Status:** Accepted
- **Date:** 2026-06-08
- **Source:** A2

## Context

Internal packages in `packages/` are consumed only within the monorepo. A build
step (compiling TS to JS in `dist/`) adds complexity: stale output, watch modes,
build ordering, and agents accidentally editing generated files.

## Decision

Internal packages **do not have a build step**. Consumers import TypeScript
source directly from `src/` via the `exports` field in `package.json`. No `dist/`
directory is generated or committed.

A package may opt into a build step only if it is published externally or has a
concrete technical need (e.g. WASM). In that case, `dist/` is gitignored and
never hand-edited.

## Consequences

- Zero build ordering — `bun install` is the only setup step before code runs.
- No stale-output bugs; the source you read is the source that executes.
- `dist/` in any package signals "this package publishes externally" — a clear
  convention agents can rely on.
- Type-checking still runs per-package via `tsc --noEmit` (see ADR-0010).
- Trade-off: if a package needs complex transpilation (e.g. JSX for a UI lib
  consumed outside the monorepo), it must opt into a build step explicitly.

## Alternatives considered

- **Build all packages to `dist/`** — standard in many monorepos, but adds build
  ordering, watch modes, and stale output risks. Unnecessary when Bun natively
  resolves TS.
- **TypeScript project references** — enables incremental builds, but adds
  `tsconfig` coupling between packages and a build graph to maintain. Rejected
  in favor of simplicity (see ADR-0010).
