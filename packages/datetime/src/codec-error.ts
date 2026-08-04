// @nafios/datetime — pure.
//
// The single error type thrown by the `Month` decode & construct paths on a
// malformed or out-of-range value. A bad value here is a data-integrity /
// programming error (not user input — that is handled on a UI parse path), so
// throwing is correct. `code` distinguishes the failure so callers (or a later
// safe-parse wrapper) can branch on it.
//
// Scope note: this is the CALENDAR codec error only. Other value families own
// their own decode error (e.g. finance's `Money` throws `@nafios/finance`'s own
// `CodecError`) — the two are independent and never meet in a `catch`.

/** Discriminates a {@link CodecError} so callers can branch on the failure. */
export type CodecErrorCode = "month_not_a_date" | "month_not_first_of_month";

/** Thrown by the `Month` decode & construct functions on malformed or
 *  out-of-range input. */
export class CodecError extends Error {
  readonly code: CodecErrorCode;

  constructor(code: CodecErrorCode, message?: string) {
    super(message ?? code);
    this.name = "CodecError";
    this.code = code;
  }
}
