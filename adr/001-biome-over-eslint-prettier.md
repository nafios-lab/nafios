# ADR-001: Biome over ESLint + Prettier

**Status:** Accepted
**Date:** 2026-06-08
**Relates to:** C1 (lint & format enforcement)

## Context

NafiOS is an AI-native monorepo where both humans and AI agents contribute code.
We need a lint + format tool that:

- Enforces consistent style automatically (not just documents it).
- Keeps agent-generated diffs small and deterministic.
- Has minimal configuration for agents to learn and maintain.

The two realistic options are:

1. **ESLint + Prettier** — the long-standing JS/TS standard; two tools, extensive plugin ecosystem.
2. **Biome** — single Rust-based tool covering linting, formatting, and import organizing.

## Decision

We chose **Biome** as the sole lint + format tool.

## Rationale

- **One tool, not two.** Biome replaces both ESLint and Prettier, eliminating the eslint-config-prettier interop layer and halving the configuration surface.
- **Speed.** Biome runs in single-digit milliseconds on this repo. Fast feedback loops matter for both humans and agents calling `bun run check` frequently.
- **Minimal config.** A single `biome.json` with `recommended` rules is all that's needed. Fewer config files means less for agents to misread or accidentally break.
- **Deterministic import ordering.** Built-in import organizing (via `assist.actions.source.organizeImports`) keeps diffs clean when agents re-touch files — no extra plugin required.
- **Bun ecosystem alignment.** Biome is the recommended linter/formatter for Bun-based projects.

## Trade-offs

- ESLint's plugin ecosystem is larger (e.g., eslint-plugin-react, accessibility rules). If we need highly specialized lint rules later, we may add ESLint for those specific cases alongside Biome.
- Teams already familiar with ESLint/Prettier configs will need to learn Biome's (smaller) config surface.

## Consequences

- `biome.json` at the repo root is the single source of truth for style.
- `bun run check` includes `lint` and `format:check` — violations fail the build.
- Project-specific rule overrides are documented inline in `biome.json` with a one-line reason.
- Start with `recommended` ruleset; tighten over time as patterns settle.
