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
// The app-facing WRITE surface (EF3.7) — the single command path that opens a
// MonthlyLedger. EF3.12's creation flow imports these; the underlying
// `createLedgerRepository` stays internal (the command is the public write API,
// the repository is its private primitive).
export {
  type CreateLedgerInput,
  type CreateLedgerResult,
  createLedgerCommands,
  type LedgerCommands,
  type LedgerRejectionReason,
  type UpdateOpeningBalanceResult,
} from "./internal/commands/ledger-commands";
// Data-layer error surface (EF3.6). The app/UI catches FinanceDataError and
// branches on its `code` (e.g. "this month already has a ledger"). The
// repository factory and the mapper stay internal — imported within the package
// by later feature tickets (EF3.7 / EF3.10), never re-exported.
export {
  FinanceDataError,
  type FinanceDataErrorCode,
} from "./internal/errors";
// The app-facing onboarding surface (EF3.9) — the finance-owned provisioning API
// the auth/onboarding layer (EF3.12) calls once per new user on a SERVICE client
// to stock the default categories, plus the runtime AUTHED read the EF3.14
// envelope picker / EF3.13 grouping consume. The catalog + `Category` type ship
// via the domain barrel above (`DEFAULT_CATEGORIES`, `DefaultCategory`,
// `Category`); the `createCategoryRepository` factory + the mapper stay internal.
export {
  listCategories,
  type ProvisionCategoriesResult,
  provisionDefaultCategories,
} from "./internal/provisioning/provision-default-categories";
// The app-facing READ surface — the ledger reads (EF3.13). Composes the internal
// ledger repository + the pure creation-window resolver into the reads the app
// consumes: EF3.10's Home decision state (`getFinanceHomeState(today)`), the
// reconciliation worklist (`getReconPendingLedgers()`), and the single-ledger read
// the `/finance/ledger/$month` route resolves (`getLedger(month)` — keyed by
// month, the (user_id, month) natural key, never by id); the repository + mapper
// stay internal (import-boundary rule held).
export {
  createLedgerQueries,
  type FinanceHomeState,
  type GetLedgerQueryResp,
  type LedgerQueries,
  type ReconPendingLedgersQueryResp,
} from "./internal/queries/ledger-queries";
// NOTE: the persisted-ledger shape is `MonthlyLedger` itself — a pure domain
// type exported via the domain barrel above, like the `LedgerSummaryCard` read
// shape and its `EnvelopeStatusCounts` breakdown. Nothing ledger-shaped is
// exported from `internal/` (there is no header/detail split to re-export).
