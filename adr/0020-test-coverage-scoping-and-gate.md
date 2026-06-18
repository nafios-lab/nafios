# 0020. Test-coverage scoping and the 90% gate

- **Status:** Accepted
- **Date:** 2026-06-15
- **Source:** Coverage-scoping discussion on `feat/nafios-onboarding-auth`

## Context

We want a meaningful test-coverage target for the monorepo. A naive "90% of all
files" number is misleading here for two reasons:

1. **Not all code is worth testing.** The repo contains a large amount of code
   whose behavior is owned elsewhere or carries no logic to exercise:
   - shadcn/ui primitives in `packages/ui/src/components/ui/` — vendored Radix
     wrappers we do not fork (per the `@nafios/ui` "use-as-is vs. wrap"
     convention); testing them re-tests Radix.
   - the TanStack routing layer in `apps/web/src/routes/` + `router.tsx` —
     framework wiring and loaders/guards, better covered by integration tests
     than brittle unit tests with a mocked router.
   - generated output (`routeTree.gen.ts`), Storybook stories (`*.stories.tsx`),
     barrel re-exports (`index.ts`), type-only modules (`types.ts`), and
     build/config glue (`apps/docs`, `tooling/storybook`).

2. **Bun only measures files a test loads.** A source file that no test imports
   is absent from the coverage report entirely — it neither helps nor hurts the
   percentage. So an untested package can report a deceptively high number
   simply because only its few tested files are counted.

Without an explicit, agreed denominator, the coverage figure means nothing and
drifts silently.

## Decision

**Coverage is measured against an explicit in-scope denominator, and that
denominator is enforced at 90% per package.**

### In scope (the denominator)

- `packages/core-utils`, `packages/auth-core` — all runtime logic.
- `packages/ui` — first-party composites (`src/components/`, excluding
  `components/ui/`), `hooks/`, `internal/`, `lib/`.
- `apps/web` — `features/` (schemas, hooks, context, feature components),
  `components/`, and `lib/` server functions.

### Out of scope (excluded from the denominator)

Enforced via `coveragePathIgnorePatterns` in each package's `bunfig.toml`:

- `**/components/ui/**` — vendored shadcn primitives.
- `**/routes/**`, `**/router.tsx`, `**/routeTree.gen.ts` — routing layer + generated.
- `**/*.stories.tsx` — Storybook artifacts.
- `**/index.ts` (barrels), `**/types.ts` (type-only) — no runtime to cover.
- `**/packages/**` in app coverage — workspace deps are measured by their own
  package, never counted twice against a consumer.
- `apps/docs`, `tooling/storybook` — config/build glue, no test suite.

### Honest denominator via coverage manifests

Because Bun ignores unloaded files, each package with untested in-scope files
ships a `tests/coverage-manifest.test.ts` that side-effect-imports every
in-scope module. This forces them into the report so untested files surface as
low coverage instead of vanishing. The manifest stays as a permanent backstop:
a newly added file can't dodge the gate by never being imported.

### Enforcement

- Each package sets `coverageThreshold = 0.9` in `bunfig.toml`. The threshold
  is evaluated **only when coverage runs** (`bun test --coverage`, i.e. the
  root `test:coverage` script). Plain `bun test` — and therefore `bun run check`
  and the required CI job — never compute coverage and are unaffected.
- CI gains a separate `coverage` job that runs `bun run test:coverage`. It is
  `continue-on-error: true` (informational) while the suite is built out, since
  coverage is intentionally low today. It becomes blocking by deleting that one
  line once we reach 90%.

### Deferred files

`apps/web/src/lib/auth-fns.ts` and `apps/web/src/components/navbar.tsx` use
`createServerFn` from `@tanstack/react-start`, which needs the Vite/Start
compiler transform and throws on a raw import. They remain in scope but are not
yet in the manifest; they enter the denominator when their tests mock the
runtime.

## Consequences

- The coverage number is honest and comparable over time — it reflects code we
  decided is worth testing, not vendored or generated noise.
- A clear, machine-enforced contract: the in-scope set lives in `bunfig.toml`
  ignore patterns and the manifests, not in someone's head.
- Baseline at adoption (intentionally low; the suite is incomplete):
  `core-utils` 100%, `auth-core` 100%, `ui` ~21% funcs / ~35% lines, `web`
  ~25% funcs / ~39% lines.
- Adding a new first-party module means adding it to the manifest (or giving it
  a real test) — a small, explicit step that keeps the gate truthful.
- Trade-off: the routing layer and the two deferred server-fn files are not
  covered by this gate. They are expected to be covered by integration tests
  (`tests/integration/`), tracked separately.

## Alternatives considered

- **Whole-repo 90% with no exclusions** — would force low-value tests over
  vendored Radix wrappers and generated files, and the number would still be
  gameable via Bun's load-only measurement. Rejected as noise.
- **No manifests, rely on Bun's loaded-files behavior** — lets untested files
  hide and inflates the percentage. Defeats the purpose of a gate.
- **Single aggregate coverage threshold at the root** — Bun reports per package;
  per-package thresholds localize failures and let already-complete packages
  (`core-utils`, `auth-core`) stay green independently.
- **Make the CI gate blocking immediately** — would break the active feature
  branch's pipeline before the suite exists. Deferred to a one-line flip once
  the target is met.
