// @nafios/finance — data layer (src/internal/). The row↔domain mapper for
// monthly_ledger (EF3.6). This is the ONLY place a monthly_ledger numeric/DATE
// is turned into Money/Month and back — one function per direction, the EF3.1
// codecs owned elsewhere and merely called here. This shape is the pattern the
// envelope mapper (EF3.8) copies; the discipline (never touch a raw money/date
// string outside EF3.1's codecs) is the reusable rule.

import type { TablesInsert } from "@nafios/database";
import { decodeMonth, encodeMonth } from "@nafios/datetime";
import type { LedgerSummaryCard } from "../../domain";
import { decodeMoney, encodeMoney } from "../../domain/money";
import type {
  LedgerHeader,
  LedgerRow,
  LedgerSummaryDTO,
  NewLedger,
} from "../repositories/ledger.repo";

/**
 * READ: monthly_ledger row → LedgerHeader. Decodes money via decodeMoney and the
 * first-of-month DATE via decodeMonth (EF3.1); `status` maps 1:1 (the DB enum
 * values ARE LedgerStatus); `createdAt`/`settledAt` pass through as opaque ISO
 * strings (EF3.2 §4.2). A malformed stored value throws EF3.1's CodecError here
 * — NOT a FinanceDataError (that is strictly for query failures).
 *
 * The `as unknown as string` casts acknowledge that supabase-js returns
 * numeric(12,2) as a STRING at runtime even though the generated Row type says
 * `number`; the value is never coerced through a JS float.
 */
export function rowToLedgerHeader(row: LedgerRow): LedgerHeader {
  return {
    id: row.id,
    month: decodeMonth(row.month),
    openingBalance: decodeMoney(row.opening_balance as unknown as string),
    maxCapped: decodeMoney(row.max_capped as unknown as string),
    status: row.status,
    createdAt: row.created_at,
    settledAt: row.settled_at,
  };
}

/**
 * WRITE: NewLedger → monthly_ledger insert row. Encodes month via encodeMonth
 * ("2027-01" → "2027-01-01") and money via encodeMoney; `status` defaults to
 * 'ongoing'. `user_id`/`id`/`created_at`/`settled_at` are OMITTED — the DB fills
 * id/created_at/user_id by default (auth.uid()) and leaves settled_at null.
 *
 * encodeMoney emits the exact decimal string the numeric column needs; the
 * `as unknown as number` casts satisfy the generated Insert type (which types
 * the numeric columns as `number`) without ever routing money through a float.
 */
export function newLedgerToInsertRow(input: NewLedger): TablesInsert<"monthly_ledger"> {
  return {
    month: encodeMonth(input.month),
    opening_balance: encodeMoney(input.openingBalance) as unknown as number,
    max_capped: encodeMoney(input.maxCapped) as unknown as number,
    status: input.status ?? "ongoing",
  };
}

/**
 * READ: `get_ledger_summary` payload → LedgerSummaryCard. Decodes every money
 * field via decodeMoney (col / asm_contribution / health_margin /
 * outstanding.total — asm & health MAY be negative, which decodeMoney handles)
 * and the first-of-month DATE via decodeMonth (EF3.1); `status` maps 1:1 (the DB
 * enum values ARE LedgerStatus). `envelope_counts.carried_over` (DB snake_case)
 * becomes `carriedOver` — the summary card's counterpart to the envelope mapper's
 * `carried_over ↔ carried-over` seam. A malformed value throws EF3.1's CodecError
 * here, NOT a FinanceDataError (that is strictly for query failures).
 */
export function ledgerSummaryDTOToCard(payload: LedgerSummaryDTO): LedgerSummaryCard {
  return {
    id: payload.id,
    month: decodeMonth(payload.month),
    status: payload.status,
    openingBalance: decodeMoney(payload.opening_balance),
    maxCapped: decodeMoney(payload.max_capped),
    metrics: {
      col: decodeMoney(payload.col),
      healthMargin: decodeMoney(payload.health_margin),
      asmContribution: decodeMoney(payload.asm_contribution),
      outstanding: {
        count: payload.outstanding.count,
        total: decodeMoney(payload.outstanding.total),
      },
      isAsmNegative: payload.is_asm_negative,
    },
    counts: {
      total: payload.envelope_counts.total,
      paid: payload.envelope_counts.paid,
      pending: payload.envelope_counts.pending,
      skipped: payload.envelope_counts.skipped,
      carriedOver: payload.envelope_counts.carried_over,
    },
  };
}
