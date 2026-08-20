// @nafios/finance — domain layer (pure). Zero I/O, zero dependencies, no clock.
//
// The MonthlyLedger is the primary unit of work in finance: one calendar month
// of cashflow (monthly-ledger.md §1). This module owns the canonical in-memory
// shape the repository (EF3.6) decodes DB rows into, plus the status model
// (LedgerStatus + isLedgerMutable / isLedgerHeaderEditable). The type mirrors the
// monthly_ledger TABLE:
// derived metrics are NOT stored on it (computed on read by computeLedgerMetrics
// in ledger-metrics.ts), and neither are envelopes — those are a separate entity
// keyed by ledger_id, read via the envelope repository and joined at the query
// layer, exactly as the normalized schema models them.
// Timestamps stay opaque ISO strings: nothing in EF3 does timestamp arithmetic,
// so no Timestamp codec ships. This module models status; it never transitions it.

import type { Month } from "@nafios/datetime";
import type { LedgerMetrics } from "./ledger-metrics";
import type { Money } from "./money";

/** A ledger's lifecycle state. `ongoing` (active working month) → `reconciling`
 *  (parked for finalization) → `settled` (locked, immutable). Mirrors the
 *  `ledger_status` DB enum (EF1.1). */
export type LedgerStatus = "ongoing" | "reconciling" | "settled";

/**
 * One calendar month of cashflow — the primary unit of work in finance
 * (monthly-ledger.md §1). The in-memory domain shape, 1:1 with the
 * `monthly_ledger` row: exactly the columns that table owns, nothing more.
 * Repositories (EF3.6) decode DB rows into this via the EF3.1 codecs.
 *
 * `openingBalance` / `maxCapped` are Money (EF3.1); `month` is Month (EF3.1).
 * `createdAt` / `settledAt` are opaque ISO-8601 timestamp strings as the SDK
 * returns them — the domain does no timestamp arithmetic in EF3, so no Timestamp
 * codec ships.
 *
 * TWO rows of monthly-ledger.md §2's field table are deliberately NOT fields
 * here — the spec table is the conceptual entity, this is the persisted record:
 *   • `derivedMetrics` — computed on read by computeLedgerMetrics, never stored
 *     (monthly-ledger.md §2, §5).
 *   • `envelopes[]` — a RELATIONSHIP, not a column: envelopes are their own
 *     entity/table keyed by `ledger_id`, read separately via the envelope
 *     repository's `listByLedger` (EF3.8) and composed at the query layer by
 *     whoever needs both. Keeping it off the type means a bare ledger read can
 *     never be mistaken for a loaded one, and it stays a TYPE ERROR to hand a
 *     ledger straight to computeLedgerMetrics (which demands `envelopes` in its
 *     own parameter shape) without doing that read.
 */
export interface MonthlyLedger {
  readonly id: string; // uuid PK
  readonly month: Month; // the calendar month this ledger covers
  readonly openingBalance: Money; // income to allocate this month
  readonly maxCapped: Money; // self-imposed spending ceiling
  readonly status: LedgerStatus;
  readonly createdAt: string; // ISO-8601 timestamptz, opaque
  readonly settledAt: string | null; // set iff status === 'settled'
}

/**
 * The per-status envelope tally on a ledger — the summary card's status chips
 * plus the paid/total progress bar. Domain camelCase: the DB's `carried_over`
 * enum label becomes `carriedOver` here (the mapper owns that seam, the way the
 * envelope mapper owns `carried_over ↔ carried-over`). `total` counts EVERY
 * envelope regardless of status, so `paid + pending + skipped + carriedOver === total`.
 */
export interface EnvelopeStatusCounts {
  readonly total: number;
  readonly paid: number;
  readonly pending: number;
  readonly skipped: number;
  readonly carriedOver: number;
}

/**
 * The ledger SUMMARY-CARD read shape — the header + the four headline metrics +
 * the envelope status breakdown, WITHOUT the envelope rows. Produced by
 * `getLedgerSummary`, which delegates the aggregation to the `get_ledger_summary`
 * RPC (the sums/counts are computed server-side, in one round-trip).
 *
 * `metrics` reuses the domain `LedgerMetrics` verbatim: the RPC mirrors
 * `computeLedgerMetrics` to the cent (the DUPLICATION SEAM the migration
 * documents), so a summary read and the pure engine yield the SAME type — a
 * consumer treats server-computed and client-computed metrics identically. This
 * carries no `createdAt` / `settledAt` (the card never shows them and the RPC
 * omits them), so it is deliberately NOT a `MonthlyLedger`.
 *
 * Distinct from creation-window's `LedgerMonthStatus` (`{ month, status }`, the
 * resolver's input row) — a different, unrelated shape.
 */
export interface LedgerSummaryCard {
  readonly id: string;
  readonly month: Month;
  readonly status: LedgerStatus;
  readonly openingBalance: Money;
  readonly maxCapped: Money;
  readonly metrics: LedgerMetrics;
  readonly counts: EnvelopeStatusCounts;
}

/** The pending reconciliation ledger derived data  */
export interface ReconPendingLedger extends Pick<LedgerSummaryCard, "id" | "month" | "status"> {
  /** Number of pending envs that waiting to be closed or resolved */
  readonly pendingEnvCounts: number;
  /** The grand total currency amount of the pending envelopes sum*/
  readonly pendingSumAmount: Money;
}

/** True while the ledger's envelopes/amounts may still change (`ongoing` or
 *  `reconciling`); false once `settled` (locked, immutable — monthly-ledger.md §3).
 *  Part of the status model. Does NOT perform transitions — those are command
 *  concerns (EF3.7 / EF5+). */
export function isLedgerMutable(status: LedgerStatus): boolean {
  return status !== "settled";
}

/**
 * True while the ledger's OWN HEADER money fields — `openingBalance` and
 * `maxCapped` — may still be edited: `ongoing` ONLY (monthly-ledger.md §2,
 * "Opening Balance & Max Capped — config-seeded, ledger-owned": *"both fields are
 * editable while the ledger is `ongoing`. Locked in `reconciling` and `settled`"*).
 *
 * STRICTER than `isLedgerMutable` — deliberately a SEPARATE predicate, not a
 * reuse. The two rules govern different things and diverge at `reconciling`:
 *   • `isLedgerMutable` — the ENVELOPE/amount surface. True in `reconciling`:
 *     reconciliation exists precisely to adjust reality (envelope amounts) to
 *     match what happened (§3).
 *   • `isLedgerHeaderEditable` — the ledger's own opening balance / ceiling.
 *     FALSE in `reconciling`: the ceiling must keep reflecting the discipline
 *     contract the user set for that month, so reconciliation moves the actuals,
 *     never the target (§2).
 *
 * Pure and transition-free, like every other member of this module — the command
 * layer composes it as a gate (EF3.7), the UI mirrors it to disable the field.
 */
export function isLedgerHeaderEditable(status: LedgerStatus): boolean {
  return status === "ongoing";
}
