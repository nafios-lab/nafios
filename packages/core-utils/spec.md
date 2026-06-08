<!-- pre-template spec; reconcile to specs/_template.md when B1 lands -->

# @nafios/core-utils — Spec

## Purpose

Provide a minimal, framework-agnostic `Result` type and helpers for explicit success/failure handling across the NafiOS codebase. Serves as the **canonical reference** for NafiOS package structure.

## Scope

- `Result<T, E>` discriminated union type.
- Constructor functions `ok` and `err`.
- Type-guard functions `isOk` and `isErr`.
- Internal `deepFreeze` helper (not public API).

## Entities

| Entity       | Description                                  |
| ------------ | -------------------------------------------- |
| `Result<T,E>`| Discriminated union: success (`ok`) or failure (`err`) |
| `ok(value)`  | Constructs a frozen success result           |
| `err(error)` | Constructs a frozen error result             |
| `isOk(r)`    | Type guard narrowing to success branch       |
| `isErr(r)`   | Type guard narrowing to error branch         |
| `deepFreeze` | Internal recursive freeze — not exported     |

## Invariants

1. Every `Result` returned by `ok()` or `err()` is deeply frozen (`Object.isFrozen` returns `true`).
2. The barrel (`src/index.ts`) exports **only** the public API. Nothing from `internal/` is re-exported.
3. Consumers import from `@nafios/core-utils`, never from deep paths.

## Public API

```ts
export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never>;
export function err<E>(error: E): Result<never, E>;
export function isOk<T, E>(r: Result<T, E>): r is { ok: true; value: T };
export function isErr<T, E>(r: Result<T, E>): r is { ok: false; error: E };
```

## Error modes

- Attempting to mutate a `Result` throws at runtime (frozen object).
- No exceptions are thrown by the API itself; errors are represented as values.

## Examples

```ts
import { ok, err, isOk } from "@nafios/core-utils";

const result = ok(42);
if (isOk(result)) {
  console.log(result.value); // 42
}

const failure = err(new Error("not found"));
if (!isOk(failure)) {
  console.error(failure.error.message); // "not found"
}
```

## Open questions

- Should `Result` support async variants (e.g. `AsyncResult`)? Deferred until a real need arises.
- Should `mapOk` / `mapErr` combinators be added? Not in initial scope — keep the surface minimal.
