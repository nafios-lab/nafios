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
// The app-facing WRITE surface (EF3.7) — the single command path that opens a
// MonthlyLedger. EF3.12's creation flow imports these; the underlying
// `createLedgerRepository` stays internal (the command is the public write API,
// the repository is its private primitive).
export {
  type CreateLedgerInput,
  type CreateLedgerRejectionReason,
  type CreateLedgerResult,
  createLedgerCommands,
  type LedgerCommands,
} from "./internal/commands/create-ledger";
// The app-facing WRITE surface for manual envelopes (EF3.8) — create / edit /
// set-status / delete. EF3.14's envelope UI imports these; the underlying
// `createEnvelopeRepository` + the envelope mapper stay internal (EF3.10 imports
// the repository within the package for `listByLedger`).
export {
  type CreateEnvelopeInput,
  type CreateEnvelopeResult,
  createEnvelopeCommands,
  type DeleteEnvelopeResult,
  type EditEnvelopeInput,
  type EditEnvelopeResult,
  type EnvelopeCommands,
  type EnvelopeRejectionReason,
  type SetEnvelopeStatusInput,
  type SetEnvelopeStatusResult,
} from "./internal/commands/envelope-commands";
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
