import { type Money, moneyFromCents, toCents } from "@nafios/finance";
import { CurrencyInput, type CurrencyInputProps } from "@nafios/ui/components/currency-input";

// numeric(12,2) max magnitude, in cents — keep the field inside the range
// `moneyFromCents` accepts so a stray extra digit is clamped, not thrown.
const MAX_CENTS = 999_999_999_999;

export interface MoneyInputProps
  extends Omit<
    CurrencyInputProps,
    "value" | "defaultValue" | "onValueChange" | "currency" | "min" | "max"
  > {
  /** Controlled value as `Money`. `null` renders an empty field. */
  value?: Money | null;
  /** Uncontrolled initial value as `Money`. */
  defaultValue?: Money | null;
  /** Fired with the input transformed into `Money` — `null` when the field is empty. */
  onValueChange?: (value: Money | null) => void;
}

/**
 * The finance-facing currency field: identical UX to `@nafios/ui`'s `CurrencyInput`
 * but typed in `Money` on both sides of the wire. It adapts the primitive's
 * minor-unit contract to the branded money type — `Money` *is* cents and SGD's
 * minor unit is also the cent (2 dp), so the two line up exactly via `toCents` /
 * `moneyFromCents`. `Money` carries no currency code (finance is single-currency),
 * so `currency="SGD"` is a display-only choice — it drives the ISO label + fraction
 * digits and nothing about the stored value.
 */
export function MoneyInput({
  value,
  defaultValue,
  onValueChange,
  allowNegative,
  ...props
}: MoneyInputProps) {
  return (
    <CurrencyInput
      {...props}
      currency="SGD"
      allowNegative={allowNegative}
      min={allowNegative ? -MAX_CENTS : 0}
      max={MAX_CENTS}
      value={value === undefined ? undefined : value === null ? null : toCents(value)}
      defaultValue={defaultValue == null ? defaultValue : toCents(defaultValue)}
      onValueChange={
        onValueChange
          ? (minor) => onValueChange(minor === null ? null : moneyFromCents(minor))
          : undefined
      }
    />
  );
}
