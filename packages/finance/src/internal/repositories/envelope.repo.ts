// @nafios/finance — data layer (src/internal/). The envelope repository (EF3.8):
// the typed, RLS-scoped CRUD + lookup primitives over the envelope table. The
// SECOND finance repository — it reuses EF3.6's foundations verbatim (the
// FinanceDataError + mapPostgrestError classifier, the row↔domain mapper shape).
//
// NO business logic here — no mutability gate (EF3.2), no paidAt derivation
// (EF3.3), no metrics (EF3.10). This is the data primitive the envelope commands
// (envelope-commands.ts) compose. Every method runs on a caller-supplied AUTHED
// client, so auth.uid() resolves and the owner_all RLS policy scopes all
// reads/writes; inserts NEVER set user_id (the DB default auth.uid() fills it).
//
// The repository stays INTERNAL (like createLedgerRepository): EF3.10 imports it
// within the package for listByLedger; the command surface is what the barrel
// exports.

import type { Envelope, EnvelopeStatus } from "../../domain/envelope";
import type { Money } from "../../domain/money";
import type { FinanceClient } from "../client";
import { mapPostgrestError } from "../errors";
import {
  type EnvelopeRow,
  envelopePatchToUpdateRow,
  newEnvelopeToInsertRow,
  rowToEnvelope,
  statusWriteToUpdateRow,
} from "../mappers/envelope.mapper";

// ───────────────────────── Create / patch inputs ─────────────────────────

/**
 * The fields a caller supplies to insert an envelope. `user_id` (DB default
 * auth.uid()), `id`, `created_at`, `updated_at` are NEVER set here. MANUAL-ONLY:
 * `templateId`, `originalAmount`, `carriedFromEnvelopeId`, `carryOverReason` are
 * NOT accepted — the mapper always writes them null (every EF3 envelope is
 * manual; templates/carry-over are EF4+). `status` defaults to 'pending'; the
 * repository stays a general primitive (it accepts a status so EF4+ template
 * generation can insert non-pending lines) — but every EF3 command fixes 'pending'.
 */
export interface NewEnvelope {
  readonly ledgerId: string; // -> ledger_id (FK, CASCADE)
  readonly category: string; // -> category_id (FK, RESTRICT) — required
  readonly item: string;
  readonly amount: Money; // EF3.1 — >= 0 (command + DB ck_env_amount_nonneg)
  readonly status?: EnvelopeStatus; // domain literal; mapper → carried_over on write; default 'pending'
  readonly paidAt?: string | null; // must satisfy paidAt != null ⟺ status === 'paid' (ck_env_paid_at)
  readonly paymentSource?: string | null; // -> payment_source_id (FK, SET NULL)
  readonly remark?: string | null;
  readonly linkedPerson?: string | null; // -> linked_member_id (FK, SET NULL)
  readonly sortOrder?: number; // default 0
}

/**
 * The mutable line fields an edit may change. Deliberately EXCLUDES status/paidAt
 * — those go through updateStatus (the paidAt invariant lives on that single
 * path). Only present keys are written (a partial UPDATE).
 */
export interface EnvelopePatch {
  readonly category?: string;
  readonly item?: string;
  readonly amount?: Money;
  readonly paymentSource?: string | null;
  readonly remark?: string | null;
  readonly linkedPerson?: string | null;
  readonly sortOrder?: number;
}

/** The (status, paidAt) pair a status change writes — structurally EF3.3's
 *  EnvelopeStatusState (what applyStatusTransition returns). */
export interface EnvelopeStatusWrite {
  readonly status: EnvelopeStatus; // domain literal; mapper translates 'carried-over' → carried_over
  readonly paidAt: string | null;
}

// ───────────────────────── The envelope repository ─────────────────────────

/** The envelope columns the mapper builds an Envelope from — the repository's
 *  read surface (excludes user_id, created_at, updated_at, obligation_kind). */
const ENVELOPE_COLUMNS =
  "id, ledger_id, category_id, item, amount, original_amount, status, paid_at, payment_source_id, remark, linked_member_id, sort_order, template_id, carried_from_envelope_id, carry_over_reason";

export interface EnvelopeRepository {
  /** Insert an envelope (user_id filled by the DB default auth.uid() — never set
   *  here). Encodes money via encodeMoney and status via the carried_over seam.
   *  Returns the created Envelope. Throws FinanceDataError
   *  ('foreign_key_violation' on a bad/unowned category | 'check_violation' | …). */
  insert(input: NewEnvelope): Promise<Envelope>;

  /** Fetch by id, RLS-scoped. null when not found OR not owned. */
  findById(id: string): Promise<Envelope | null>;

  /** All envelopes in a ledger, ordered by sort_order asc then created_at asc
   *  (stable). [] when the ledger has none. THIS is what EF3.10 composes into a
   *  MonthlyLedger. */
  listByLedger(ledgerId: string): Promise<Envelope[]>;

  /** Partial line-field update (no status/paidAt). Encodes money; returns the
   *  updated Envelope. */
  update(id: string, patch: EnvelopePatch): Promise<Envelope>;

  /** Write the (status, paidAt) pair. Translates status via the carried_over
   *  seam; the pair MUST already satisfy ck_env_paid_at (the command computes it
   *  via applyStatusTransition). */
  updateStatus(id: string, next: EnvelopeStatusWrite): Promise<Envelope>;

  /** Delete an envelope, RLS-scoped. */
  delete(id: string): Promise<void>;
}

/**
 * Construct an envelope repository bound to an authed FinanceClient (EF2.2).
 * Every method runs as that user under RLS.
 */
export function createEnvelopeRepository(client: FinanceClient): EnvelopeRepository {
  const table = () => client.from("envelope");

  return {
    async insert(input) {
      const { data, error } = await table()
        .insert(newEnvelopeToInsertRow(input))
        .select(ENVELOPE_COLUMNS)
        .single();
      if (error) {
        throw mapPostgrestError(error);
      }
      return rowToEnvelope(data as EnvelopeRow);
    },

    async findById(id) {
      const { data, error } = await table().select(ENVELOPE_COLUMNS).eq("id", id).maybeSingle();
      if (error) {
        throw mapPostgrestError(error);
      }
      return data ? rowToEnvelope(data as EnvelopeRow) : null;
    },

    async listByLedger(ledgerId) {
      const { data, error } = await table()
        .select(ENVELOPE_COLUMNS)
        .eq("ledger_id", ledgerId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) {
        throw mapPostgrestError(error);
      }
      return (data as EnvelopeRow[]).map(rowToEnvelope);
    },

    async update(id, patch) {
      const { data, error } = await table()
        .update(envelopePatchToUpdateRow(patch))
        .eq("id", id)
        .select(ENVELOPE_COLUMNS)
        .single();
      if (error) {
        throw mapPostgrestError(error);
      }
      return rowToEnvelope(data as EnvelopeRow);
    },

    async updateStatus(id, next) {
      const { data, error } = await table()
        .update(statusWriteToUpdateRow(next))
        .eq("id", id)
        .select(ENVELOPE_COLUMNS)
        .single();
      if (error) {
        throw mapPostgrestError(error);
      }
      return rowToEnvelope(data as EnvelopeRow);
    },

    async delete(id) {
      const { error } = await table().delete().eq("id", id);
      if (error) {
        throw mapPostgrestError(error);
      }
    },
  };
}
