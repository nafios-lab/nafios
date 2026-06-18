# @nafios/database

Postgres schema types and the schema-typed Supabase data client for NafiOS.

## Installation

This is an internal workspace package. No installation needed — just import it:

```ts
import { createServerDb, type Database } from "@nafios/database";
```

## Usage

```ts
import { createServerDb } from "@nafios/database";

const db = createServerDb(cookieAdapter);

// Fully typed against the live schema:
const { data } = await db.from("profiles").select("id, avatar_url");
//      ^? { id: string; avatar_url: string | null }[]
```

## Regenerating types

```sh
bun run db:types   # from repo root — regenerates src/database.types.ts
```

Run after every migration. The generated file is committed; never hand-edit it.

See [spec.md](./spec.md).
