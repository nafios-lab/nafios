// @nafios/finance — domain layer (pure). Zero I/O, zero dependencies.
//
// The one money value type for the whole module. Finance stores money as
// Postgres `numeric(12,2)`, which the Supabase SDK reads as a *string* (never a
// JS number — floats can't hold decimal money exactly: 0.1 + 0.2 !== 0.3).
// `Money` holds the value as a whole number of CENTS so every combine is exact
// integer arithmetic. This module is the ONLY sanctioned way to build & combine
// money — nothing downstream reaches for `+` on a raw number.

import { CodecError } from "./codec-error";

/**
 * An exact money amount, held internally as a whole number of CENTS (minor units).
 * Branded so a raw `number` can never be passed where `Money` is expected — the only
 * ways to make one are decodeMoney / moneyFromCents / the arithmetic helpers below.
 * Single-currency (finance is single-currency in M1) — Money carries no currency code.
 */
export type Money = number & { readonly __brand: "Money" };

// numeric(12,2) max magnitude is 9,999,999,999.99 = 999,999,999,999 cents (~10¹²),
// comfortably inside Number.MAX_SAFE_INTEGER (~9.007×10¹⁵), so cents never lose
// precision as a JS number.
const MAX_CENTS = 999_999_999_999;

/** Low-level exact constructor from an integer number of cents. Throws CodecError on a
 *  non-integer or out-of-range value. Used by the helpers below and by test fixtures. */
export function moneyFromCents(cents: number): Money {
  if (!Number.isInteger(cents)) {
    throw new CodecError("money_not_integer_cents", `Money cents must be an integer: ${cents}`);
  }
  if (cents < -MAX_CENTS || cents > MAX_CENTS) {
    throw new CodecError("money_out_of_range", `Money cents out of numeric(12,2) range: ${cents}`);
  }
  return cents as Money;
}

export const ZERO_MONEY: Money = moneyFromCents(0); // 0 cents

/** Escape hatch to the raw integer cents (rarely needed outside this module). */
export function toCents(value: Money): number {
  return value;
}

/**
 * DB READ PATH. Decode a numeric(12,2) value as it arrives from the SDK — always a
 * string, e.g. "7152.35", "0.00", "-12.50". Returns Money (cents).
 * Throws CodecError when the input is not a valid numeric(12,2) string:
 *   - not numeric / malformed              -> money_not_numeric
 *   - more than 2 decimal places           -> money_too_many_decimals
 *   - magnitude exceeds numeric(12,2) range -> money_out_of_range
 */
export function decodeMoney(dbValue: string): Money {
  // Optional leading '-', one or more integer digits, optionally '.' + digits.
  // Rejects separators, symbols, "", "NaN", "Infinity", ".5", "1." up front.
  if (!/^-?\d+(\.\d+)?$/.test(dbValue)) {
    throw new CodecError(
      "money_not_numeric",
      `Not a numeric(12,2) value: ${JSON.stringify(dbValue)}`,
    );
  }

  const negative = dbValue.startsWith("-");
  const unsigned = negative ? dbValue.slice(1) : dbValue;
  const [intPart, fracPart = ""] = unsigned.split(".");

  if (fracPart.length > 2) {
    throw new CodecError(
      "money_too_many_decimals",
      `numeric(12,2) allows at most 2 decimals: ${JSON.stringify(dbValue)}`,
    );
  }

  // Build cents from the integer & fractional parts as integers — never via float.
  const cents = Number(intPart) * 100 + Number(fracPart.padEnd(2, "0"));
  const signed = negative && cents !== 0 ? -cents : cents;
  return moneyFromCents(signed); // range-checked here
}

/**
 * DB WRITE PATH. Encode Money to the canonical numeric(12,2) string the DB expects:
 * always exactly 2 decimal places, no thousands separators, no currency symbol.
 *   715235 (cents) -> "7152.35"   |   -1250 -> "-12.50"   |   0 -> "0.00"
 */
export function encodeMoney(value: Money): string {
  const cents = toCents(value);
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, "0");
  return `${cents < 0 ? "-" : ""}${dollars}.${fraction}`;
}

// The ONLY sanctioned way to combine money. All exact (integer arithmetic on cents).

export function addMoney(a: Money, b: Money): Money {
  return moneyFromCents(a + b);
}

export function subtractMoney(a: Money, b: Money): Money {
  return moneyFromCents(a - b); // result MAY be negative
}

export function sumMoney(values: readonly Money[]): Money {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return moneyFromCents(total); // returns ZERO_MONEY for []
}

export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

export function isNegativeMoney(value: Money): boolean {
  return value < 0;
}
