import { asDb, type Db } from "@nafios/database";
import {
  createBrowserClient as coreCreateBrowserClient,
  createServiceRoleClient,
} from "@nafios/supabase-core";

/**
 * A finance data-layer client is always the schema-typed `Db`
 * (= `SupabaseClient<Database>`). Repositories (later tickets) receive one of
 * these and never construct their own. The raw `SupabaseClient` type and the
 * generated `@nafios/database` row types are intentionally not re-exported —
 * `FinanceClient` is the only client handle callers see.
 */
export type FinanceClient = Db;

/**
 * The **runtime** client. Finance runs **client-side (in the browser)**: this
 * wraps supabase-core's browser client, which reads the logged-in user's
 * session from browser storage, **auto-refreshes** the access token as it
 * expires, and attaches it to every request — so `auth.uid()` resolves and the
 * owner RLS policy applies for as long as the session lives. Takes no arguments;
 * the browser owns the session (no token is passed in). Repositories built on it
 * (later) must **not** set `user_id` on inserts — the DB default `auth.uid()`
 * fills it.
 */
export function createBrowserClient(): FinanceClient {
  return asDb(coreCreateBrowserClient());
}

/**
 * Client using the `service_role` key: **bypasses RLS**. Seeds and tests only —
 * **never on a request path.** It carries no auth context, so `auth.uid()` is
 * NULL and the `user_id` default cannot fill itself; callers **must** set
 * `user_id` explicitly on every insert or the `NOT NULL` constraint rejects the
 * row (by design — EF1.1 §6).
 */
export function createServiceClient(): FinanceClient {
  return asDb(createServiceRoleClient());
}
