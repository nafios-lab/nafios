// @nafios/finance — domain layer (pure). Zero I/O, zero dependencies.
//
// The one money value type for the whole module. Finance stores money as
// Postgres `numeric(12,2)` and reads it as a *string* (never a JS number —
// floats can't hold decimal money exactly: 0.1 + 0.2 !== 0.3). That string is
// NOT automatic: PostgREST serializes an uncast numeric as a JSON *number*, so
// every read path must cast the column `::text` — in the SELECT for table reads
// (see the repositories' *_COLUMNS) or in SQL for the aggregate RPCs.
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
  // Runtime type guard FIRST. The regex below would silently coerce a non-string
  // (RegExp.test stringifies its argument), so a JS number sails past it and only
  // blows up later on `.startsWith` as an opaque TypeError. A numeric column that
  // was not cast ::text arrives here as a number — reject it as a typed CodecError
  // at the boundary instead, naming the actual fault.
  if (typeof dbValue !== "string") {
    throw new CodecError(
      "money_not_numeric",
      `Money must be decoded from a string (numeric(12,2) cast ::text), got ${typeof dbValue}: ${JSON.stringify(dbValue)}`,
    );
  }

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

/**
 * DISPLAY PATH. Format Money as a localized currency string for the UI:
 *   715235 (cents) -> "$7,152.35"   |   -143030 -> "-$1,430.30"   |   0 -> "$0.00"
 * Single-currency (USD / en-US) to match the module's M1 scope. The divide-by-100
 * is a presentation-layer concern only (Intl rounds to 2 dp) — never a
 * re-derivatixon of a stored amount; the exact cents in `value` stay the source of
 * truth. NOT for persistence — use `encodeMoney` for the DB write path.
 */
export function formatMoney(value: Money): string {
  return (toCents(value) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/**
 * The display form of a Money value chosen to fit a width-constrained slot (a
 * metric card, a dense table cell), paired with the full-precision string the UI
 * must keep reachable.
 */
export interface MoneyDisplay {
  /** What the constrained slot renders. Never truncated, never ellipsized. */
  readonly text: string;
  /** The full-precision string — the tooltip, the aria-label, and the value an
   *  edit affordance opens with. Always equal to `formatMoney(value)`. */
  readonly exact: string;
  /** `text !== exact`. When true the UI MUST surface `exact` (title/aria/tooltip),
   *  because what it shows on screen is an abbreviation of the real amount. */
  readonly shortened: boolean;
}

/**
 * Longest string `formatMoneyToFit` leaves untouched: "$999,999.99" — the widest
 * plain amount that still fits a metric card in a 5-up row at the card's display
 * size. Callers with a different slot pass their own budget.
 */
const DEFAULT_FIT_LENGTH = 11;

// Built once — constructing an Intl.NumberFormat is orders of magnitude more
// expensive than formatting with one, and these run per metric per render.
const WHOLE_DOLLAR_FORMAT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const COMPACT_FORMAT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
});

/**
 * DISPLAY PATH. Format Money for a slot only `maxLength` characters wide, giving up
 * the least precision that gets it to fit, in three steps:
 *
 *   1. the full amount            "$7,152.35"
 *   2. cents dropped              "$12,340,343"
 *   3. magnitude notation         "$123.46M"
 *
 * The first form that fits wins, so precision is only ever traded for width when
 * width actually demands it. An amount is NEVER truncated or ellipsized — a
 * half-shown number reads as a different number — so when even step 3 overruns
 * `maxLength`, the shortest form is returned anyway and the slot must accommodate
 * it. Rounding is also skipped when it would render a non-zero amount as "$0": a
 * metric reporting nothing while money is present is worse than one that overflows.
 *
 * The returned `exact` carries the untouched `formatMoney` string for the tooltip /
 * aria-label, so the precision traded away here is always one hover or one screen
 * reader stop away. DISPLAY only — never a persistence or arithmetic path.
 */
export function formatMoneyToFit(value: Money, maxLength = DEFAULT_FIT_LENGTH): MoneyDisplay {
  const exact = formatMoney(value);
  if (exact.length <= maxLength) {
    return { text: exact, exact, shortened: false };
  }

  const cents = toCents(value);
  const dollars = cents / 100; // presentation-only divide; `cents` stays the truth
  // `Math.abs(cents) < 50` is exactly the range that rounds to zero dollars.
  const roundsToNothing = cents !== 0 && Math.abs(cents) < 50;
  const whole = WHOLE_DOLLAR_FORMAT.format(dollars);
  if (!roundsToNothing && whole.length <= maxLength) {
    return { text: whole, exact, shortened: whole !== exact };
  }

  const compact = COMPACT_FORMAT.format(dollars);
  return { text: compact, exact, shortened: compact !== exact };
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
