import { Checkbox } from "@nafios/ui/components/ui/checkbox";
import { cn } from "@nafios/ui/lib/utils";
import { useState } from "react";

export interface SaveDefaultsCheckboxProps {
  /** Controlled checked state. Omit to let the component manage its own. */
  checked?: boolean;
  /** Uncontrolled initial state. Defaults to checked. */
  defaultChecked?: boolean;
  /** Fired when the user toggles the checkbox. */
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
}

/**
 * "Update my saved defaults with these values" opt-in, shown below the
 * create-ledger form. UI only for now — it carries no persistence; wire
 * `onCheckedChange` up when the save-defaults path lands.
 */
export function SaveDefaultsCheckbox({
  checked,
  defaultChecked = true,
  onCheckedChange,
  className,
}: SaveDefaultsCheckboxProps) {
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  const isChecked = checked ?? internalChecked;

  return (
    <div className={cn("rounded-xl border bg-muted/40 px-4 py-3.5", className)}>
      <Checkbox
        variant="brand"
        checked={isChecked}
        onCheckedChange={(next) => {
          const value = next === true;
          setInternalChecked(value);
          onCheckedChange?.(value);
        }}
        label="Update my saved defaults with these values"
      />
    </div>
  );
}
