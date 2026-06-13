import type * as React from "react";
import { withMask, type Mask, type Options } from "use-mask-input";
import { Input } from "./input.tsx";

interface MaskInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  mask: Mask;
  maskOptions?: Options;
}

function MaskInput({ mask, maskOptions, ...props }: MaskInputProps) {
  return (
    <Input
      {...props}
      ref={withMask(mask, {
        showMaskOnHover: false,
        ...maskOptions,
      })}
    />
  );
}

export { MaskInput, type MaskInputProps };
