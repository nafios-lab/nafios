# @nafios/core-utils

> This package is the **canonical reference** for NafiOS package structure.
> Model new packages on this shape. Generator (D2) reproduces it.

## What this package does

Provides a `Result<T, E>` discriminated union and helpers (`ok`, `err`, `isOk`, `isErr`) for explicit success/failure handling without exceptions.

## Public API surface

All public exports live in `src/index.ts` (the barrel):

- `ok(value)` — create a success result
- `err(error)` — create an error result
- `isOk(r)` / `isErr(r)` — type guards
- `Result<T, E>` — the type itself

## Invariants

1. Results are deeply frozen on construction.
2. The barrel exports **only** the public API.
3. `src/internal/` contains implementation details — never re-exported.

## Non-obvious gotchas

- **Nothing under `internal/` is public.** The `deepFreeze` helper is used
  internally but is deliberately excluded from the barrel. Do not export it.
- **Consumers import from `@nafios/core-utils`** (the barrel), never from
  deep paths like `@nafios/core-utils/src/result`.
- **No build step.** This package is consumed as TypeScript source via Bun
  workspace resolution. There is no `dist/` directory.

## Scripts

```sh
bun test          # run unit tests
bun run typecheck # tsc --noEmit
```

## Structure

```
src/
  index.ts              # barrel — public exports only
  result.ts             # Result type + constructors
  internal/
    deep-freeze.ts      # internal helper, NOT re-exported
tests/unit/             # bun:test unit tests
docs/                   # human-facing docs
spec.md                 # package specification
```

## Root context

See [root CLAUDE.md](../../CLAUDE.md) for monorepo-wide conventions.
