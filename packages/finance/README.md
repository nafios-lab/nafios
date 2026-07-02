# @nafios/finance

The NafiOS finance module, published as an internal workspace package. At M0
this is the **package skeleton** — the architecture, not the features: an
internal pure/data layer split and the client/auth connection spine the data
layer sits on. Domain types, the Money/Month codecs, repositories, and UI land
later as incremental feature tickets.

## Installation

Internal workspace package — no installation needed, just import it:

```ts
import { createAuthedClient, createServiceClient } from "@nafios/finance";
import type { AuthContext, FinanceClient } from "@nafios/finance";
```

## Usage

```ts
// Runs AS THE USER — RLS applies. The only client used at runtime.
const db: FinanceClient = createAuthedClient({ accessToken: requestJwt });
// ...or from a Supabase session:
const db2 = createAuthedClient({ session });

// SERVER-ONLY, bypasses RLS — seeds and tests only. Must set user_id explicitly.
const admin = createServiceClient();
```

Requires `SUPABASE_URL` + `SUPABASE_ANON_KEY` (authed) and
`SUPABASE_SERVICE_ROLE_KEY` (service). See [CLAUDE.md](./CLAUDE.md) for the full
env table and the service-role warning.

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

See [CLAUDE.md](./CLAUDE.md) and [spec.md](./spec.md). The package is
hand-scaffolded from the canonical [`packages/core-utils`](../core-utils).
