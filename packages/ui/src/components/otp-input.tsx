import { REGEXP_ONLY_DIGITS } from "input-otp";
import { useId } from "react";
import { cn } from "../lib/utils.ts";
import { Text } from "./typography/text.tsx";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "./ui/input-otp.tsx";
import { Label } from "./ui/label.tsx";

export interface OtpInputProps {
  /** Number of OTP digits/characters. Defaults to 6. */
  length?: number;
  /** Value for controlled usage. */
  value?: string;
  /** Called on every character change. */
  onChange?: (value: string) => void;
  /** Called when all slots are filled. */
  onComplete?: (value: string) => void;
  /** Optional label above the input. */
  label?: string;
  /** Helper text displayed below the input. */
  helperText?: string;
  /** Error message — replaces helperText when present. */
  error?: string;
  /** Disables the input. */
  disabled?: boolean;
  /** Regex pattern to restrict input. Defaults to digits only. */
  pattern?: string;
  /**
   * Insert a visual separator after every N slots.
   * E.g. `3` with length 6 → two groups of 3 separated by a dot.
   * Defaults to half of `length` (rounded down). Set to `0` to disable.
   */
  groupSize?: number;
  /** Additional class name on the root wrapper. */
  className?: string;
}

function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  label,
  helperText,
  error,
  disabled,
  pattern = REGEXP_ONLY_DIGITS,
  groupSize: groupSizeProp,
  className,
}: OtpInputProps) {
  const autoId = useId();
  const groupSize = groupSizeProp !== undefined ? groupSizeProp : Math.floor(length / 2);

  // Build groups of slot indices
  const indices = Array.from({ length }, (_, i) => i);
  const groups: number[][] = [];
  if (groupSize > 0) {
    for (let i = 0; i < length; i += groupSize) {
      groups.push(indices.slice(i, i + groupSize));
    }
  } else {
    groups.push(indices);
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && <Label className={cn(error && "text-error-foreground")}>{label}</Label>}

      <InputOTP
        maxLength={length}
        value={value}
        onChange={onChange}
        onComplete={onComplete}
        disabled={disabled}
        pattern={pattern}
        aria-invalid={!!error}
        aria-describedby={error ? `${autoId}-error` : helperText ? `${autoId}-helper` : undefined}
      >
        {groups.map((slots, gi) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: groups are static
          <span key={gi} className="flex items-center gap-2">
            {gi > 0 && <InputOTPSeparator />}
            <InputOTPGroup>
              {slots.map((slotIndex) => (
                <InputOTPSlot key={slotIndex} index={slotIndex} />
              ))}
            </InputOTPGroup>
          </span>
        ))}
      </InputOTP>

      {error && (
        <Text id={`${autoId}-error`} size="xs" className="text-error-foreground">
          {error}
        </Text>
      )}
      {!error && helperText && (
        <Text id={`${autoId}-helper`} size="xs" muted>
          {helperText}
        </Text>
      )}
    </div>
  );
}

export { OtpInput };
