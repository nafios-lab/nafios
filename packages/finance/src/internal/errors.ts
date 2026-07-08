// @nafios/finance — data layer (src/internal/). The typed error EVERY finance
// repository throws, plus the single SQLSTATE→code classifier they all funnel
// their raw PostgrestErrors through (EF3.6). Established here (the first
// repository) and reused unchanged by the envelope repository (EF3.8).
//
// PostgrestError is imported from @nafios/supabase-core (the sole owner of the
// Supabase SDK), never from @supabase/* directly — the module-wide convention.

import type { PostgrestError } from "@nafios/supabase-core";

/**
 * Why a finance repository write/read failed, classified from the raw
 * PostgrestError. Callers branch on this stable `code` instead of parsing DB
 * message strings.
 *
 * The two `23505` cases are the crux: `duplicate_month` and `ongoing_exists`
 * share SQLSTATE `23505` and are told apart ONLY by the violated constraint
 * name — the distinction EF3.7/EF3.12 need to say "August already has a ledger"
 * vs "you already have an ongoing ledger".
 */
export type FinanceDataErrorCode =
  | "duplicate_month" // 23505 on uq_ledger_user_month — a ledger already exists for that month
  | "ongoing_exists" // 23505 on uq_one_ongoing_ledger — would be a 2nd ongoing ledger for the user
  | "check_violation" // 23514 — a CHECK failed (ck_maxcapped_ceiling / ck_balances_nonneg / ck_settled_at / ck_ledger_month_first)
  | "not_null_violation" // 23502 — a NOT NULL failed (e.g. a service-role caller omitted user_id)
  | "unknown"; // any PostgrestError not mapped above (incl. RLS 42501, unexpected SQLSTATEs)

/**
 * The typed error EVERY finance repository throws. Wraps the raw PostgrestError
 * and classifies it by SQLSTATE (+ constraint name for 23505) so callers branch
 * on a stable `code`. Always carries the DB `constraint` name (when the SQLSTATE
 * carries one, else null) and the raw `PostgrestError` on `cause`.
 *
 * NOT thrown for "no rows": reads return null (§4.2). A malformed DB *value* is
 * a different failure — that surfaces as EF3.1's CodecError from the mapper, not
 * this. FinanceDataError is strictly for *query* failures (SQLSTATE).
 */
export class FinanceDataError extends Error {
  readonly code: FinanceDataErrorCode;
  readonly constraint: string | null;
  // Narrow the built-in Error.cause to the raw SDK error (also the native cause).
  override readonly cause: PostgrestError;

  constructor(code: FinanceDataErrorCode, constraint: string | null, cause: PostgrestError) {
    super(`finance data error (${code})${constraint ? ` on ${constraint}` : ""}: ${cause.message}`);
    this.name = "FinanceDataError";
    this.code = code;
    this.constraint = constraint;
    this.cause = cause;
  }
}

// The DB reports the violated constraint's name inside the error message, e.g.
//   duplicate key value violates unique constraint "uq_ledger_user_month"
//   new row … violates check constraint "ck_maxcapped_ceiling"
// Extract it so 23505 can be split by name and 23514 can record which CHECK failed.
const CONSTRAINT_RE = /constraint "([^"]+)"/;

function extractConstraint(error: PostgrestError): string | null {
  const match = `${error.message ?? ""} ${error.details ?? ""}`.match(CONSTRAINT_RE);
  return match ? (match[1] ?? null) : null;
}

/**
 * The SINGLE SQLSTATE→code classifier every finance repository routes its raw
 * errors through. Maps by `PostgrestError.code` (the SQLSTATE), then — for
 * `23505` — by the violated constraint name:
 *   - 23505 uq_ledger_user_month  → duplicate_month
 *   - 23505 uq_one_ongoing_ledger → ongoing_exists
 *   - 23505 (any other)           → unknown (constraint still recorded)
 *   - 23514                       → check_violation (constraint recorded)
 *   - 23502                       → not_null_violation
 *   - anything else (incl. RLS 42501, unexpected SQLSTATEs) → unknown
 * The raw error always travels on `.cause`.
 */
export function mapPostgrestError(error: PostgrestError): FinanceDataError {
  const constraint = extractConstraint(error);

  switch (error.code) {
    case "23505": {
      if (constraint === "uq_ledger_user_month") {
        return new FinanceDataError("duplicate_month", constraint, error);
      }
      if (constraint === "uq_one_ongoing_ledger") {
        return new FinanceDataError("ongoing_exists", constraint, error);
      }
      return new FinanceDataError("unknown", constraint, error);
    }
    case "23514":
      return new FinanceDataError("check_violation", constraint, error);
    case "23502":
      return new FinanceDataError("not_null_violation", constraint, error);
    default:
      return new FinanceDataError("unknown", constraint, error);
  }
}
