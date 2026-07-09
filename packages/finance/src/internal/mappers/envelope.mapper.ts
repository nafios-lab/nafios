// @nafios/finance — data layer (src/internal/). The row↔domain mapper for the
// envelope table (EF3.8). The SECOND mapper — it copies the ledger mapper's
// one-function-per-direction shape (ledger.mapper.ts, EF3.6) and adds one thing
// unique to the envelope: the `carried_over ↔ carried-over` DB-label seam.
//
// THIS FILE IS THE ONLY PLACE THE SNAKE_CASE `carried_over` STRING APPEARS in
// the whole package (EF3.3 §4.1 / the EF3 epic cross-ticket decision). The Postgres
// `envelope_status` enum label is `carried_over` (identifiers can't contain a
// hyphen); the domain literal is the hyphenated `'carried-over'`. statusFromDb /
// statusToDb are the seam — total over the four statuses, exact round-trip. The
// whole domain + command + web surface uses only `'carried-over'`.
//
// Money is decoded/encoded via the EF3.1 codecs (never a JS float, never
// parseFloat/Number()). created_at / updated_at / obligation_kind are NOT
// surfaced — they are not on EF3.3's Envelope type (unlike the ledger mapper,
// which surfaces createdAt/settledAt).

import type { Enums, Tables, TablesInsert, TablesUpdate } from "@nafios/database";
import type { Envelope, EnvelopeStatus } from "../../domain/envelope";
import { decodeMoney, encodeMoney } from "../../domain/money";
import type {
  EnvelopePatch,
  EnvelopeStatusWrite,
  NewEnvelope,
} from "../repositories/envelope.repo";

/** The DB-side status label — `envelope_status` (`carried_over`, snake_case). */
type EnvelopeStatusDb = Enums<"envelope_status">;

/**
 * The envelope columns an Envelope is built from — every column EF3.3's type
 * needs, EXCLUDING `user_id` (RLS-scoped, never surfaced) and the trio the domain
 * type omits (`created_at`, `updated_at`, `obligation_kind`). The repository
 * selects exactly these. numeric(12,2) columns arrive from the SDK as strings
 * despite the generated `number` type; the mapper is where that is reconciled.
 */
export type EnvelopeRow = Pick<
  Tables<"envelope">,
  | "id"
  | "ledger_id"
  | "category_id"
  | "item"
  | "amount"
  | "original_amount"
  | "status"
  | "paid_at"
  | "payment_source_id"
  | "remark"
  | "linked_member_id"
  | "sort_order"
  | "template_id"
  | "carried_from_envelope_id"
  | "carry_over_reason"
>;

// ─────────────────────────── The carried_over seam ───────────────────────────

/** DB → domain: `carried_over` → `'carried-over'`; the other three map 1:1. */
export function statusFromDb(status: EnvelopeStatusDb): EnvelopeStatus {
  return status === "carried_over" ? "carried-over" : status;
}

/** Domain → DB: `'carried-over'` → `carried_over`; the other three map 1:1. The
 *  ONLY place the snake_case label is written. */
export function statusToDb(status: EnvelopeStatus): EnvelopeStatusDb {
  return status === "carried-over" ? "carried_over" : status;
}

// ─────────────────────────────── Read: row → domain ──────────────────────────

/**
 * READ: envelope row → Envelope. Decodes money via decodeMoney (EF3.1) and the
 * status via the carried_over seam; `paid_at` passes through as an opaque ISO
 * string (no Timestamp codec — EF3.3 §4.4). `original_amount` is mapped faithfully
 * (always null in EF3 — manual). A malformed stored numeric throws EF3.1's
 * CodecError here — NOT a FinanceDataError (that is strictly for query failures).
 *
 * The `as unknown as string` casts acknowledge that supabase-js returns
 * numeric(12,2) as a STRING at runtime even though the generated Row type says
 * `number`; the value is never coerced through a JS float.
 */
export function rowToEnvelope(row: EnvelopeRow): Envelope {
  return {
    id: row.id,
    ledgerId: row.ledger_id,
    category: row.category_id,
    item: row.item,
    amount: decodeMoney(row.amount as unknown as string),
    originalAmount:
      row.original_amount == null ? null : decodeMoney(row.original_amount as unknown as string),
    status: statusFromDb(row.status),
    paidAt: row.paid_at,
    paymentSource: row.payment_source_id,
    remark: row.remark,
    linkedPerson: row.linked_member_id,
    sortOrder: row.sort_order,
    templateId: row.template_id,
    carriedFromEnvelopeId: row.carried_from_envelope_id,
    carryOverReason: row.carry_over_reason,
  };
}

// ─────────────────────────────── Write: domain → row ─────────────────────────

/**
 * WRITE: NewEnvelope → envelope insert row. Encodes money via encodeMoney and the
 * status via the carried_over seam (defaulting to 'pending'). `user_id`, `id`,
 * `created_at`, `updated_at` are OMITTED (DB defaults — user_id fills from
 * auth.uid()). `template_id`, `original_amount`, `carried_from_envelope_id`,
 * `carry_over_reason` are OMITTED (null — manual-only in EF3): that trivially
 * satisfies ck_env_original_amount and ck_env_co_reason_len.
 *
 * encodeMoney emits the exact decimal string the numeric column needs; the
 * `as unknown as number` cast satisfies the generated Insert type without ever
 * routing money through a float.
 */
export function newEnvelopeToInsertRow(input: NewEnvelope): TablesInsert<"envelope"> {
  return {
    ledger_id: input.ledgerId,
    category_id: input.category,
    item: input.item,
    amount: encodeMoney(input.amount) as unknown as number,
    status: statusToDb(input.status ?? "pending"),
    paid_at: input.paidAt ?? null,
    payment_source_id: input.paymentSource ?? null,
    remark: input.remark ?? null,
    linked_member_id: input.linkedPerson ?? null,
    sort_order: input.sortOrder ?? 0,
  };
}

/**
 * WRITE: EnvelopePatch → envelope update row. Only PRESENT keys are included (a
 * partial UPDATE); `amount` → encodeMoney, `category` → category_id, and so on.
 * NEVER touches `status`/`paid_at` — those go through statusWriteToUpdateRow, the
 * single path that owns the paidAt invariant.
 */
export function envelopePatchToUpdateRow(patch: EnvelopePatch): TablesUpdate<"envelope"> {
  const row: TablesUpdate<"envelope"> = {};
  if (patch.category !== undefined) {
    row.category_id = patch.category;
  }
  if (patch.item !== undefined) {
    row.item = patch.item;
  }
  if (patch.amount !== undefined) {
    row.amount = encodeMoney(patch.amount) as unknown as number;
  }
  if (patch.paymentSource !== undefined) {
    row.payment_source_id = patch.paymentSource;
  }
  if (patch.remark !== undefined) {
    row.remark = patch.remark;
  }
  if (patch.linkedPerson !== undefined) {
    row.linked_member_id = patch.linkedPerson;
  }
  if (patch.sortOrder !== undefined) {
    row.sort_order = patch.sortOrder;
  }
  return row;
}

/**
 * WRITE: EnvelopeStatusWrite → envelope update row. Translates the status via the
 * carried_over seam and writes the (status, paid_at) pair together — the ONLY
 * write path that touches those two columns. The pair MUST already satisfy
 * ck_env_paid_at (the command computes it via applyStatusTransition, EF3.3).
 */
export function statusWriteToUpdateRow(next: EnvelopeStatusWrite): TablesUpdate<"envelope"> {
  return {
    status: statusToDb(next.status),
    paid_at: next.paidAt,
  };
}
