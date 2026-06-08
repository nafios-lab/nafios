# 0009. `CLAUDE.md` is canonical agent context; `AGENTS.md` points to it

- **Status:** Accepted
- **Date:** 2026-06-08
- **Source:** D1

## Context

Multiple AI coding tools (Claude Code, Cursor, Copilot, Windsurf) each look for
their own context file (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, etc.). Maintaining
parallel files with the same content leads to drift and contradictions.

## Decision

**`CLAUDE.md`** (root and per-package) is the single source of truth for agent
context. `AGENTS.md` exists only as a thin pointer that redirects to `CLAUDE.md`.
Other tool-specific files (`.cursorrules`, etc.) similarly point rather than duplicate.

## Consequences

- One file to update when conventions change — no multi-file sync overhead.
- Agents using any tool get consistent instructions (assuming their tool follows
  the redirect).
- If a future tool becomes primary and doesn't read `CLAUDE.md`, we may need to
  invert the pointer direction — but the principle (one source, others redirect)
  stays the same.
- Per-package `CLAUDE.md` files carry local context (invariants, gotchas) that
  the root file doesn't repeat.

## Alternatives considered

- **Duplicate content across `CLAUDE.md`, `AGENTS.md`, `.cursorrules`** — violates
  single source of truth; guaranteed to drift within weeks.
- **Use only `AGENTS.md`** — less specific to our primary tool (Claude Code); would
  still need a pointer for Claude Code to find it.
