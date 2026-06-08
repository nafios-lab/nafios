# @nafios/core-utils

Shared, framework-agnostic utilities for the NafiOS monorepo. Currently provides a `Result` type for explicit success/failure handling.

## Installation

This is an internal workspace package. No installation needed — just import it:

```ts
import { ok, err, isOk, isErr } from "@nafios/core-utils";
```

## Usage

```ts
import { ok, err, isOk } from "@nafios/core-utils";

// Success
const result = ok(42);
if (isOk(result)) {
  console.log(result.value); // 42
}

// Failure
const failure = err(new Error("not found"));
if (!isOk(failure)) {
  console.error(failure.error.message); // "not found"
}
```

Results are deeply frozen on construction — they cannot be mutated after creation.

## Development

```sh
bun test          # run tests
bun run typecheck # type-check with tsc
```

## Canonical reference

This package serves as the canonical example of NafiOS package structure. See [CLAUDE.md](./CLAUDE.md) and [spec.md](./spec.md) for details.
