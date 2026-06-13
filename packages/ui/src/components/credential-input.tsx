import { Eye, EyeOff } from "lucide-react";
import { useCallback, useState } from "react";
import { cn } from "../lib/utils.ts";
import { TextInput, type TextInputProps } from "./text-input.tsx";

export interface CredentialInputProps extends Omit<TextInputProps, "type" | "iconRight"> {
  /** When true the value is displayed as plain text. Defaults to false (masked). */
  visible?: boolean;
  /** Called when the visibility toggle is clicked. Use for controlled mode. */
  onVisibilityChange?: (visible: boolean) => void;
}

function CredentialInput({
  visible: visibleProp,
  onVisibilityChange,
  className,
  ...props
}: CredentialInputProps) {
  const [visibleInternal, setVisibleInternal] = useState(false);
  const isControlled = visibleProp !== undefined;
  const visible = isControlled ? visibleProp : visibleInternal;

  const toggle = useCallback(() => {
    if (isControlled) {
      onVisibilityChange?.(!visible);
    } else {
      setVisibleInternal((v) => !v);
    }
  }, [isControlled, visible, onVisibilityChange]);

  const ToggleButton = (
    <button
      type="button"
      tabIndex={-1}
      aria-label={visible ? "Hide credential" : "Show credential"}
      onClick={toggle}
      className={cn(
        "pointer-events-auto flex size-4 cursor-pointer items-center justify-center border-none bg-transparent p-0 text-muted-foreground transition-colors hover:text-foreground",
      )}
    >
      {visible ? <EyeOff /> : <Eye />}
    </button>
  );

  return (
    <TextInput
      type={visible ? "text" : "password"}
      iconRight={ToggleButton}
      className={className}
      {...props}
    />
  );
}

export { CredentialInput };
