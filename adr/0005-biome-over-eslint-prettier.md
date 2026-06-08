# 0005. Biome over ESLint + Prettier

- **Status:** Accepted
- **Date:** 2026-06-08
- **Source:** C1 (lint & format enforcement)

## Context

NafiOS is an AI-native monorepo where both humans and AI agents contribute code.
We need a lint + format tool that enforces consistent style automatically, keeps
agent-generated diffs small and deterministic, and has minimal configuration.

## Decision

Use **Biome** as the sole lint + format tool, replacing ESLint + Prettier.

A single `biome.json` at the repo root with the `recommended` ruleset covers
linting, formatting, and import organizing. Biome's built-in import organizer
keeps diffs clean when agents re-touch files.

## Consequences

- `biome.json` at the repo root is the single source of truth for style.
- `bun run check` includes `lint` and `format:check` — violations fail the build.
- One tool, not two — no eslint-config-prettier interop layer.
- Single-digit millisecond runs on this repo; fast feedback for agents calling
  `bun run check` frequently.
- Project-specific rule overrides are documented inline in `biome.json` with a
  one-line reason.
- ESLint's plugin ecosystem is larger (e.g. accessibility rules). If we need
  highly specialized lint rules later, we may add ESLint alongside Biome for
  those specific cases.

## Alternatives considered

- **ESLint + Prettier** — industry standard, but two tools with interop config.
  Larger plugin ecosystem is the main advantage; not needed at current scale.
- **ESLint only (with stylistic rules)** — possible but ESLint's formatting is
  less complete than Biome's or Prettier's.
