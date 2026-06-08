# Building an AI-Native Monorepo for NafiOS

A complete guide to structuring a Bun monorepo optimized for agentic development with Claude Code.

---

## Table of Contents

1. [Core Philosophy](#core-philosophy-why-ai-native-is-different)
2. [Top-Level Repository Layout](#top-level-repository-layout)
3. [The `.claude/` Directory](#the-claude-directory-your-agents-operating-system)
4. [CLAUDE.md: The Entry Point](#claudemd-the-entry-point)
5. [Package Anatomy](#package-anatomy)
6. [Naming and Path Conventions](#naming-and-path-conventions)
7. [The `specs/` Directory](#the-specs-directory-source-of-truth)
8. [The `adr/` Directory](#the-adr-directory-decisions-over-time)
9. [Documentation Architecture](#documentation-architecture)
10. [Tooling and Generators](#tooling-and-generators)
11. [The `.agent/` Runtime Workspace](#the-agent-runtime-workspace)
12. [Workspace Configuration](#workspace-configuration)
13. [Context Engineering Patterns](#context-engineering-patterns)
14. [Skills Worth Building](#skills-worth-building-for-nafios)
15. [CI as Agent Feedback Loop](#ci-as-agent-feedback-loop)
16. [Things to Avoid](#things-to-avoid)
17. [Suggested Build Order](#a-suggested-build-order)

---

## Core Philosophy: Why "AI-Native" is Different

A traditional repo is optimized for humans who can hold context in their heads, ask teammates, and infer conventions from "vibes." An AI-native repo assumes the reader is a stateless agent that wakes up with zero context every session. This means three things must be true:

1. **Discoverability over cleverness.** Flat, predictable paths beat clever abstractions. An agent should be able to guess where something lives.
2. **Explicit context over implicit knowledge.** Every package, every decision, every convention is written down somewhere the agent will look.
3. **Machine-parseable structure.** Manifests, schemas, and indices that an agent can grep, not just prose docs buried in a wiki.
   Keep this lens on as we go through the structure.

---

## Top-Level Repository Layout

Here's the skeleton recommended for NafiOS:

```
nafios/
├── .claude/                      # Claude Code configuration (the brain)
├── .github/                      # CI, PR templates, CODEOWNERS
├── apps/                         # Deployable applications
├── packages/                     # Reusable libraries
├── services/                     # Long-running backend services
├── tooling/                      # Internal dev tooling, scripts, generators
├── docs/                         # Human + agent documentation
├── specs/                        # Formal specifications (the source of truth)
├── adr/                          # Architecture Decision Records
├── .agent/                       # Agent runtime workspace (gitignored mostly)
├── CLAUDE.md                     # Root agent context file
├── AGENTS.md                     # Generic agent context (Cursor, others)
├── README.md                     # Human-first entry point
├── bun.lockb
├── package.json                  # Workspace root
├── tsconfig.base.json
├── biome.json                    # or eslint+prettier config
└── turbo.json                    # or bun's native task runner config
```

The split between `apps/`, `packages/`, and `services/` is intentional:

- **Apps** are user-facing deployables (web, mobile, desktop).
- **Services** are headless backends.
- **Packages** are everything reusable.
- **Tooling** is meta — code that builds the code.

---

## The `.claude/` Directory: Your Agent's Operating System

This is the single most important folder. It's where you teach Claude Code how to work in your repo.

```
.claude/
├── settings.json                 # Project-level Claude Code settings
├── settings.local.json           # Gitignored, personal overrides
├── commands/                     # Slash commands (reusable prompts)
│   ├── new-package.md
│   ├── add-route.md
│   ├── write-adr.md
│   ├── review-pr.md
│   └── debug-failing-test.md
├── agents/                       # Subagent definitions
│   ├── package-author.md
│   ├── api-designer.md
│   ├── test-writer.md
│   └── security-reviewer.md
├── skills/                       # Project-specific skills
│   ├── tanstack-start-route/
│   │   ├── SKILL.md
│   │   └── templates/
│   ├── rest-service/
│   │   └── SKILL.md
│   ├── ai-sdk-tool/
│   │   └── SKILL.md
│   └── package-scaffold/
│       └── SKILL.md
├── hooks/                        # Pre/post tool-use hooks
│   ├── pre-commit-lint.sh
│   └── post-edit-typecheck.sh
└── context/                      # Long-form context files
    ├── architecture.md
    ├── conventions.md
    ├── glossary.md
    └── tech-stack.md
```

### Component Breakdown

**Slash commands** in `commands/` are reusable prompts you can invoke with `/new-package` or similar. Each is a markdown file with frontmatter and a prompt body. They're how you encode repetitive workflows so you don't retype them.

**Subagents** in `agents/` are specialized personas with their own system prompts and tool restrictions. A `security-reviewer` agent might have read-only access and a prompt focused on vulnerability patterns. A `package-author` might know your scaffolding conventions cold.

**Skills** in `skills/` follow the same pattern as Claude's built-in skills — a `SKILL.md` with a description that triggers loading, plus supporting templates and scripts. This is where you encode "how we do things here" in a way that's loaded only when relevant.

**Hooks** let you run deterministic checks around tool use (e.g., always run `bun typecheck` after an edit).

---

## CLAUDE.md: The Entry Point

This file is auto-loaded by Claude Code on every session. Keep it short, high-signal, and pointer-heavy rather than encyclopedic.

```markdown
# NafiOS — Agent Context

NafiOS is a Bun-based monorepo containing the ecosystem for [one-line description].

## Quick Orientation

- `apps/` — deployable user-facing applications
- `services/` — backend services (REST, workers, AI agents)
- `packages/` — shared libraries (`@nafios/*`)
- `specs/` — authoritative specifications; read before changing public APIs
- `adr/` — architectural decisions; check before deviating from patterns

## Before You Code

1. Read `.claude/context/conventions.md` for naming, structure, and style rules.
2. Read `.claude/context/tech-stack.md` for our chosen libraries and why.
3. Check `specs/` for any spec governing the area you're touching.
4. For new packages, run `/new-package` — do not hand-scaffold.

## Hard Rules

- Never edit `packages/*/dist/` — those are build outputs.
- Never bypass the workspace; always import via `@nafios/pkg-name`.
- All public APIs must have a spec in `specs/` before implementation.
- Run `bun run check` before declaring work complete.

## Pointers

- Architecture overview: `.claude/context/architecture.md`
- Glossary of domain terms: `.claude/context/glossary.md`
- Per-package context: each package has its own `CLAUDE.md`
```

The pattern is **hierarchical**: root `CLAUDE.md` covers repo-wide concerns, then each app/service/package can have its own `CLAUDE.md` with local context. Claude Code reads them as it navigates into directories. This keeps each file small and relevant.

---

## Package Anatomy

Every package, app, and service should follow the same internal shape. Predictability is the whole point.

```
packages/some-package/
├── CLAUDE.md                     # Local agent context (what this package is, gotchas)
├── README.md                     # Human docs
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                  # Public API barrel — only exports
│   ├── internal/                 # Not exported; agents know not to import from outside
│   └── ...
├── tests/
│   ├── unit/
│   └── integration/
├── docs/
│   ├── usage.md
│   └── examples/
└── spec.md                       # Link or inline spec for this package
```

The `internal/` convention is huge for agents. It's a clear signal: "don't reach into this from other packages." Pair it with an ESLint or Biome rule that enforces it and the agent will get fast feedback when it slips up.

Each package's `CLAUDE.md` should answer:

- What does this package do?
- What are its invariants?
- What's the public API surface?
- What are the non-obvious gotchas?
  Keep it under ~100 lines.

---

## Naming and Path Conventions

Pick these once and never deviate. Agents (and humans) learn the pattern and stop having to think.

### Package Naming

Use a scoped namespace: `@nafios/<domain>-<kind>`. Examples:

- `@nafios/auth-core` — auth domain, core library
- `@nafios/auth-react` — auth domain, React bindings
- `@nafios/ai-tools` — AI domain, tools collection
- `@nafios/db-schema` — DB domain, schema definitions

### Service and App Naming

Use kebab-case directory names that match a deployment unit:

- `services/api-gateway`
- `apps/admin-dashboard`
  Inside source code, keep files kebab-case too (`user-service.ts`, not `UserService.ts`) — easier to grep, easier for agents to predict.

### Source Directory Pattern

A common pattern that works well for both REST services and TanStack Start apps:

```
src/
├── routes/         # HTTP routes / TanStack file routes
├── modules/        # Domain modules (feature-grouped)
│   └── users/
│       ├── users.service.ts
│       ├── users.repository.ts
│       ├── users.schema.ts
│       └── users.test.ts
├── lib/            # Cross-cutting utilities
├── config/         # Env, constants
└── index.ts
```

The `<domain>.<role>.ts` naming is gold for agents. They can find "where's the user service?" with a single glob: `**/users.service.ts`.

---

## The `specs/` Directory: Source of Truth

This is what separates a serious AI-native repo from a "we just added CLAUDE.md" repo. Specs are authoritative, machine-readable descriptions of what your system does. Agents implement _to the spec_, not to vibes.

```
specs/
├── README.md                     # How specs work here
├── _template.md                  # Spec template
├── api/
│   ├── auth-api.spec.md
│   ├── users-api.spec.md
│   └── openapi.yaml              # Generated or hand-written
├── events/
│   ├── user-events.spec.md
│   └── schema.json
├── domain/
│   ├── user.spec.md
│   └── billing.spec.md
└── packages/
    └── ai-tools.spec.md
```

### Spec Template Structure

A spec should contain:

- **Purpose** — what this thing is for
- **Scope** — what's in, what's out
- **Entities** — the data shapes involved
- **Invariants** — things that must always be true
- **Public API** — with types
- **Error modes** — what can go wrong
- **Examples** — concrete usage
- **Open questions** — unresolved design issues
  The workflow inversion: the agent reads the spec, implements against it, and if reality forces a change, **updates the spec first** and then the code. This is what makes agentic development reliable.

---

## The `adr/` Directory: Decisions Over Time

ADRs (Architecture Decision Records) are short documents capturing _why_ you made a choice. Numbered sequentially:

```
adr/
├── 0001-use-bun-monorepo.md
├── 0002-tanstack-start-for-web-apps.md
├── 0003-rest-over-graphql.md
├── 0004-ai-sdk-as-llm-abstraction.md
└── README.md
```

Each ADR has:

- **Context** — what situation prompted this decision
- **Decision** — what we chose
- **Consequences** — what follows from this choice
- **Status** — proposed / accepted / superseded
  When an agent is about to make a structural choice, it can grep ADRs to see if you've already decided. This kills entire categories of drift.

---

## Documentation Architecture

Two-track docs:

```
docs/
├── humans/                       # Onboarding, tutorials, narrative
│   ├── getting-started.md
│   ├── contributing.md
│   └── runbooks/
└── reference/                    # Generated or generation-friendly
    ├── api/                      # From OpenAPI
    ├── packages/                 # From TSDoc
    └── events/
```

- The **`humans/`** track is prose. Onboarding, tutorials, narrative explanations.
- The **`reference/`** track is generated from code/specs and is what agents lean on.
  Keep them separate so neither track gets polluted.

---

## Tooling and Generators

```
tooling/
├── generators/                   # Plop or hygen templates
│   ├── package/
│   ├── service/
│   └── route/
├── scripts/
│   ├── check.ts                  # The one-shot validation script
│   ├── new-package.ts
│   └── verify-workspace.ts
└── eslint-config/                # or biome configs
```

### The `bun run check` Script

This script is critical. It should run typecheck, lint, format-check, and tests in one command, with clean output. Agents (and CI) depend on it as the single signal of "is this work done?" Don't make agents guess which of five commands to run.

### Generators

Generators matter because hand-scaffolding new packages is exactly where agents drift from convention. Make `bun run gen:package` produce a perfect, lint-clean, spec-stubbed package every time, and put that command in your slash command `/new-package`.

---

## The `.agent/` Runtime Workspace

A directory the agent can use as scratch space without polluting the repo. Mostly gitignored, with a couple of tracked subdirs.

```
.agent/
├── scratch/                      # Gitignored: temp files, exploration
├── plans/                        # Tracked: long-running plans
│   └── 2026-05-add-billing.md
├── reports/                      # Tracked: analysis outputs
└── README.md
```

When working on a multi-session feature, have the agent write a plan to `.agent/plans/`. Next session, point it at the plan. This is poor-man's memory and it works.

---

## Workspace Configuration

A few Bun-monorepo specifics.

### Root `package.json`

```json
{
  "name": "nafios",
  "private": true,
  "workspaces": ["apps/*", "packages/*", "services/*", "tooling/*"],
  "scripts": {
    "check": "bun run typecheck && bun run lint && bun run test",
    "typecheck": "bun --filter '*' typecheck",
    "lint": "biome check .",
    "test": "bun --filter '*' test",
    "gen:package": "bun tooling/scripts/new-package.ts"
  }
}
```

### TypeScript

A shared `tsconfig.base.json` with strict settings, extended by each package. Path aliases via `paths` in the base config so imports look like `@nafios/auth-core` everywhere.

### Linting

Biome over ESLint+Prettier is worth considering for Bun projects — single tool, faster, less config to teach the agent.

---

## Context Engineering Patterns

A few patterns that compound:

### Hierarchical Context Loading

Root `CLAUDE.md` is broad and short. Package-level `CLAUDE.md` is narrow and specific. The agent picks up both as it navigates. Don't duplicate; cross-link.

### Pointer-Heavy, Prose-Light

Your context files should mostly tell the agent _where to look_, not try to contain everything. "For naming, see `.claude/context/conventions.md`" beats inlining naming rules in five places.

### Glossary Discipline

A `.claude/context/glossary.md` mapping domain terms ("tenant", "workspace", "node", "agent") to precise definitions saves enormous confusion. Agents will confidently misuse a term if you don't pin it down.

### Stable Example References

Maintain a few "canonical" packages or modules that exemplify your conventions. In context files, say "model new REST services on `services/users-api`." The agent will pattern-match correctly.

### Anti-Examples

Document what _not_ to do as explicitly as what to do. "Don't put business logic in routes; routes call services" is more useful than just describing the right structure.

### Failure-Mode Docs

A `docs/humans/runbooks/common-mistakes.md` listing the top 10 things agents have gotten wrong in your repo, with corrections. Living document. Saves you from re-correcting the same drift.

---

## Skills Worth Building for NafiOS

Given your stack, prioritize these project-specific skills under `.claude/skills/`:

| Skill                    | Purpose                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------- |
| **package-scaffold**     | Wraps your generator; ensures `CLAUDE.md`, `spec.md`, and tests are all created     |
| **tanstack-start-route** | Encodes file-based routing conventions, loader/action patterns, data-fetching style |
| **rest-service**         | Service/repository/schema layering and error-handling conventions                   |
| **ai-sdk-tool**          | Authoring AI SDK tools with consistent schemas, descriptions, and error handling    |
| **spec-author**          | Drives the spec-first workflow                                                      |

Each skill is a `SKILL.md` whose description triggers loading when the task matches. Keep them tight — a skill that tries to cover everything triggers for nothing.

The `ai-sdk-tool` skill is particularly valuable because LLM tool definitions are easy to write inconsistently.

---

## CI as Agent Feedback Loop

Your `.github/workflows/` should run:

- `bun run check` on every PR
- A spec-coverage check (every public API has a spec)
- A convention check (no imports from `internal/` across packages, no missing `CLAUDE.md` in new packages)
  Agents work best with fast, deterministic feedback; CI is that feedback when local checks miss something.

A `CODEOWNERS` file isn't just for humans — it's a structural map of the repo that agents can read to understand domain ownership.

---

## Things to Avoid

- **Don't create a deep `src/` hierarchy.** Agents lose their place past three levels. Flat with good naming beats deeply nested with clever organization.
- **Don't let multiple sources of truth coexist.** If a fact lives in both a spec and a README, one will drift. Pick the canonical home and link from elsewhere.
- **Don't write giant `CLAUDE.md` files.** If yours is over 200 lines, split it. Long context files get partially ignored.
- **Don't hand-edit generated artifacts.** Mark them clearly (`// GENERATED — DO NOT EDIT`) and make sure the agent sees the marker on the first line.
- **Don't skip the spec for "small" changes.** The spec-first discipline is what keeps agentic work coherent across sessions and contributors.

---

## A Suggested Build Order

If you're starting fresh, build this in roughly this order:

1. **Workspace skeleton** with one example package
2. **Root `CLAUDE.md` and `.claude/` directory** with conventions and tech-stack context
3. **`bun run check` script and CI**
4. **Package generator and `/new-package` slash command**
5. **Specs and ADR directories** with templates
6. **Project-specific skills** as you find yourself repeating instructions to the agent
   Don't try to build all the scaffolding before any code — let real friction drive what you formalize next.

---

## Summary: The AI-Native Mindset

The recurring theme across every section: **agents are stateless, literal, and pattern-matching.** Every choice — directory layout, naming, where docs live, how decisions are recorded — should make it easier for an agent to:

1. **Find** the right thing the first time
2. **Understand** what's authoritative vs. illustrative
3. **Pattern-match** to existing canonical examples
4. **Verify** that its work is correct with one command
   Get those four right and agentic development feels like having an unlimited-tab teammate. Get them wrong and you'll spend more time correcting drift than building.
