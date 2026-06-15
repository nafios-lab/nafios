import { Calendar } from "lucide-react";
import { MaskInput, type MaskInputProps } from "./ui/masked-input.tsx";

export interface DobInputProps extends Omit<MaskInputProps, "mask" | "maskOptions"> {
  /** Date format shown as placeholder. Defaults to "DD / MM / YYYY". */
  formatHint?: string;
}

function DobInput({ placeholder = "DD / MM / YYYY", formatHint, ...props }: DobInputProps) {
  return (
    <MaskInput
      mask="99 / 99 / 9999"
      maskOptions={{
        placeholder: formatHint ?? "DD / MM / YYYY",
        showMaskOnFocus: true,
        showMaskOnHover: false,
      }}
      placeholder={placeholder}
      inputMode="numeric"
      iconLeft={<Calendar />}
      {...props}
    />
  );
}

export { DobInput };
