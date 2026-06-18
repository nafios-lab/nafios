import { Camera, Loader2 } from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";
import { ACCEPTED_AVATAR_TYPES, validateAvatarFile } from "../internal/avatar-validation.ts";
import { fitAvatar } from "../internal/crop-image.ts";
import { cn } from "../lib/utils.ts";
import { Text } from "./typography/text.tsx";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  type AvatarProps,
  avatarVariants,
} from "./ui/avatar.tsx";

export interface AvatarUploadProps {
  /** Current image — a processed data URL or a remote URL. */
  value?: string;
  /** Called with the processed data URL, or `undefined` when removed. */
  onChange: (value: string | undefined) => void;
  /** Initials shown when no image is set. */
  fallback?: string;
  /** Field label. */
  label?: string;
  /** Helper line under the label. */
  helperText?: string;
  /** Shows an "Optional" chip next to the label. */
  optional?: boolean;
  /** Avatar size — maps to the Avatar primitive. @default "lg" */
  size?: AvatarProps["size"];
  disabled?: boolean;
  className?: string;
}

/**
 * Avatar picker with a built-in auto-fit helper: on selection the chosen image
 * is validated, center-cropped to a square, downscaled, and re-encoded, then
 * surfaced as a data URL via `onChange`. The circle mask is the Avatar
 * primitive's `rounded-full`. Holds nothing itself — fully controlled.
 *
 * The whole row is the click target — clicking anywhere opens the file picker.
 */
export function AvatarUpload({
  value,
  onChange,
  fallback,
  label = "Photo or avatar",
  helperText = "PNG or JPG, square works best.",
  optional = false,
  size = "lg",
  disabled = false,
  className,
}: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slotDisabled = disabled || isProcessing;

  const openPicker = () => inputRef.current?.click();

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so selecting the same file again still fires change.
    e.target.value = "";
    if (!file) return;

    setError(null);
    const result = validateAvatarFile(file);
    if (!result.ok) {
      setError(result.message);
      return;
    }

    setIsProcessing(true);
    try {
      onChange(await fitAvatar(file));
    } catch {
      setError("Couldn't process that image. Try another.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemove = () => {
    setError(null);
    onChange(undefined);
  };

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_AVATAR_TYPES.join(",")}
        className="hidden"
        onChange={handleFile}
        disabled={disabled}
      />

      <div className="flex items-center gap-3">
        {/* Whole row is the click target — opens the file picker. */}
        <button
          type="button"
          onClick={openPicker}
          disabled={slotDisabled}
          aria-label={value ? "Change photo" : "Upload photo"}
          className="group flex flex-1 cursor-pointer items-center gap-3 rounded-xl p-2 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50"
        >
          {value ? (
            <Avatar size={size} className="relative">
              <AvatarImage src={value} alt="" />
              <AvatarFallback>{fallback}</AvatarFallback>
              {isProcessing && (
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </span>
              )}
            </Avatar>
          ) : (
            <span
              className={cn(
                avatarVariants({ size }),
                "flex items-center justify-center border-2 border-dashed border-muted-foreground/30 bg-muted/50 text-muted-foreground transition-colors group-hover:border-brand/50",
              )}
            >
              {isProcessing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Camera className="size-4" />
              )}
            </span>
          )}

          <span className="flex flex-col">
            <span className="flex items-center gap-2">
              <Text as="span" size="sm" className="font-medium">
                {label}
              </Text>
              {optional && (
                <Text as="span" size="xs" muted className="uppercase tracking-widest font-medium">
                  Optional
                </Text>
              )}
            </span>
            {helperText && (
              <Text as="span" size="xs" muted>
                {helperText}
              </Text>
            )}
            <Text
              as="span"
              size="xs"
              className="mt-0.5 font-medium text-brand group-hover:underline"
            >
              {value ? "Change photo" : "Upload Photo"}
            </Text>
          </span>
        </button>

        {value && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled}
            className="cursor-pointer text-xs font-medium text-muted-foreground transition-colors hover:text-destructive hover:underline disabled:cursor-default disabled:opacity-50"
          >
            Remove
          </button>
        )}
      </div>

      {error && (
        <Text size="xs" className="px-2 text-destructive">
          {error}
        </Text>
      )}
    </div>
  );
}
