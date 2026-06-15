import { useCallback, useEffect, useRef } from "react";
import { type Mask, type Options, withMask } from "use-mask-input";
import { TextInput, type TextInputProps } from "../text-input.tsx";

interface MaskInputProps extends Omit<TextInputProps, "onChange"> {
  mask: Mask;
  maskOptions?: Options;
  /** Called with the current input value whenever it changes.
   *  Use this instead of onChange — inputmask swallows the native "input"
   *  event (preventDefault) so React's synthetic onChange never fires. */
  onValueChange?: (value: string) => void;
}

function MaskInput({ mask, maskOptions, onValueChange, ...props }: MaskInputProps) {
  const nodeRef = useRef<HTMLInputElement | null>(null);
  const onValueChangeRef = useRef(onValueChange);
  onValueChangeRef.current = onValueChange;

  // Stable ref callback: only re-init the mask when `mask` changes.
  const combinedRef = useCallback(
    (node: HTMLInputElement | null) => {
      nodeRef.current = node;
      withMask(mask, { showMaskOnHover: false, ...maskOptions })(node);
    },
    [mask, maskOptions],
  );

  // Capture-phase "input" listener — fires before inputmask's bubble-phase
  // handler can call e.preventDefault(), so React would otherwise never
  // see this event.
  useEffect(() => {
    const el = nodeRef.current;
    if (!el) return;

    const handler = () => {
      onValueChangeRef.current?.(el.value);
    };

    el.addEventListener("input", handler, true);
    return () => el.removeEventListener("input", handler, true);
  }, []);

  // No-op onChange: the real change path is the capture-phase "input" listener
  // above (inputmask swallows the synthetic event). React still needs *an*
  // onChange to treat the controlled `value` as writable — without it, it warns
  // "value without onChange = read-only" on every render.
  return <TextInput {...props} ref={combinedRef} onChange={() => {}} />;
}

export { MaskInput, type MaskInputProps };
