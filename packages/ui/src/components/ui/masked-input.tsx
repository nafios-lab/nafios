import type * as React from "react";
import { type Mask, type Options, withMask } from "use-mask-input";
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
