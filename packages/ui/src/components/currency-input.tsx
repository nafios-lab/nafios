import type * as React from "react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  caretForValueChars,
  clampMinor,
  countValueCharsBefore,
  formatDraft,
  formatMinor,
  parseToMinor,
  resolveCurrencyConfig,
} from "../internal/currency-format.ts";
import { cn } from "../lib/utils.ts";
import { TextInput, type TextInputProps } from "./text-input.tsx";

export interface CurrencyInputProps
  extends Omit<
    TextInputProps,
    "value" | "defaultValue" | "onChange" | "type" | "inputMode" | "iconLeft"
  > {
  /**
   * Controlled value, in **minor units** (cents for USD, whole yen for JPY).
   * `null` renders an empty field. Omit entirely for uncontrolled use.
   */
  value?: number | null;
  /** Uncontrolled initial value, in minor units. */
  defaultValue?: number | null;
  /** Fired with the parsed minor-unit value — `null` when the field is empty. */
  onValueChange?: (minorUnits: number | null) => void;
  /** ISO 4217 currency code; drives the symbol + fraction digits. Default `"USD"`. */
  currency?: string;
  /** BCP-47 locale for the symbol, grouping, and decimal separator. Default `"en-US"`. */
  locale?: string;
  /** Allow negative amounts. Default `false`. */
  allowNegative?: boolean;
  /** Lower bound in minor units; parsed values are clamped up to it. */
  min?: number;
  /** Upper bound in minor units; parsed values are clamped down to it. */
  max?: number;
  /** Hide the leading currency-label adornment (the ISO code, e.g. "USD"). Default `false`. */
  hideSymbol?: boolean;
}

/**
 * A guided currency field. As the user types it **auto-groups live** ("1234567" →
 * "1,234,567"), keeps the caret where they expect it (tracked in value-space, not
 * raw offsets, so the injected separators never make the cursor jump), and pads the
 * fraction to the settled form only on blur. It speaks **integer minor units** via
 * `value` / `onValueChange` — never a float. Domain-agnostic on purpose: wrap it
 * (e.g. finance's `MoneyInput`) to adapt the minor-unit contract to a branded type.
 */
function CurrencyInput({
  value,
  defaultValue,
  onValueChange,
  currency = "USD",
  locale = "en-US",
  allowNegative = false,
  min,
  max,
  hideSymbol = false,
  className,
  onFocus,
  onBlur,
  onKeyDown,
  ...props
}: CurrencyInputProps) {
  const config = useMemo(() => resolveCurrencyConfig(locale, currency), [locale, currency]);
  const isControlled = value !== undefined;
  const [internalMinor, setInternalMinor] = useState<number | null>(defaultValue ?? null);
  const currentMinor = isControlled ? (value ?? null) : internalMinor;

  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");

  const inputRef = useRef<HTMLInputElement | null>(null);
  // Caret to restore after a re-render re-writes the controlled value (which would
  // otherwise drop the cursor at the end). Null when there's nothing to restore.
  const pendingCaret = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (pendingCaret.current !== null && inputRef.current) {
      inputRef.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  });

  const commit = (minor: number | null) => {
    if (!isControlled) setInternalMinor(minor);
    onValueChange?.(minor);
  };

  /** Reformat `raw` (with the caret at `rawCaret`), update state, and stage the caret. */
  const applyEdit = (raw: string, rawCaret: number) => {
    const formatted = formatDraft(raw, config, allowNegative);
    const parsed = parseToMinor(formatted, config, allowNegative);
    const clamped = clampMinor(parsed, min, max);

    if (clamped !== parsed && clamped !== null) {
      // Hit a bound — snap the field to the clamped value and park the caret at the end.
      const snapped = formatMinor(clamped, config, true);
      setDraft(snapped);
      pendingCaret.current = snapped.length;
    } else {
      const valueChars = countValueCharsBefore(raw, rawCaret, config);
      setDraft(formatted);
      pendingCaret.current = caretForValueChars(formatted, valueChars, config);
    }
    commit(clamped);
  };

  const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    setFocused(true);
    setDraft(currentMinor === null ? "" : formatMinor(currentMinor, config, true));
    onFocus?.(event);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const el = event.target;
    applyEdit(el.value, el.selectionStart ?? el.value.length);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    // Backspace immediately after a grouping separator: without help the browser
    // deletes only the separator (which we re-add), so nothing appears to happen.
    // Intercept and delete the digit *before* the separator instead.
    const el = event.currentTarget;
    const caret = el.selectionStart;
    if (
      event.key === "Backspace" &&
      caret !== null &&
      caret >= 2 &&
      caret === el.selectionEnd &&
      el.value[caret - 1] === config.group
    ) {
      event.preventDefault();
      applyEdit(el.value.slice(0, caret - 2) + el.value.slice(caret - 1), caret - 2);
    }
  };

  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    setFocused(false);
    onBlur?.(event);
  };

  // Focused: the live draft. At rest: the grouped, fraction-padded value (or empty).
  const displayValue = focused
    ? draft
    : currentMinor === null
      ? ""
      : formatMinor(currentMinor, config, true);

  // The leading adornment is the ISO currency *label* (e.g. "USD", "SGD", "MYR"),
  // not a one-glyph symbol. A 3-letter code is far wider than a "$", so TextInput's
  // default icon padding (`pl-9`, sized for a symbol) is too tight — widen it to
  // `pl-14` so the typed value clears the label. Gated on `config.symbol` so a
  // currency Intl can't resolve renders no adornment (and keeps normal padding).
  const showLabel = !hideSymbol && !!config.symbol;

  return (
    <TextInput
      {...props}
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={displayValue}
      className={cn(showLabel && "pl-14", className, "font-bold")}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      onBlur={handleBlur}
      iconLeft={showLabel ? config.currency : undefined}
    />
  );
}

export { CurrencyInput };
