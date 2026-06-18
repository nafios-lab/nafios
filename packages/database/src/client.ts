import {
  type CookieAdapter,
  createBrowserClient as createSbBrowserClient,
  createServerClient as createSbServerClient,
  type SupabaseClient,
} from "@nafios/supabase-core";
import type { Database } from "./database.types";

/**
 * A Supabase client typed against the NafiOS database schema. Use this for all
 * data access (`.from(...)`, `.rpc(...)`) so table names, columns, and payloads
 * are checked against the real schema.
 */
export type Db = SupabaseClient<Database>;

/**
 * Applies the generated `Database` schema typing to a raw client.
 *
 * The cast is required because `@nafios/supabase-core` returns the untyped
 * client on purpose: `@supabase/ssr`'s factory emits an older `SupabaseClient`
 * generic shape than the installed `@supabase/supabase-js`, so the schema
 * generic can only be applied here, at the data-access boundary. At runtime
 * this is the same client — the typing is a compile-time overlay derived from
 * the live schema via `bun run db:types`.
 */
export function asDb(client: SupabaseClient): Db {
  return client as unknown as Db;
}

/**
 * Creates a schema-typed server-side data client (SSR, server functions).
 * Reads SUPABASE_URL and SUPABASE_ANON_KEY from process.env.
 */
export function createServerDb(cookies: CookieAdapter): Db {
  return asDb(createSbServerClient(cookies));
}

/**
 * Creates a schema-typed browser-side data client.
 * Reads SUPABASE_URL and SUPABASE_ANON_KEY from process.env.
 */
export function createBrowserDb(): Db {
  return asDb(createSbBrowserClient());
}
