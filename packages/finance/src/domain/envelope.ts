// @nafios/finance — domain layer (pure). Zero I/O, zero dependencies, no clock.
//
// The Envelope is the universal primitive of the whole product: everything the
// user edits is an envelope (finance-domain-spec.md §3). This module owns the
// canonical in-memory shape, the status vocabulary, the COL-contribution rule
// (countsTowardCol — the single home of the pending+paid set, consumed by the
// metrics engine), and the pure paidAt set/clear resolver (applyStatusTransition).
// EF3 creates MANUAL envelopes only — the template/carry-over fields exist on the
// type but are always null. No Timestamp codec: timestamps stay opaque strings.

import type { Money } from "./money";

// ───────────────────────────── Envelope status ─────────────────────────────

/**
 * One envelope's lifecycle state within a ledger (finance-domain-spec.md §4).
 *   pending      — set aside, not yet actioned         → counts toward COL
 *   paid         — the money has gone out              → counts toward COL
 *   skipped      — deliberately not funded this month  → excluded from COL
 *   carried-over — deferred to a later month           → excluded from COL
 *
 * ⚠️ DB-label seam (EF1.6 / EF1.2 D4): the Postgres enum label is `carried_over`
 * (snake_case — Postgres identifiers can't contain a hyphen). The DOMAIN literal
 * is the hyphenated `'carried-over'`. The `'carried-over' ↔ carried_over`
 * translation is owned by the data-layer mapper (EF3.8, src/internal/) — NOT here.
 * The whole domain + web surface uses only the hyphenated form.
 */
export type EnvelopeStatus = "pending" | "paid" | "skipped" | "carried-over";

/** The four statuses as a frozen, ordered tuple — the canonical set the status
 *  control (EF3.14) renders and exhaustive tests iterate. Order is the display
 *  order, not a state machine (transitions are free-form — see below). */
export const ENVELOPE_STATUSES: readonly EnvelopeStatus[] = Object.freeze([
  "pending",
  "paid",
  "skipped",
  "carried-over",
]);

// ───────────────────────────────── Envelope ────────────────────────────────

/**
 * A single line item — a pocket of cash earmarked for a purpose this month
 * (finance-domain-spec.md §4). The in-memory domain shape; the repository
 * (EF3.8) decodes DB rows into this via the EF3.1 codecs + the status seam.
 *
 * `amount` / `originalAmount` are Money (EF3.1). `paidAt` is an opaque ISO-8601
 * string (no Timestamp codec — same discipline as EF3.2's createdAt/settledAt).
 * Ids are plain `string` (uuid), matching EF3.2's MonthlyLedger.id.
 *
 * EF3 creates MANUAL envelopes only: `templateId`, `originalAmount`,
 * `carriedFromEnvelopeId`, and `carryOverReason` are ALWAYS null in EF3. The
 * fields exist on the type now so templates + carry-over (EF4+) need no
 * re-architecture — only feature code.
 */
export interface Envelope {
  readonly id: string; // uuid PK
  readonly ledgerId: string; // owning MonthlyLedger (uuid)
  readonly category: string; // Category ref (uuid) — required; every envelope has exactly one
  readonly item: string; // line label, e.g. "Netflix", "DBS Reno Loan"
  readonly amount: Money; // the pocket of cash; >= 0 ($0 valid) — enforced at command/DB, not the type
  readonly originalAmount: Money | null; // template-linked only; ALWAYS null in EF3 (manual)
  readonly status: EnvelopeStatus;
  readonly paidAt: string | null; // ISO-8601; non-null IFF status === 'paid' (mirrors DB ck_env_paid_at)
  readonly paymentSource: string | null; // Account ref (uuid), optional
  readonly remark: string | null; // operational note, optional
  readonly linkedPerson: string | null; // Person ref (uuid), optional
  readonly sortOrder: number; // display position within the ledger's list
  readonly templateId: string | null; // source template; ALWAYS null in EF3 (manual)
  readonly carriedFromEnvelopeId: string | null; // back-ref to a source envelope; ALWAYS null in EF3
  readonly carryOverReason: string | null; // ALWAYS null in EF3 — no reason prompt
}

// ─────────────────────── COL-contribution rule (the seam) ───────────────────

/**
 * THE COL-contribution rule — owned here, consumed by the metrics engine (EF3.2).
 * Returns true for the statuses whose `amount` counts toward Cost of Living:
 * `pending` and `paid`. `skipped` and `carried-over` are excluded — the money was
 * not (and will not be) spent this month (finance-domain-spec.md §5).
 *
 * This is the ONLY place the pending+paid set is defined. EF3.2, the data layer,
 * and the web layer all call this — none re-implement it (epic cross-ticket decision).
 */
export function countsTowardCol(status: EnvelopeStatus): boolean {
  return status === "pending" || status === "paid";
}

// ─────────────────────── paidAt set/clear transition rule ───────────────────

/** The (status, paidAt) pair — the mutable slice a status change touches. */
export interface EnvelopeStatusState {
  readonly status: EnvelopeStatus;
  readonly paidAt: string | null;
}

/**
 * Pure resolver for the `paidAt` set/clear rule (monthly-ledger.md §4, RFC-018).
 * Given the current (status, paidAt) and a target status, returns the new pair:
 *   • → 'paid' from a non-paid status : paidAt = `now`
 *   • → 'paid' while already 'paid'    : paidAt UNCHANGED (status didn't change ⇒ no re-stamp)
 *   • → any non-'paid' status          : paidAt = null
 * So the invariant `paidAt != null ⟺ status === 'paid'` ALWAYS holds on the result
 * (mirrors the DB ck_env_paid_at CHECK).
 *
 * `now` is a caller-supplied ISO-8601 string — the resolver never reads the clock
 * (keeps it pure/testable, same discipline as EF3.1's monthOf).
 *
 * Transitions are FREE-FORM (any → any) — this never throws. Ledger-mutability
 * gating (settled = locked) is the command layer's job via EF3.2's isLedgerMutable,
 * NOT this function. In EF3, → 'carried-over' sets status only: no carryOverReason
 * prompt, no template routing, no acted-on locking (all EF4+).
 */
export function applyStatusTransition(
  current: EnvelopeStatusState,
  next: EnvelopeStatus,
  now: string,
): EnvelopeStatusState {
  if (next !== "paid") {
    // Leaving (or never entering) paid always clears the stamp.
    return { status: next, paidAt: null };
  }
  // next === 'paid': re-stamp only when this is an actual transition INTO paid.
  if (current.status === "paid") {
    return { status: "paid", paidAt: current.paidAt }; // no status change ⇒ no re-stamp
  }
  return { status: "paid", paidAt: now };
}
