# Specifications

Specs are **authoritative, versioned descriptions of what a thing does**. Agents
implement to the spec, not to vibes. Two sessions reading the same spec produce
the same behavior — that's the point.

## Spec-first workflow

1. **Read** the governing spec before touching a public API.
2. **If behavior must change**, update the spec first — bump `version` and
   `updated` in the frontmatter — then change the code to match.
3. **New public APIs** get a spec before implementation begins.

This inversion (spec leads, code follows) is what makes agentic work
reproducible across sessions and contributors.

## Where specs live

| Kind | Location | Examples |
|------|----------|----------|
| **Package specs** | Co-located at `packages/<name>/spec.md` | `packages/core-utils/spec.md` |
| **API contracts** | `specs/api/` | REST endpoint specs, RPC contracts |
| **Event schemas** | `specs/events/` | Pub/sub event definitions |
| **Domain models** | `specs/domain/` | Cross-cutting domain concepts |
| **Data conventions** | `specs/data/` | Database, migration, and table conventions |

Package specs live with their package for maximum discoverability — an agent
entering a package finds `CLAUDE.md` + `spec.md` + code together. See
[ADR-0011](../adr/0011-co-locate-package-specs.md) for the rationale.

Cross-cutting specs that don't belong to a single package live here under
`specs/`.

## Versioning

Every spec carries frontmatter:

```yaml
status: draft | active | deprecated
version: 0.1.0          # bump as the spec evolves
updated: 2026-06-08      # date of last change
```

Specs are **living artifacts** — they evolve with the system. Version bumps make
changes auditable.

## Relationship to ADRs

- **Specs** (living, versioned) describe **what** — the current intended behavior.
- **ADRs** (immutable) record **why** — the decision that led to a design choice.

Specs link relevant ADRs via the `related_adrs` frontmatter field. They do not
restate the rationale — that belongs in the ADR.

## How agents use specs

The root `CLAUDE.md` routes agents here: *"Check `specs/` for any spec governing
the area you're touching."* For packages, the co-located `spec.md` serves the
same role.

When implementing or modifying a public API:

1. Find the governing spec (co-located `spec.md` or under `specs/`).
2. Read it fully — the **Invariants** section is non-negotiable.
3. Implement to match the spec exactly.
4. If you need different behavior, update the spec first, then the code.

## Template

See [`_template.md`](_template.md) for the standard spec format: versioned
frontmatter plus eight sections (Purpose, Scope, Entities, Invariants, Public
API, Error modes, Examples, Open questions).

## What counts as a spec (for C3 coverage checks)

A valid spec is a Markdown file that:

1. Contains YAML frontmatter with at least `title`, `status`, `version`, and `updated` fields.
2. Includes the eight standard sections from the template (Purpose through Open questions).
3. Lives at one of the recognized locations:
   - `packages/<name>/spec.md` for package specs.
   - `specs/api/*.md`, `specs/events/*.md`, `specs/domain/*.md`, or `specs/data/*.md` for cross-cutting specs.
4. Has `status` set to `draft` or `active` (not `deprecated`).
