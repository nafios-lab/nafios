# 0007. Bun-native `--filter` task running (no Turborepo for now)

- **Status:** Accepted
- **Date:** 2026-06-08
- **Source:** A1

## Context

Monorepo scripts (`typecheck`, `test`, `lint`, etc.) must run across all
workspaces. Orchestration tools like Turborepo add caching and parallelism
but also add configuration and a dependency.

## Decision

Use **Bun's native `--filter` flag** (`bun --filter '*' <script>`) for
cross-workspace task running. No Turborepo, Nx, or other orchestrator.

## Consequences

- One tool (Bun) handles package management, script running, and testing —
  agents only need to know Bun.
- No `turbo.json` or pipeline config to maintain.
- We lose Turborepo's remote caching and task graph optimization. Acceptable
  at current repo size; revisit if CI times grow significantly.
- Root scripts (`check`, `typecheck`, `test`) use `--filter` to fan out, keeping
  the root `package.json` as the single entry point.

## Alternatives considered

- **Turborepo** — excellent caching and parallelism, but adds `turbo.json`,
  pipeline definitions, and a build tool agents must understand. Premature for
  ~10 packages.
- **Nx** — powerful but heavy; plugin system and `nx.json` are more config
  than we need today.
- **Manual scripts per package** — doesn't scale; requires remembering which
  packages to run.
