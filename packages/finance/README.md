# @nafios/finance

The NafiOS finance module, published as an internal workspace package. At M0
this is the **package skeleton** — the architecture, not the features: an
internal pure/data layer split and the client/auth connection spine the data
layer sits on. Domain types, the Money/Month codecs, repositories, and UI land
later as incremental feature tickets.

## Installation

Internal workspace package — no installation needed, just import it:

```ts
import { createBrowserClient, createServiceClient } from "@nafios/finance";
import type { FinanceClient } from "@nafios/finance";
```

## Usage

```ts
// Runs AS THE USER in the browser — RLS applies. The only client used at runtime.
const db: FinanceClient = createBrowserClient();

// SERVER-ONLY, bypasses RLS — seeds and tests only. Must set user_id explicitly.
const admin = createServiceClient();
```

Requires `SUPABASE_URL` + `SUPABASE_ANON_KEY` (browser client) and
`SUPABASE_SERVICE_ROLE_KEY` (service client). See the env table and the
service-role warning in [CLAUDE.md](./CLAUDE.md#environment-variables).

## Development

```sh
bun test          # run unit tests
bun run typecheck # type-check with tsc
```

The live-DB RLS matrix is a separate, non-gating lane:

```sh
bun run test:integration   # from repo root, against a local Supabase
```

## Layout & conventions

See [CLAUDE.md](./CLAUDE.md) and [spec.md](./spec.md) for the layer split and
the connection-spine invariants.
