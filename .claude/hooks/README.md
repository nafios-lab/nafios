# `.claude/hooks/`

Event hooks for Claude Code sessions. Hooks run shell commands in response to
agent lifecycle events (e.g. before/after tool calls, on session start).

**What belongs here:** automated checks and guards — e.g. running typecheck after
edits, linting before commits, validating specs before implementation.

**Owning ticket:** Active hooks require A3 (so `bun run check` exists) and C1
(linting). This directory is scaffolded by D1 to document intent. Hook
registration will live in `.claude/settings.json` once hooks are authored.
