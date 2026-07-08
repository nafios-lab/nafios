// @nafios/finance — data layer (src/internal/). The row↔domain mapper for
// monthly_ledger (EF3.6). This is the ONLY place a monthly_ledger numeric/DATE
// is turned into Money/Month and back — one function per direction, the EF3.1
// codecs owned elsewhere and merely called here. This shape is the pattern the
// envelope mapper (EF3.8) copies; the discipline (never touch a raw money/date
// string outside EF3.1's codecs) is the reusable rule.

import type { Tables, TablesInsert } from "@nafios/database";
import { decodeMoney, encodeMoney } from "../../domain/money";
import { decodeMonth, encodeMonth } from "../../domain/month";
import type { LedgerHeader, NewLedger } from "../repositories/ledger.repo";

/**
 * The monthly_ledger columns a LedgerHeader is built from — every column except
 * `user_id` (RLS-scoped, never surfaced to the domain). The repository selects
 * exactly these. numeric(12,2) columns arrive from the SDK as strings despite
 * the generated `number` type (see the column comment in the EF1.1 migration);
 * the mapper is where that reality is reconciled.
 */
export type LedgerRow = Pick<
  Tables<"monthly_ledger">,
  "id" | "month" | "opening_balance" | "max_capped" | "status" | "created_at" | "settled_at"
>;

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
