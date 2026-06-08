# 0011. Co-locate package specs with their packages

- **Status:** Accepted
- **Date:** 2026-06-08
- **Source:** B1 — stand up spec system (#8, §6)

## Context

Every package needs an authoritative spec. Two options exist for where that spec lives:

1. **Co-located:** `packages/<name>/spec.md` — the spec sits next to `CLAUDE.md`, source, and tests.
2. **Centralized:** `specs/packages/<name>.spec.md` — all specs live under one tree.

Both locations simultaneously would create two sources of truth and inevitable drift — the exact failure mode the spec system is designed to prevent.

## Decision

**Package specs are co-located** at `packages/<name>/spec.md`.

The `specs/` directory is reserved for **cross-cutting specs** that don't belong to a single package: API contracts (`specs/api/`), event schemas (`specs/events/`), and domain models (`specs/domain/`).

If a central index of all specs is wanted, it is a **link index** (pointers to co-located files), never a copy.

## Consequences

- An agent navigating into a package finds `CLAUDE.md` + `spec.md` + code together — maximum discoverability with zero indirection.
- `specs/` stays focused on cross-cutting concerns rather than becoming a mirror of `packages/`.
- The C3 spec-coverage check must look in two places: `packages/<name>/spec.md` for package specs, and `specs/` for cross-cutting specs.
- New packages created by the generator (D2) should scaffold a `spec.md` stub alongside `CLAUDE.md`.

## Alternatives considered

- **Centralized under `specs/packages/`:** Easier to enumerate but forces agents to leave the package directory to read the spec. Discoverability suffers; drift risk rises because edits to code and spec happen in different trees.
- **Both locations with symlinks:** Adds filesystem complexity and tooling assumptions for marginal benefit.
