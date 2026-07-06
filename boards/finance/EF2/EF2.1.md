# EF2.1 — Scaffold the `@nafios/finance` package

> - `M0`
> - `type:chore`
> - `module:finance`
> - `area:infra`
> - `P0`
> - `size:S`
> - **Epic:** EF2 — Scaffold the `@nafios/finance` package

> **This ticket is self-contained.** Everything needed to scaffold the one `@nafios/finance` package, declare its dependencies, and wire it into the repo's one-command check is in this file. Stack: **Bun workspace monorepo**, packages scoped `@nafios/<module>`, scaffolded via the **package generator** (`/new-package`), not by hand. Runtime data access (in later tickets) uses the **Supabase JS SDK** typed from `@nafios/db`'s generated `database.types.ts`. **No ORM / no Drizzle.**
>
> **Assumes EF1.1 is done** (the shared `@nafios/db` package exists, with the Supabase client + generated `database.types.ts`). This ticket is pure plumbing: **one empty-but-valid package** with the standard anatomy, internal domain/data layers, correct workspace deps, and green `bun run check`. It ships **no types, no codecs, no repositories** — the only sibling EF2 ticket, **EF2.2**, adds the Supabase client/auth **connection spine**. Domain types, the Money/Month codecs, and all repositories are **deferred to later finance feature tickets** (driven by user stories & screen flows), not built in EF2.

---

## 1. What you're building

Create the one new EF2 workspace package under `packages/`, via the package generator so it gets the canonical anatomy (`CLAUDE.md`, `README.md`, `spec.md`, `src/index.ts` barrel, `src/internal/`, `tests/`) lint-clean from the first commit:

- **`@nafios/finance`** — the whole finance module as a single package, with two **internal** layers:
  - **`src/domain/`** — the framework-agnostic domain layer, **reserved for** shared TypeScript types/enums and the Money/Month codecs (later feature tickets). **Zero I/O, no app-specific dependencies. Empty (placeholder barrel only) at the end of this ticket.**
  - **`src/internal/`** — the data layer: the only place the SDK and `@nafios/db` appear. EF2.2 lands the client factories + auth/session context here; repositories and row↔domain mappers come with later feature tickets. The package declares **two** workspace/runtime dependencies it uses here: `@nafios/db` (the client + generated `database.types.ts`, from EF1.1) **and** `@supabase/supabase-js`.

This is the **first EF2 deliverable** — EF2.2 and every later finance feature ticket land code into this tree. The dependency direction is one-way and must stay that way: `src/internal/ (data) → src/domain/ (domain) → (nothing app-specific)`. The domain layer never imports the data layer or `@nafios/db`.

> **Why one package, not two:** finance is one module among many in the NafiOS monorepo (calendar, notebook, math, temporal, …), and each module is a single package — so finance is one package too. The pure-vs-I/O boundary that would have motivated a `finance-core`/`finance-data` split is preserved as an **internal** layer boundary: `src/domain/` is zero-I/O and never sees Supabase, while `src/internal/` is the only place the SDK and rows appear. An eslint import-boundary rule enforces it — same guarantee, no second package. Supabase is owned by `@nafios/db`; finance uses it internally and it stays an internal detail. If a browser/AI bundle ever needs the pure domain surface alone, a `@nafios/finance/data` subpath export can split the Supabase-dependent data layer out later — deferred, M0 has no such consumer.

---

## 2. Package layout & dependencies

The package follows the monorepo Package Anatomy (kebab-case files; `src/index.ts` is the **only** export surface; non-public code lives in `src/internal/`). The pure domain layer and the Supabase data layer are **internal** subtrees of the one package, not separate packages.

```
packages/finance/
├── CLAUDE.md                     # what this is; the internal layer boundary (domain pure + zero I/O; data = Supabase only)
├── README.md
├── spec.md                       # links finance/specs/ (domain, ledger, template) + finance/planning/finance-db-design.md + EF2.md
├── package.json                  # @nafios/finance; deps on @nafios/db + @supabase/supabase-js
├── tsconfig.json                 # extends tsconfig.base.json
├── src/
│   ├── index.ts                  # single public barrel — the only export surface (empty at scaffold; EF2.2 adds the client/auth surface)
│   ├── domain/                   # reserved for pure types/enums + Money/Month codecs (later feature tickets); zero I/O; empty at scaffold
│   └── internal/                 # data layer: client factories + auth context (EF2.2); repositories & mappers later
└── tests/
    ├── unit/                     # unit tests land here (later feature tickets)
    └── integration/              # SDK/round-trip tests land here (EF2.2 client smoke tests; full suite later)
```

```jsonc
// packages/finance/package.json
{
  "name": "@nafios/finance",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "@nafios/db": "workspace:*",          // Supabase client + generated database.types.ts (EF1.1)
    "@supabase/supabase-js": "^2"         // the Supabase JS SDK, used only by src/internal/ (the data layer)
  }
}
```

> The package lives in `packages/` (per EF2.md Notes) so it's picked up by the root `workspaces: ["packages/*", …]` glob. Use `workspace:*` (not a pinned version) for the intra-repo `@nafios/db` dep so Bun always links the local package. The shared `@nafios/db` stays domain-neutral — finance's data layer (`src/internal/`), not `@nafios/db`, holds the repositories.

---

## 3. `bun run check` wiring (like EF1.1 §7.2)

The repo's single done-signal is `bun run check` = `typecheck && lint && test`, where `typecheck` and `test` fan out across the workspace (`bun --filter '*' …`). For the new package to participate, its `package.json` must expose `typecheck` and `test` script keys (above). No root change is needed beyond the package existing under the `packages/*` workspace glob — the existing `bun --filter '*'` filters pick it up automatically, exactly as they pick up `@nafios/db`.

- `typecheck` → `tsc --noEmit` against the package's `tsconfig.json` (extends `tsconfig.base.json` strict settings).
- `test` → `bun test` (zero tests is a valid pass at scaffold time).
- `lint` is repo-wide (`biome check .`) and needs no per-package key, but generated files must be lint-clean.

Confirm `bun install` resolves the `workspace:*` dep to the local package (no registry fetch) and that `bun --filter '*' typecheck` enumerates the new package.

---

## 4. Behavior & rules (the hard boundary)

This ticket creates **structure only**. Restating the EF2 boundary so it isn't eroded by "just one helper" at scaffold time. The boundary is now between two **internal** layers of `@nafios/finance`, enforced by an eslint import-boundary rule rather than by the package graph:

- **The domain layer (`src/domain/`) is pure types + pure codecs — zero I/O.** No Supabase import, no `@supabase/supabase-js` import, no `@nafios/db` import, no `fetch`, no env access, no import of the data layer (`src/internal/`). No business logic, no derived-metric computation, no lifecycle/guardrail/cursor rules, no API/UI, no schema changes.
- **The data layer (`src/internal/`) is pure data access** (map / query / CRUD over the SDK). It is the only place that imports `@nafios/db` and `@supabase/supabase-js`; it may import `src/domain/` and nothing app-specific upward. No lifecycle gating, metric math, cursor advancement, or guardrails — those are EF3+/EF4 engine concerns.
- **Layering is one-way, lint-enforced:** `src/internal/ (data) → src/domain/ (domain)`. The domain layer must never import the data layer, `@nafios/db`, or the Supabase SDK. A cyclic or upward import must fail the eslint import-boundary rule.
- **No schema changes.** EF2 consumes the EF1 schema; it never adds/alters tables, columns, constraints, or RLS.
- **Generator-first.** Use `/new-package` (the generator) for the package — do not hand-scaffold. Hand-scaffolding is exactly where drift from the package anatomy starts.

---

## 5. Verification matrix

Run from the repo root after scaffolding the package.

| # | Action | Expected |
|---|---|---|
| 1 | `bun install` | ✅ resolves; `@nafios/finance`'s `@nafios/db` resolves to the local `workspace:*` package (no registry fetch) and `@supabase/supabase-js` installs |
| 2 | `bun --filter '*' typecheck` | ✅ the new (empty) package typechecks green |
| 3 | `bun --filter '*' test` | ✅ green (zero tests passes) |
| 4 | `biome check .` (lint) | ✅ generated files are lint-clean |
| 5 | `bun run check` (typecheck + lint + test) | ✅ green across the whole workspace including the new package |
| 6 | In `src/internal/` (data layer), `import { } from '../domain'` and `from '@nafios/db'` | ✅ both resolve and typecheck; data may import domain |
| 7 | In `src/domain/`, attempt `import … from '../internal'` (or `@nafios/db` / `@supabase/supabase-js`) | ❌ must FAIL the eslint import-boundary rule — domain importing the data layer / `@nafios/db` / the SDK is a defect (§4) |
| 8 | The package has `CLAUDE.md`, `README.md`, `spec.md`, `src/index.ts`, `src/internal/`, `tests/` | ✅ canonical anatomy present (generator output) |

---

## 6. Acceptance criteria

- [ ] **AC1** — `@nafios/finance` exists under `packages/`, scaffolded via the package generator (`/new-package`), with the full anatomy in §2 (`CLAUDE.md`, `README.md`, `spec.md`, `src/index.ts` barrel, `src/domain/`, `src/internal/`, `tests/`).
- [ ] **AC2** — `@nafios/finance` declares exactly two dependencies: `@nafios/db` (`workspace:*`, EF1.1) and `@supabase/supabase-js`; `bun install` resolves `@nafios/db` locally.
- [ ] **AC3** — The internal domain/data layering holds and is enforced by the eslint import-boundary rule: `src/domain/` imports neither the data layer (`src/internal/`) nor `@nafios/db` nor the Supabase SDK; `src/internal/` is the only place those appear and may import `src/domain/`.
- [ ] **AC4** — The package exposes `typecheck` + `test` scripts and is picked up by the root `bun run check` (`bun --filter '*'` filters), exactly as `@nafios/db` is.
- [ ] **AC5** — `bun run check` is green on the empty-but-valid package (typecheck + lint + test).
- [ ] **AC6** — `spec.md` links the relevant `finance/specs/` docs and `EF2.md`; `CLAUDE.md` states the internal layer boundary (§4).
- [ ] **AC7** — No types, codecs, repositories, queries, or schema changes shipped — this ticket is scaffold only. The client/auth connection spine is EF2.2; domain types, codecs, and repositories are deferred to later finance feature tickets.

---

## 7. Notes / decisions

1. **Generator over hand-scaffold.** Per the monorepo guide (Tooling/Generators + the `/new-package` slash command), the new package must come from the generator so the anatomy, `tsconfig` extension, and `bun run check` wiring are correct and consistent. Flagged because it's the single highest-drift moment in EF2.
2. **Codec home (when it lands).** The Money/Month codecs will live in `src/domain/`, not a shared package. They encode finance's `numeric(12,2)` + first-of-month conventions; extract to a shared `@nafios/math`/`@nafios/temporal` later, only when a second module needs them — out of scope for M0. Keep `src/domain/` ready but don't pre-create the codecs (deferred to a feature ticket) or a shared package.
3. **`@nafios/db` stays domain-neutral.** It owns migrations + generated types + the base Supabase client only (EF1.1). All finance repositories live in finance's data layer (`src/internal/`) so the shared DB package isn't coupled to one module.
4. **`workspace:*` protocol.** Use `workspace:*` (not a pinned version) for the intra-repo `@nafios/db` dep so Bun always links the local package; this is the monorepo convention for private workspace packages.
5. **Empty barrels are valid.** `src/index.ts` exporting nothing is an acceptable scaffold state; EF2.2 (client/auth surface) and later feature tickets fill it. Keep the single barrel as the **only** public export surface — it will re-export the domain surface (types, enums, codecs) and the public data surface (client factories, auth context, and later repository classes); the base repository and mappers stay internal. Downstream consumers import `@nafios/finance`, never deep paths into `src/internal/`. The raw `SupabaseClient` type and generated `@nafios/db` row types are never re-exported. A `@nafios/finance/data` subpath export may later split the Supabase-dependent data layer from the pure domain surface for browser/AI bundle safety — **not needed at M0**.

*Provenance (not required reading): package anatomy, `@nafios/<module>` naming, and the `bun run check` one-command signal come from `technicals/monorepo-guide-setup.md` (Package Anatomy, Naming, Workspace Configuration). The single-package shape + internal layering is fixed by `EF2.md` (Stack & approach, Notes). The `@nafios/db` shape is from EF1.1 §7.*

---

## Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 0.1 | 2026-06-27 | NafiOS Foundation | Initial scaffold ticket for the two EF2 packages: generator-created `@nafios/finance-core` (no app deps) + `@nafios/finance-data` (workspace deps on `@nafios/db` + `@nafios/finance-core`), canonical package anatomy, one-way dependency boundary, and `bun run check` wiring. Empty-but-valid; types/codecs/repos deferred to EF2.2/EF2.3/EF2.4+. |
| 0.2 | 2026-06-27 | NafiOS Foundation | Consolidated to a single `@nafios/finance` package: internal `src/domain/` (pure types + codecs) and `src/internal/` (Supabase data layer, deps `@nafios/db` + `@supabase/supabase-js`); two-package split replaced by an eslint import-boundary rule. Still scaffold-only. |
| 0.3 | 2026-06-27 | NafiOS Foundation | Updated cross-references for the trimmed EF2 (skeleton-only): the sole sibling ticket is now EF2.2 (Supabase client/auth connection spine); domain types, Money/Month codecs, and all repositories are deferred to later finance feature tickets rather than to EF2.2/EF2.3/EF2.4+. Scaffold scope, anatomy, deps, lint boundary, and `bun run check` wiring unchanged. |
