# 0001. Use a Bun monorepo (Bun workspaces)

- **Status:** Accepted
- **Date:** 2026-06-08
- **Source:** A1 / nafios-foundation epic

## Context

NafiOS is a suite of AI-native apps plus shared libraries. We need a monorepo
strategy that lets packages share code without publish cycles, keeps tooling
minimal, and plays well with AI agents that run commands frequently.

## Decision

Use **Bun workspaces** as the monorepo foundation. The root `package.json`
declares `workspaces` and Bun resolves inter-package dependencies at install time.

## Consequences

- `bun install` at the root links all packages — no separate bootstrap step.
- Packages import each other by name (`@nafios/<pkg>`), resolved through workspace
  protocol, not filesystem hacks.
- We stay on a single runtime (Bun) for package management, script running, and
  testing — fewer moving parts for agents to reason about.
- No Lerna, Nx, or Turborepo layer; if we outgrow Bun workspaces, we add one later.

## Alternatives considered

- **pnpm workspaces** — mature, but adds a second tool alongside Bun and doesn't
  benefit from Bun's native resolution speed.
- **Nx / Turborepo** — powerful orchestration, but premature for the current repo
  size and adds a config surface agents must learn. Revisit if build times grow.
- **Polyrepo** — rejected; the tight coupling between apps and shared packages
  makes cross-repo versioning painful.
