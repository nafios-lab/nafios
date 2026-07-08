// @nafios/finance — the single public barrel (the only export surface).
//
// Downstream consumers import from `@nafios/finance`, never from deep paths
// into `src/internal/`. The raw `SupabaseClient` type and the generated
// `@nafios/database` row types are never re-exported.

// Pure domain surface — types, enums, and the Money/Month codecs. Empty at
// EF2; populated by later finance feature tickets.
export * from "./domain";
// Connection spine — finance-scoped clients (EF2.2). `createBrowserClient` is
// the runtime client (browser session, auto-refresh, RLS applies);
// `createServiceClient` bypasses RLS and is seeds/tests only.
export {
  createBrowserClient,
  createServiceClient,
  type FinanceClient,
} from "./internal/client";
// Data-layer error surface (EF3.6). The app/UI catches FinanceDataError and
// branches on its `code` (e.g. "this month already has a ledger"). The
// repository factory and the mapper stay internal — imported within the package
// by later feature tickets (EF3.7 / EF3.10), never re-exported.
export {
  FinanceDataError,
  type FinanceDataErrorCode,
} from "./internal/errors";
// The persisted-ledger shape EF3.10's read surface builds on.
export type { LedgerHeader } from "./internal/repositories/ledger.repo";
