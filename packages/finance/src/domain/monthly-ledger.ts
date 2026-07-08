// @nafios/finance — domain layer (pure). Zero I/O, zero dependencies, no clock.
//
// The MonthlyLedger is the primary unit of work in finance: one calendar month
// of cashflow (monthly-ledger.md §1). This module owns the canonical in-memory
// shape the repository (EF3.6/EF3.10) decodes DB rows into, plus the status
// model (LedgerStatus + isLedgerMutable). Derived metrics are NOT stored on the
// type — they're computed on read by computeLedgerMetrics (ledger-metrics.ts).
// Timestamps stay opaque ISO strings: nothing in EF3 does timestamp arithmetic,
// so no Timestamp codec ships. This module models status; it never transitions it.

import type { Envelope } from "./envelope";
import type { Money } from "./money";
import type { Month } from "./month";

/** A ledger's lifecycle state. `ongoing` (active working month) → `reconciling`
 *  (parked for finalization) → `settled` (locked, immutable). Mirrors the
 *  `ledger_status` DB enum (EF1.1). */
export type LedgerStatus = "ongoing" | "reconciling" | "settled";

/**
 * One calendar month of cashflow — the primary unit of work in finance
 * (monthly-ledger.md §1). The in-memory domain shape; repositories (EF3.6/EF3.10)
 * decode DB rows into this via the EF3.1 codecs.
 *
 * `openingBalance` / `maxCapped` are Money (EF3.1); `month` is Month (EF3.1).
 * `createdAt` / `settledAt` are opaque ISO-8601 timestamp strings as the SDK
 * returns them — the domain does no timestamp arithmetic in EF3, so no Timestamp
 * codec ships. `derivedMetrics` is NOT a field: it is computed on read by
 * computeLedgerMetrics, never stored (monthly-ledger.md §2, §5).
 */
export interface MonthlyLedger {
  readonly id: string; // uuid PK
  readonly month: Month; // the calendar month this ledger covers
  readonly openingBalance: Money; // income to allocate this month
  readonly maxCapped: Money; // self-imposed spending ceiling
  readonly status: LedgerStatus;
  readonly envelopes: readonly Envelope[]; // all line items (EF3.3)
  readonly createdAt: string; // ISO-8601 timestamptz, opaque
  readonly settledAt: string | null; // set iff status === 'settled'
}

/** True while the ledger's envelopes/amounts may still change (`ongoing` or
 *  `reconciling`); false once `settled` (locked, immutable — monthly-ledger.md §3).
 *  Part of the status model. Does NOT perform transitions — those are command
 *  concerns (EF3.7 / EF5+). */
export function isLedgerMutable(status: LedgerStatus): boolean {
  return status !== "settled";
}
