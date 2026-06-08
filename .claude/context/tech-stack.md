# Tech Stack

Each choice links to its ADR for the reasoning — do not restate rationale here.

| Layer | Choice | Why (ADR) |
|-------|--------|-----------|
| Runtime | Bun | [ADR-0001](../../adr/0001-bun-monorepo.md) |
| Monorepo task running | Bun-native `--filter` (no Turborepo) | [ADR-0007](../../adr/0007-bun-native-filter-task-running.md) |
| Module resolution | Workspace resolution (not tsconfig path aliases) | [ADR-0008](../../adr/0008-workspace-resolution-over-path-aliases.md) |
| Language | TypeScript (strict) | — (base config, A1) |
| Web apps | TanStack Start | [ADR-0002](../../adr/0002-tanstack-start-for-web-apps.md) |
| Service APIs | REST (not GraphQL) | [ADR-0003](../../adr/0003-rest-over-graphql.md) |
| AI/LLM | Vercel AI SDK v6, wrapped behind `@nafios/ai-core` | [ADR-0004](../../adr/0004-vercel-ai-sdk-behind-ai-core.md) |
| Lint / format | Biome (not ESLint+Prettier) | [ADR-0005](../../adr/0005-biome-over-eslint-prettier.md) |
| Internal packages | No-build; consume TS `src/` (no `dist/`) | [ADR-0006](../../adr/0006-no-build-internal-packages.md) |
| Typecheck | Per-package `tsc --noEmit` via `--filter` | [ADR-0010](../../adr/0010-per-package-typecheck.md) |
| Agent context | `CLAUDE.md` canonical; `AGENTS.md` points to it | [ADR-0009](../../adr/0009-claude-md-canonical-agent-context.md) |
| Database engine | **Undecided** → chosen and recorded in F1 | (deferred) |
| UI tokens / kit | **Pending** | → Workstream E |

→ Conventions for using this stack: [conventions.md](conventions.md) · Terms: [glossary.md](glossary.md) · System shape: [architecture.md](architecture.md)
