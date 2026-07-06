# specs/domain/

Domain model specifications — cross-cutting concepts and data models that span
multiple packages or services (shared entity definitions, domain invariants,
lifecycle/flow rules).

## Layout: one folder per module, everything inside

Group each module's material into its own subfolder so everything for the module
stays together and the directory doesn't become a flat dumping ground. A module
folder holds **both** the authoritative specs **and** their supporting reference
material — DB-design notes, DBML, ER diagrams, layout JSON, images, drafts:

```
specs/domain/
  finance/                        # everything finance, in one place
    finance-domain-spec.md        # authoritative spec (the contract)
    monthly-ledger.md             # authoritative spec
    template.md                   # authoritative spec
    finance-db-design.md          # reference — banner-marked "not a spec"
    finance-schema.dbml           # reference — the visual data model
    finance-schema.dbml.layout.json
  auth-onboarding/
    onboarding-flow.md            # authoritative spec
  calendar/
    event-model.md
    recurrence.md
```

- **One folder per module** (`finance/`, `auth-onboarding/`, `calendar/`, …). A
  spec scoped to a single module lives in that module's folder — even one that
  touches a few packages (e.g. onboarding spans auth + profile + family, and
  still lives under `auth-onboarding/`).
- **Reference material lives beside the specs it supports**, not in a separate
  tree. → [ADR-0025](../../adr/0025-domain-specs-grouped-by-module-with-reference-material.md).
- Each **spec** is a `.md` file with standard frontmatter + eight sections — see
  [`../_template.md`](../_template.md). The C3 coverage glob is
  `specs/domain/**/*.md`, so nested module folders are recognized.

## Telling authoritative specs from reference material

Everything in a module folder is one of two kinds. Distinguish by **intent, not
location**:

| | Authoritative spec | Reference material |
|---|---|---|
| **Role** | The contract agents implement to | Supports / illustrates a spec |
| **Governs?** | Yes — Entities/Invariants are binding | No — a spec always overrides it |
| **How to spot** | `.md` with spec frontmatter (`status: draft`/`active`) | Any non-`.md` file, **or** a `.md` with a top banner like `> Status: reference — not a spec` |
| **Examples** | `finance-domain-spec.md`, `onboarding-flow.md` | `finance-schema.dbml`, `finance-db-design.md` |

When a spec and a diagram disagree, **the spec wins**. If a reference doc's
decisions settle, promote them into the governing spec rather than letting the
reference become a shadow source of truth.

## Package-owned specs stay in the package

If a domain model is owned by a single package, its authoritative spec is the
package's co-located `spec.md` (e.g.
[`packages/finance/spec.md`](../../packages/finance/spec.md)), per
[ADR-0011](../../adr/0011-co-locate-package-specs.md). Use
`specs/domain/<module>/` for domain concepts that span packages/services — not as
a mirror of a package.
