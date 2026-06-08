# Using @nafios/core-utils

## Import

```ts
import { ok, err, isOk, isErr } from "@nafios/core-utils";
import type { Result } from "@nafios/core-utils";
```

Always import from the package name, never from deep paths.

## Result type

`Result<T, E>` is a discriminated union representing either success or failure:

```ts
type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };
```

## Creating results

```ts
const success = ok("hello");  // Result<string, never>
const failure = err(new Error("oops"));  // Result<never, Error>
```

## Narrowing with type guards

```ts
function handle(r: Result<number>) {
  if (isOk(r)) {
    // r.value is number
    console.log(r.value);
  } else {
    // r.error is Error
    console.error(r.error.message);
  }
}
```

## Immutability

All results are deeply frozen. Attempting to mutate a result will throw a `TypeError` in strict mode:

```ts
const r = ok({ nested: "value" });
r.value.nested = "changed"; // TypeError: Cannot assign to read only property
```
