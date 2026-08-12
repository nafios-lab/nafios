// Pure currency parse/format helpers for <CurrencyInput>. Framework-agnostic and
// domain-agnostic: everything is expressed in *minor units* (the smallest
// indivisible unit of the currency — cents for USD, whole yen for JPY), held as
// an integer so arithmetic stays exact (0.1 + 0.2 !== 0.3 never bites us).
//
// The currency itself only decides *presentation*: the symbol, how many fraction
// digits a minor unit represents, and the locale's decimal/group separators — all
// derived from `Intl.NumberFormat`, never hardcoded.

export interface CurrencyConfig {
  /** BCP-47 locale used for all formatting (e.g. "en-US"). */
  locale: string;
  /** ISO 4217 currency code (e.g. "USD"). */
  currency: string;
  /** The currency symbol for `locale` (e.g. "$", "¥", "€"). */
  symbol: string;
  /** Fraction digits one minor unit stands for: 2 for USD (cents), 0 for JPY. */
  fractionDigits: number;
  /** The locale's decimal separator (e.g. "." for en-US, "," for de-DE). */
  decimal: string;
  /** The locale's grouping separator (e.g. "," for en-US, "." for de-DE). */
  group: string;
}

/**
 * Derive the presentation config for a currency+locale from `Intl.NumberFormat`.
 * The sample `1111.11` is formatted so we can read the actual symbol, decimal, and
 * group characters back out of the parts — no locale tables to maintain.
 */
export function resolveCurrencyConfig(locale: string, currency: string): CurrencyConfig {
  const formatter = new Intl.NumberFormat(locale, { style: "currency", currency });
  // `maximumFractionDigits` is typed optional but is always resolved for a
  // currency formatter; fall back to 2 (the ISO default) to satisfy the type.
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  const parts = formatter.formatToParts(1111.11);
  return {
    locale,
    currency,
    symbol: parts.find((p) => p.type === "currency")?.value ?? "",
    fractionDigits,
    decimal: parts.find((p) => p.type === "decimal")?.value ?? ".",
    group: parts.find((p) => p.type === "group")?.value ?? ",",
  };
}

/**
 * Keep only the characters that make a valid amount as the user types: digits, at
 * most one decimal separator, an optional leading minus (when allowed), and no more
 * than `fractionDigits` fraction digits. Grouping separators are dropped (they're
 * re-applied at rest, not while editing). The output uses the locale's decimal
 * separator so it can be shown back verbatim.
 */
export function sanitizeInput(raw: string, config: CurrencyConfig, allowNegative: boolean): string {
  const negative = allowNegative && raw.trimStart().startsWith("-");
  const hasFraction = config.fractionDigits > 0;
  // A "." typed on a numeric keypad is a decimal intent — accept it as an alias for
  // the locale decimal, unless "." is this locale's *group* separator (de-DE).
  const dotIsDecimal = config.decimal === "." || config.group !== ".";

  let intPart = "";
  let fracPart = "";
  let seenDecimal = false;
  for (const ch of raw) {
    const isDecimal = ch === config.decimal || (dotIsDecimal && ch === ".");
    if (isDecimal && !seenDecimal) {
      // A decimal opens the fraction; for a zero-fraction currency it just stops
      // integer digits (everything after is discarded).
      seenDecimal = true;
      continue;
    }
    if (ch < "0" || ch > "9") continue;
    if (!seenDecimal) {
      intPart += ch;
    } else if (hasFraction && fracPart.length < config.fractionDigits) {
      fracPart += ch;
    }
  }

  intPart = intPart.replace(/^0+(?=\d)/, ""); // "007" -> "7", but keep a lone "0"
  const body = seenDecimal && hasFraction ? `${intPart}${config.decimal}${fracPart}` : intPart;
  return negative ? `-${body}` : body;
}

/**
 * Parse a raw input string to an integer number of minor units, or `null` when the
 * field holds no usable number ("", "-", "." …). "5" -> 500 for USD, "1.2" -> 120,
 * "-3" -> -300. Never returns a non-integer or -0.
 */
export function parseToMinor(
  raw: string,
  config: CurrencyConfig,
  allowNegative: boolean,
): number | null {
  const sanitized = sanitizeInput(raw, config, allowNegative);
  const negative = sanitized.startsWith("-");
  const unsigned = negative ? sanitized.slice(1) : sanitized;
  if (unsigned === "" || unsigned === config.decimal) return null;

  const [intStr = "", fracStr = ""] = unsigned.split(config.decimal);
  const intDigits = intStr === "" ? "0" : intStr;
  const fracDigits = fracStr.padEnd(config.fractionDigits, "0").slice(0, config.fractionDigits);
  const minor = Number(intDigits) * 10 ** config.fractionDigits + Number(fracDigits || "0");
  if (!Number.isFinite(minor)) return null;
  return negative && minor !== 0 ? -minor : minor;
}

/**
 * Format an integer number of minor units for display. `grouped` toggles the
 * thousands separators: `true` for the settled value ("7,152.35"), `false` for a
 * bare ungrouped value ("7152.35"). The symbol is rendered separately (as an
 * adornment), so it's not included here.
 */
export function formatMinor(minor: number, config: CurrencyConfig, grouped: boolean): string {
  const value = minor / 10 ** config.fractionDigits;
  return new Intl.NumberFormat(config.locale, {
    minimumFractionDigits: config.fractionDigits,
    maximumFractionDigits: config.fractionDigits,
    useGrouping: grouped,
  }).format(value);
}

/** Clamp a parsed minor-unit value into the optional `[min, max]` bounds. */
export function clampMinor(value: number | null, min?: number, max?: number): number | null {
  if (value === null) return null;
  if (min !== undefined && value < min) return min;
  if (max !== undefined && value > max) return max;
  return value;
}

/** Insert the grouping separator every three digits from the right ("1234567" -> "1,234,567"). */
export function groupIntegerDigits(digits: string, group: string): string {
  if (digits.length <= 3) return digits;
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += group;
    out += digits[i];
  }
  return out;
}

/**
 * Format a raw input string for **live, as-you-type display**: grouped integer part,
 * but the fraction is left exactly as typed (a trailing "." or a single "1.5" is kept,
 * never force-padded to "1.50" mid-entry). This is what sits in the field while the
 * user edits — `formatMinor` takes over for the settled, at-rest value.
 */
export function formatDraft(raw: string, config: CurrencyConfig, allowNegative: boolean): string {
  const sanitized = sanitizeInput(raw, config, allowNegative);
  const negative = sanitized.startsWith("-");
  const unsigned = negative ? sanitized.slice(1) : sanitized;
  const decimalIndex = unsigned.indexOf(config.decimal);
  const intDigits = decimalIndex === -1 ? unsigned : unsigned.slice(0, decimalIndex);
  // Everything from the decimal onward, kept verbatim (includes the decimal char).
  const fraction = decimalIndex === -1 ? "" : unsigned.slice(decimalIndex);
  return `${negative ? "-" : ""}${groupIntegerDigits(intDigits, config.group)}${fraction}`;
}

// A "value char" is one that survives formatting: a digit, the decimal separator, or
// a minus. Grouping separators (and junk) are not — they're re-derived on format, so
// the caret is tracked by counting value chars, never raw offsets.
function isValueChar(ch: string, config: CurrencyConfig): boolean {
  return (ch >= "0" && ch <= "9") || ch === config.decimal || ch === "-";
}

/** Count value chars in `str` strictly before `index` — the caret's position in value-space. */
export function countValueCharsBefore(str: string, index: number, config: CurrencyConfig): number {
  let count = 0;
  const end = Math.min(index, str.length);
  for (let i = 0; i < end; i++) {
    if (isValueChar(str[i] as string, config)) count++;
  }
  return count;
}

/** Map a value-space caret (`count` value chars) back to a string offset in `formatted`. */
export function caretForValueChars(
  formatted: string,
  count: number,
  config: CurrencyConfig,
): number {
  let seen = 0;
  let pos = 0;
  while (pos < formatted.length && seen < count) {
    if (isValueChar(formatted[pos] as string, config)) seen++;
    pos++;
  }
  return pos;
}
