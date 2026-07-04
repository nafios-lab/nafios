// @nafios/finance — domain layer (pure).
//
// The single error type thrown by the Money/Month decode & construct paths on
// malformed or out-of-range DB values. A malformed DB value is a data-integrity
// / programming error (not user input — that is handled on the UI parse path),
// so throwing is correct. `code` distinguishes the failure so callers (or a
// later safe-parse wrapper) can branch on it.

/** Discriminates a {@link CodecError} so callers can branch on the failure. */
export type CodecErrorCode =
  | "money_not_numeric"
  | "money_too_many_decimals"
  | "money_out_of_range"
  | "money_not_integer_cents"
  | "month_not_a_date"
  | "month_not_first_of_month";

/** Thrown by the Money/Month decode & construct functions on malformed or
 *  out-of-range input. */
export class CodecError extends Error {
  readonly code: CodecErrorCode;

  constructor(code: CodecErrorCode, message?: string) {
    super(message ?? code);
    this.name = "CodecError";
    this.code = code;
  }
}
