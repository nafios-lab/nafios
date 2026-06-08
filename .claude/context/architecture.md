# Architecture

NafiOS is a suite of AI-native apps (Finance, Budgeting, Document, Drive/FS,
SmartTodo, Calendar, Mini Radio Station, more later) plus an **AI orchestrator**
that can operate any app on the user's behalf. Apps work standalone or integrated.

## Repository shape

```
nafios/
├── apps/          deployable user-facing apps
├── services/      headless backends (REST, workers)
├── packages/      shared libraries (@nafios/*)
├── tooling/       generators and dev scripts
├── specs/         cross-cutting specs (APIs, events, domain models)
├── adr/           architectural decisions (immutable)
└── .claude/       agent context (conventions, glossary, tech-stack, this file)
```

→ Full rationale: [ADR-0001](../../adr/0001-bun-monorepo.md).

## The orchestrator (agent) layer

The PA agent operates apps via tools. It is the **highest-risk, most-exposed
surface**, so stability is prioritized over novelty there. It depends on
`@nafios/ai-core` — the wrapper isolating the AI SDK choice so the provider
can be swapped without touching consumers.
→ [ADR-0004](../../adr/0004-vercel-ai-sdk-behind-ai-core.md).

## High-level flow (abstract)

- **Apps** render UI and call **services**. Services own domain logic + data access.
- The **agent** invokes the same services/apps through defined tools — it is a
  client of the suite, not a parallel path around it.
- **Packages** provide shared capabilities consumed by apps, services, and the agent.

## Boundaries

- Per-app/per-service detail → that area's spec (co-located `spec.md` or in
  [`specs/`](../../specs/README.md)).
- Stack choices and their rationale → [tech-stack.md](tech-stack.md).
- Business rules → product epics, not this file.

→ Naming/structure: [conventions.md](conventions.md) · Stack: [tech-stack.md](tech-stack.md) · Terms: [glossary.md](glossary.md)
