import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthClient } from "../types";

export function wrapClient(client: SupabaseClient): AuthClient {
  return client as unknown as AuthClient;
}

export function unwrapClient(client: AuthClient): SupabaseClient {
  return client as unknown as SupabaseClient;
}
