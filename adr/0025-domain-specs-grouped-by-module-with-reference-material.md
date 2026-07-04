# 0025. Group domain specs by module, with reference material colocated

- **Status:** Accepted
- **Date:** 2026-07-04
- **Source:** Migration of specs from Confluence into the repo; `specs/domain/` reorganization

## Context

[ADR-0011](0011-co-locate-package-specs.md) established that `specs/` holds
**cross-cutting** specs, with `specs/domain/` for domain models. It left two
questions open that the Confluence-to-repo migration forced us to answer:

1. **Structure inside `specs/domain/`.** As domains grew (finance, auth-onboarding,
   calendar, …) a flat `specs/domain/*.md` list became a dumping ground — hard to
   scan, and unclear which specs belonged together.
2. **Where a spec's supporting artifacts live.** A real domain spec is rarely just
   prose: finance ships a physical data model (`finance-schema.dbml`), a
   DB-design brainstorm (`finance-db-design.md`), a diagram layout
   (`.dbml.layout.json`), and will grow ER images. An earlier draft of the READMEs
   pushed these into a parallel `docs/<module>/` tree ("specs are not diagrams").
   In practice that split the material an agent needs to understand one module
   across two trees, and the `docs/` tree never actually received the files — they
   stayed next to the specs, where authors kept them.

We chose to make the *de facto* layout the official one rather than fight it.

## Decision

**`specs/domain/` is organized as one subfolder per module, and each module
folder holds both the authoritative specs and their reference material.**

- **One folder per module** — `specs/domain/finance/`, `specs/domain/auth-onboarding/`,
  `specs/domain/calendar/`, … A spec scoped to a module lives in that module's
  folder, even if it touches several packages (onboarding spans auth + profile +
  family and still lives under `auth-onboarding/`).
- **Reference material lives beside the specs it supports** — DB-design notes,
  DBML, ER diagrams, layout JSON, images, exploratory drafts — *not* in a
  separate `docs/<module>/` tree.
- **Spec vs. reference is decided by intent, not location.** An **authoritative
  spec** is a `.md` file with the standard versioned frontmatter (`status: draft`
  or `active`); its Entities/Invariants govern. **Reference material** is any
  non-`.md` file, or a `.md` that carries a top banner marking it non-authoritative
  (e.g. `> Status: reference — not a spec`). When a spec and a diagram disagree,
  the spec wins.

This does not change [ADR-0011](0011-co-locate-package-specs.md): package-owned
specs stay co-located at `packages/<name>/spec.md`. `specs/domain/<module>/` is for
domain concepts that span packages/services, not a mirror of a package.

## Consequences

- An agent entering `specs/domain/finance/` finds the contract and the material
  behind it in one place — maximum discoverability, zero cross-tree hunting.
- The C3 spec-coverage glob stays `specs/domain/**/*.md` (recursion already covers
  nested module folders). Reference `.md` files that lack spec frontmatter, and all
  non-`.md` files, simply don't satisfy the "counts as a spec" rule — they are
  **not** coverage gaps. See [`specs/README.md`](../specs/README.md).
- Authors must keep the spec/reference boundary legible: give reference `.md` docs
  a clear non-authoritative banner, and when a reference doc's decisions settle,
  **promote** them into the governing spec rather than letting the reference become
  a shadow source of truth.
- Harness docs that route agents to specs — root `CLAUDE.md`, `.claude/context/`
  (conventions, glossary, architecture), and `/pr-review` — reference this layout so
  a reviewer never flags colocated reference material as a misplaced file.

## Alternatives considered

- **Flat `specs/domain/*.md`** (the pre-migration shape): simplest, but becomes an
  unscannable dumping ground and gives reference artifacts no obvious home.
- **Specs pure + parallel `docs/<module>/` for reference** (the earlier README
  draft): keeps `specs/domain/` free of non-specs, but splits one module's material
  across two trees, hurting discoverability. The `docs/` tree was never actually
  adopted — authors kept references next to the specs regardless.
- **A `reference/` (or `planning/`) subfolder inside each module**: visibly
  separates the two kinds, but adds a layer of nesting for a boundary that
  frontmatter/banner already expresses. Rejected as ceremony; the intent-based rule
  is enough. Modules may still add such a subfolder locally if a folder gets large.
