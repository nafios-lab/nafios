// @nafios/finance — data layer (src/internal/). The envelope commands (EF3.8):
// the app-facing WRITE surface for manual envelopes. It MIRRORS the EF3.7
// create-ledger command pattern — validate-in-domain → orchestrate repository
// writes → return a { ok } result union for deterministic input/context
// rejections / throw FinanceDataError on a DB failure — applied to the EDIT
// surface EF3.7 §4.2 reserved for this ticket.
//
// It adds NO business rule. The mutability rule is EF3.2's isLedgerMutable, the
// paidAt set/clear rule is EF3.3's applyStatusTransition, the non-negativity
// compare is EF3.1's compareMoney/ZERO_MONEY, the data primitives are EF3.8's
// envelope repository + EF3.6's ledger repository. Its whole job is composition +
// the shared parent-ledger mutability gate + the paidAt orchestration.
//
// The mutability gate is a COMMAND-layer rule (EF1.6 §2 keeps lifecycle gating
// out of the DB — no trigger). It is best-effort: in EF3 nothing settles a ledger
// (EF5+), so a mutable ledger cannot become immutable underneath a command — the
// check-to-write window is inert.

import { applyStatusTransition, type Envelope, type EnvelopeStatus } from "../../domain/envelope";
import { compareMoney, type Money, ZERO_MONEY } from "../../domain/money";
import { isLedgerMutable } from "../../domain/monthly-ledger";
import type { FinanceClient } from "../client";
import { createEnvelopeRepository } from "../repositories/envelope.repo";
import { createLedgerRepository } from "../repositories/ledger.repo";

// ───────────────────────── Command inputs ─────────────────────────

/**
 * Create a MANUAL envelope in a ledger. status is always 'pending' / paidAt null
 * on create (you add a line, then mark it paid via setEnvelopeStatus). Manual-only
 * fields are never accepted (always null). amount must be >= 0.
 */
export interface CreateEnvelopeInput {
  readonly ledgerId: string;
  readonly category: string; // a category the user owns (provisioned by EF3.9)
  readonly item: string;
  readonly amount: Money; // >= 0
  readonly paymentSource?: string | null;
  readonly remark?: string | null;
  readonly linkedPerson?: string | null;
  readonly sortOrder?: number; // default 0
}

/**
 * Edit an existing envelope's line fields. Does NOT change status/paidAt (that is
 * setEnvelopeStatus). Only present keys change; amount (if present) must be >= 0.
 */
export interface EditEnvelopeInput {
  readonly envelopeId: string;
  readonly category?: string;
  readonly item?: string;
  readonly amount?: Money;
  readonly paymentSource?: string | null;
  readonly remark?: string | null;
  readonly linkedPerson?: string | null;
  readonly sortOrder?: number;
}

/**
 * Change an envelope's status. Computes the resulting paidAt via EF3.3's
 * applyStatusTransition (set on → paid, cleared on → anything else). `now` is
 * caller-supplied ISO-8601 (no clock in the command — same discipline as EF3.7's
 * `today`). Free-form: any status → any status.
 */
export interface SetEnvelopeStatusInput {
  readonly envelopeId: string;
  readonly status: EnvelopeStatus; // target (domain literal, incl. 'carried-over')
  readonly now: string;
}

// ───────────────── Rejection (deterministic input/context failure) ────────────

/** Why a command refused BEFORE any write — a deterministic input/context failure
 *  the UI renders, not a DB error. (DB failures throw FinanceDataError — §4.3.) */
export type EnvelopeRejectionReason =
  | "ledger_not_found" // parent ledger absent / not owned (create)
  | "envelope_not_found" // target envelope absent / not owned (edit / set-status / delete)
  | "ledger_not_mutable" // parent ledger is settled (isLedgerMutable === false) — locked
  | "negative_amount"; // amount < 0 (create / edit)

// ───────────────────────────── Results ─────────────────────────────

export type CreateEnvelopeResult =
  | { readonly ok: true; readonly envelope: Envelope }
  | {
      readonly ok: false;
      readonly reason: "ledger_not_found" | "ledger_not_mutable" | "negative_amount";
    };

export type EditEnvelopeResult =
  | { readonly ok: true; readonly envelope: Envelope }
  | {
      readonly ok: false;
      readonly reason: "envelope_not_found" | "ledger_not_mutable" | "negative_amount";
    };

export type SetEnvelopeStatusResult =
  | { readonly ok: true; readonly envelope: Envelope }
  | { readonly ok: false; readonly reason: "envelope_not_found" | "ledger_not_mutable" };

export type DeleteEnvelopeResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "envelope_not_found" | "ledger_not_mutable" };

// ───────────────────────────── The commands ────────────────────────────────

export interface EnvelopeCommands {
  /** Add a manual pending envelope to a ledger. Rejects `ledger_not_found` (RLS
   *  null), `ledger_not_mutable` (settled), or `negative_amount`; on success
   *  returns the created Envelope. Throws FinanceDataError('foreign_key_violation')
   *  for a bad/unowned category. */
  createEnvelope(input: CreateEnvelopeInput): Promise<CreateEnvelopeResult>;

  /** Edit an envelope's line fields (not status). Rejects `envelope_not_found`,
   *  `ledger_not_mutable`, or `negative_amount`. Throws
   *  FinanceDataError('foreign_key_violation') for a bad/unowned category. */
  editEnvelope(input: EditEnvelopeInput): Promise<EditEnvelopeResult>;

  /** Change status; applies the paidAt set/clear rule (EF3.3). Rejects
   *  `envelope_not_found` or `ledger_not_mutable`. Never rejects a target status —
   *  transitions are free-form. */
  setEnvelopeStatus(input: SetEnvelopeStatusInput): Promise<SetEnvelopeStatusResult>;

  /** Delete an envelope. Rejects `envelope_not_found` or `ledger_not_mutable`. */
  deleteEnvelope(input: { readonly envelopeId: string }): Promise<DeleteEnvelopeResult>;
}

/**
 * Construct the envelope command surface bound to an authed FinanceClient (EF2.2).
 * It builds the envelope repository and (for the mutability gate) the EF3.6 ledger
 * repository over the same client; every read/write runs as that user under RLS.
 * Inserts never set `user_id` (the DB default `auth.uid()` fills it — EF2.2 AC4).
 */
export function createEnvelopeCommands(client: FinanceClient): EnvelopeCommands {
  const envelopes = createEnvelopeRepository(client);
  const ledgers = createLedgerRepository(client);

  return {
    async createEnvelope(input) {
      // (a) Parent ledger: null under RLS = absent OR not owned.
      const ledger = await ledgers.findById(input.ledgerId);
      if (ledger === null) {
        return { ok: false, reason: "ledger_not_found" };
      }
      // (b) Mutability gate — the shared rule (EF3.2). A settled ledger is locked.
      if (!isLedgerMutable(ledger.status)) {
        return { ok: false, reason: "ledger_not_mutable" };
      }
      // (c) Non-negativity, via compareMoney against ZERO_MONEY (no raw-number math).
      if (compareMoney(input.amount, ZERO_MONEY) < 0) {
        return { ok: false, reason: "negative_amount" };
      }
      // (d) Write a MANUAL, pending line — status 'pending', paidAt null, all
      //     manual-only fields null (the repository omits them). A bad/unowned
      //     category surfaces as a thrown FinanceDataError('foreign_key_violation').
      const envelope = await envelopes.insert({
        ledgerId: input.ledgerId,
        category: input.category,
        item: input.item,
        amount: input.amount,
        status: "pending",
        paidAt: null,
        paymentSource: input.paymentSource ?? null,
        remark: input.remark ?? null,
        linkedPerson: input.linkedPerson ?? null,
        sortOrder: input.sortOrder,
      });
      return { ok: true, envelope };
    },

    async editEnvelope(input) {
      const { envelopeId, ...patch } = input;
      // (a) Target envelope: null = absent / not owned.
      const envelope = await envelopes.findById(envelopeId);
      if (envelope === null) {
        return { ok: false, reason: "envelope_not_found" };
      }
      // (b) Parent-ledger mutability gate. A null parent cannot happen for an owned
      //     envelope (the FK cascades from an owned ledger) — treated as locked to
      //     keep the gate total within the result union.
      const ledger = await ledgers.findById(envelope.ledgerId);
      if (ledger === null || !isLedgerMutable(ledger.status)) {
        return { ok: false, reason: "ledger_not_mutable" };
      }
      // (c) Non-negativity when amount is present.
      if (patch.amount !== undefined && compareMoney(patch.amount, ZERO_MONEY) < 0) {
        return { ok: false, reason: "negative_amount" };
      }
      // (d) Partial line-field update — never touches status/paidAt. No-op
      //     fast-path when the caller supplied no line fields (avoids an empty
      //     UPDATE reaching PostgREST).
      if (Object.keys(patch).length === 0) {
        return { ok: true, envelope };
      }
      const updated = await envelopes.update(envelopeId, patch);
      return { ok: true, envelope: updated };
    },

    async setEnvelopeStatus(input) {
      const envelope = await envelopes.findById(input.envelopeId);
      if (envelope === null) {
        return { ok: false, reason: "envelope_not_found" };
      }
      const ledger = await ledgers.findById(envelope.ledgerId);
      if (ledger === null || !isLedgerMutable(ledger.status)) {
        return { ok: false, reason: "ledger_not_mutable" };
      }
      // Compute the (status, paidAt) pair via EF3.3 — the command NEVER re-derives
      // the paidAt rule; the paidAt != null ⟺ status === 'paid' invariant holds by
      // construction. Transitions are free-form: never rejected on the target.
      const next = applyStatusTransition(
        { status: envelope.status, paidAt: envelope.paidAt },
        input.status,
        input.now,
      );
      const updated = await envelopes.updateStatus(input.envelopeId, next);
      return { ok: true, envelope: updated };
    },

    async deleteEnvelope(input) {
      const envelope = await envelopes.findById(input.envelopeId);
      if (envelope === null) {
        return { ok: false, reason: "envelope_not_found" };
      }
      const ledger = await ledgers.findById(envelope.ledgerId);
      if (ledger === null || !isLedgerMutable(ledger.status)) {
        return { ok: false, reason: "ledger_not_mutable" };
      }
      await envelopes.delete(input.envelopeId);
      return { ok: true };
    },
  };
}
