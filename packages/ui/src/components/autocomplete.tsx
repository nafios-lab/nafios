import { cva, type VariantProps } from "class-variance-authority";
import { Check, ChevronDown, X } from "lucide-react";
import type * as React from "react";
import { useId, useMemo, useRef, useState } from "react";
import { cn } from "../lib/utils.ts";
import { Label } from "./ui/label.tsx";
import { Popover, PopoverAnchor, PopoverContent } from "./ui/popover.tsx";

const autocompleteVariants = cva(
  "flex h-9 w-full items-center rounded-full border bg-card px-3 py-1 text-base shadow-sm transition-colors md:text-sm",
  {
    variants: {
      variant: {
        default: "border-input focus-within:ring-1 focus-within:ring-ring",
        error:
          "border-destructive focus-within:ring-1 focus-within:ring-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface AutocompleteOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface AutocompleteProps
  extends VariantProps<typeof autocompleteVariants> {
  /** Currently selected value. */
  value?: string;
  /** Called when the selection changes. */
  onValueChange?: (value: string) => void;
  /** Options to search and select from. */
  options: AutocompleteOption[];
  /** Placeholder text for the search input. */
  placeholder?: string;
  label?: string;
  helperText?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  /** Text shown when no options match the search. */
  emptyMessage?: string;
}

function Autocomplete({
  value,
  onValueChange,
  options,
  placeholder = "Search...",
  label,
  helperText,
  error,
  disabled,
  variant,
  className,
  id: idProp,
  emptyMessage = "No results found.",
}: AutocompleteProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const resolvedVariant = error ? "error" : variant;

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(lower));
  }, [options, search]);

  function handleSelect(optionValue: string) {
    onValueChange?.(optionValue);
    setSearch("");
    setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onValueChange?.("");
    setSearch("");
    inputRef.current?.focus();
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSearch(e.target.value);
    if (!open) setOpen(true);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      setSearch("");
    }
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <Label htmlFor={id} className={cn(error && "text-destructive")}>
          {label}
        </Label>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div
            className={cn(
              autocompleteVariants({ variant: resolvedVariant }),
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <input
              ref={inputRef}
              id={id}
              type="text"
              role="combobox"
              aria-expanded={open}
              aria-controls={`${id}-listbox`}
              aria-invalid={!!error}
              aria-describedby={
                error ? `${id}-error` : helperText ? `${id}-helper` : undefined
              }
              aria-autocomplete="list"
              disabled={disabled}
              placeholder={selectedOption ? selectedOption.label : placeholder}
              value={search}
              onChange={handleInputChange}
              onFocus={() => !disabled && setOpen(true)}
              onKeyDown={handleKeyDown}
              className={cn(
                "flex-1 bg-transparent outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed",
                selectedOption && !search && "placeholder:text-foreground",
              )}
            />
            {value && !disabled ? (
              <button
                type="button"
                onClick={handleClear}
                className="ml-1 text-muted-foreground hover:text-foreground"
                aria-label="Clear selection"
                tabIndex={-1}
              >
                <X className="size-4" />
              </button>
            ) : (
              <ChevronDown className="ml-1 size-4 shrink-0 opacity-50" />
            )}
          </div>
        </PopoverAnchor>
        <PopoverContent
          id={`${id}-listbox`}
          role="listbox"
          className="w-(--radix-popper-anchor-width) p-1"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {filtered.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </p>
          ) : (
            filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={value === option.value}
                disabled={option.disabled}
                onClick={() => handleSelect(option.value)}
                className={cn(
                  "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-muted hover:text-foreground",
                  option.disabled && "pointer-events-none opacity-50",
                  value === option.value && "bg-muted text-foreground",
                )}
              >
                {value === option.value && (
                  <span className="absolute left-2 flex size-3.5 items-center justify-center">
                    <Check className="size-4" />
                  </span>
                )}
                {option.label}
              </button>
            ))
          )}
        </PopoverContent>
      </Popover>
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
      {!error && helperText && (
        <p id={`${id}-helper`} className="text-xs text-muted-foreground">
          {helperText}
        </p>
      )}
    </div>
  );
}

export { Autocomplete, autocompleteVariants };
