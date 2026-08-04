import {
  CodecError as MonthCodecError,
  type CodecErrorCode as MonthCodecErrorCode,
} from "@nafios/datetime";
import {
  CodecError as MoneyCodecError,
  type CodecErrorCode as MoneyCodecErrorCode,
} from "../../src/domain";

// Since the Month codec moved to @nafios/datetime, a malformed date now throws
// that package's CodecError while a malformed money value throws finance's own —
// two independent classes. Finance tests exercise both (e.g. creation-window
// asserts month codes, ledger.mapper asserts money codes), so `codeOf` accepts
// either. Production code never does this cross-class check — it lets CodecError
// propagate uncaught (a data-integrity / programming error).

/** Run `fn`, assert it threw a CodecError (money or calendar), and return its
 *  `code` for assertion. */
export function codeOf(fn: () => unknown): MoneyCodecErrorCode | MonthCodecErrorCode {
  try {
    fn();
  } catch (error) {
    if (error instanceof MoneyCodecError || error instanceof MonthCodecError) {
      return error.code;
    }
    throw error;
  }
  throw new Error("expected a CodecError, but nothing was thrown");
}
