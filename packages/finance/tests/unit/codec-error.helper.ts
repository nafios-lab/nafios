import { CodecError, type CodecErrorCode } from "../../src/domain";

/** Run `fn`, assert it threw a CodecError, and return its `code` for assertion. */
export function codeOf(fn: () => unknown): CodecErrorCode {
  try {
    fn();
  } catch (error) {
    if (error instanceof CodecError) {
      return error.code;
    }
    throw error;
  }
  throw new Error("expected a CodecError, but nothing was thrown");
}
