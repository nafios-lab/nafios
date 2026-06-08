# Glossary

Pin every term precisely. One-to-two lines each — if it needs more, it belongs
in a spec or ADR, not here.

## System & repo

- **NafiOS** — the suite of AI-native apps + the AI assistant layer that operates
  them. The name covers the whole product, not just the agent.
- **The orchestrator / agent / PA layer** — the AI agent that can drive any app in
  the suite on the user's behalf. Highest-risk surface.
  → [ADR-0004](../../adr/0004-vercel-ai-sdk-behind-ai-core.md); `@nafios/ai-core`.
- **Suite app** — a user-facing product usable standalone or integrated
  (Finance, Budgeting, Document, Drive/FS, SmartTodo, Calendar, Mini Radio Station).
- **Service** — a headless backend (REST, worker). Lives in `services/`.
- **Package** — reusable library (`@nafios/*`). Lives in `packages/`.
- **App** — deployable user-facing unit. Lives in `apps/`.
- **Monorepo** — one repo, many apps/services/packages, one Bun toolchain.
  → [ADR-0001](../../adr/0001-bun-monorepo.md).
- **AI-native repo** — structured so a stateless agent can find, understand,
  pattern-match, and verify with minimal context.

## Artifacts of record

- **Spec** — authoritative description of *what* a thing does; agents implement
  to it. Co-located at `packages/<x>/spec.md` or cross-cutting in `specs/`.
  → [specs/README.md](../../specs/README.md).
- **ADR** — numbered note capturing *why* a choice was made (immutable once
  accepted). → [adr/README.md](../../adr/README.md).
- **Context docs** — the four files in `.claude/context/` (this one included):
  the rules and the map. → [conventions.md](conventions.md),
  [tech-stack.md](tech-stack.md), [architecture.md](architecture.md).

## Build vocabulary

- **Barrel** — `src/index.ts` that re-exports a package's public API only.
  No logic; just `export { … } from` statements.
- **`internal/` boundary** — private-to-package code under `src/internal/`;
  no cross-package imports allowed.
- **No-build** — internal packages ship TS source (`src/`), not compiled `dist/`.
  → [ADR-0006](../../adr/0006-no-build-internal-packages.md).
- **`--filter`** — Bun's workspace-scoped task runner; replaces Turborepo.
  → [ADR-0007](../../adr/0007-bun-native-filter-task-running.md).

## Planning vocabulary

- **Workstream / Epic** — planning units (A–F under `nafios-foundation`).
- **Guard** — automated structural check beyond what Biome can lint
  (e.g. required files, manifest scripts).

## UI & data (placeholders → owning workstreams)

- **Design tokens / UI kit** → Workstream E.
- **ERD / migration / data dictionary** → Workstream F.

→ Conventions: [conventions.md](conventions.md) · Stack: [tech-stack.md](tech-stack.md) · System shape: [architecture.md](architecture.md)
