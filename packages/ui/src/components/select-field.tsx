import { cva, type VariantProps } from "class-variance-authority";
import { Check, ChevronDown, ChevronUp, Search, X } from "lucide-react";
import type * as React from "react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "../lib/utils.ts";
import { Text } from "./typography/text.tsx";
import { Label } from "./ui/label.tsx";
import { Popover, PopoverAnchor, PopoverContent } from "./ui/popover.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select.tsx";

const selectFieldVariants = cva("", {
  variants: {
    variant: {
      default: "[&>button]:border-input [&>button]:focus:ring-ring",
      error: "[&>button]:border-destructive [&>button]:focus:ring-destructive",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

const searchableTriggerVariants = cva(
  "flex h-9 w-full items-center justify-between gap-2 rounded-full border bg-card px-3 py-1 text-md shadow-sm transition-colors md:text-sm",
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

/** Height of a single option item in px (py-1.5 = 6px top+bottom + ~20px text). */
const ITEM_HEIGHT = 32;

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectFieldBaseProps extends VariantProps<
  typeof selectFieldVariants
> {
  /** Options to display. */
  options: SelectOption[];
  /** Placeholder text shown when nothing is selected. */
  placeholder?: string;
  label?: string;
  helperText?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  /** Enable inline search filtering within the dropdown. */
  searchable?: boolean;
  /** Max number of visible items before the dropdown scrolls. Defaults to 8. */
  maxVisibleItems?: number;
  /** Text shown when no options match the search (searchable mode only). */
  emptyMessage?: string;
}

interface SingleSelectFieldProps extends SelectFieldBaseProps {
  /** Enable multi-select mode. */
  multiple?: false;
  /** Currently selected value. */
  value?: string;
  /** Called when the selection changes. */
  onValueChange?: (value: string) => void;
}

interface MultiSelectFieldProps extends SelectFieldBaseProps {
  /** Enable multi-select mode. */
  multiple: true;
  /** Currently selected values. */
  value?: string[];
  /** Called when the selection changes. */
  onValueChange?: (value: string[]) => void;
}

export type SelectFieldProps = SingleSelectFieldProps | MultiSelectFieldProps;

function SelectField(props: SelectFieldProps) {
  const {
    options,
    placeholder = "Select an option",
    label,
    helperText,
    error,
    disabled,
    variant,
    className,
    id: idProp,
    searchable = false,
    maxVisibleItems = 8,
    emptyMessage = "No results found.",
  } = props;

  const autoId = useId();
  const id = idProp ?? autoId;
  const resolvedVariant = error ? "error" : variant;

  const labelNode = label && (
    <Label htmlFor={id} className={cn(error && "text-destructive")}>
      {label}
    </Label>
  );

  const errorNode = error && (
    <Text id={`${id}-error`} size="xs" className="text-destructive">
      {error}
    </Text>
  );

  const helperNode = !error && helperText && (
    <Text id={`${id}-helper`} size="xs" muted>
      {helperText}
    </Text>
  );

  const maxHeight = maxVisibleItems * ITEM_HEIGHT + 8; // 8px for p-1 padding
  const ariaDescribedBy =
    error ? `${id}-error` : helperText ? `${id}-helper` : undefined;

  if (props.multiple) {
    return (
      <MultiSelect
        id={id}
        value={props.value ?? []}
        onValueChange={props.onValueChange}
        options={options}
        placeholder={placeholder}
        disabled={disabled}
        variant={resolvedVariant}
        className={className}
        maxHeight={maxHeight}
        emptyMessage={emptyMessage}
        searchable={searchable}
        ariaDescribedBy={ariaDescribedBy}
      >
        {labelNode}
        {errorNode}
        {helperNode}
      </MultiSelect>
    );
  }

  if (searchable) {
    return (
      <SearchableSelect
        id={id}
        value={props.value}
        onValueChange={props.onValueChange}
        options={options}
        placeholder={placeholder}
        disabled={disabled}
        variant={resolvedVariant}
        className={className}
        maxHeight={maxHeight}
        emptyMessage={emptyMessage}
        ariaDescribedBy={ariaDescribedBy}
      >
        {labelNode}
        {errorNode}
        {helperNode}
      </SearchableSelect>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {labelNode}
      <div className={cn(selectFieldVariants({ variant: resolvedVariant }))}>
        <Select
          value={props.value}
          onValueChange={props.onValueChange}
          disabled={disabled}
        >
          <SelectTrigger
            id={id}
            aria-invalid={!!error}
            aria-describedby={ariaDescribedBy}
          >
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent style={{ maxHeight }} className="overflow-y-auto">
            {options.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {errorNode}
      {helperNode}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Internal searchable variant (Popover-based)                       */
/* ------------------------------------------------------------------ */

interface SearchableSelectProps {
  id: string;
  value?: string;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  disabled?: boolean;
  variant: "default" | "error" | null | undefined;
  className?: string;
  maxHeight: number;
  emptyMessage: string;
  ariaDescribedBy?: string;
  children: React.ReactNode;
}

function SearchableSelect({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  variant,
  className,
  maxHeight,
  emptyMessage,
  ariaDescribedBy,
  children,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  const updateScrollIndicators = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 0);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  }, []);

  const filtered = useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(lower));
  }, [options, search]);

  // Recalculate indicators when popover opens or filtered list changes.
  useEffect(() => {
    if (open) {
      const frame = requestAnimationFrame(updateScrollIndicators);
      return () => cancelAnimationFrame(frame);
    }
  }, [open, filtered, updateScrollIndicators]);

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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      setSearch("");
    }
  }

  // Extract label/error/helper from children
  const childArray = Array.isArray(children) ? children : [children];
  const labelNode = childArray[0];
  const errorNode = childArray[1];
  const helperNode = childArray[2];

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {labelNode}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <button
            type="button"
            onClick={() => !disabled && setOpen((o) => !o)}
            className={cn(
              searchableTriggerVariants({ variant }),
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <span className="flex flex-1 items-center truncate text-sm">
              {selectedOption ? (
                selectedOption.label
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
            </span>
            {value && !disabled ? (
              <span
                role="button"
                tabIndex={-1}
                onClick={handleClear}
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  handleClear(e as unknown as React.MouseEvent)
                }
                className="text-muted-foreground hover:text-foreground"
                aria-label="Clear selection"
              >
                <X className="size-4" />
              </span>
            ) : (
              <ChevronDown className="size-4 shrink-0 opacity-50" />
            )}
          </button>
        </PopoverAnchor>
        <PopoverContent
          id={`${id}-listbox`}
          role="listbox"
          className="w-(--radix-popper-anchor-width) p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex items-center border-b px-3 py-2">
            <Search className="mr-2 size-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded={open}
              aria-controls={`${id}-listbox`}
              aria-invalid={!!errorNode}
              aria-describedby={ariaDescribedBy}
              aria-autocomplete="list"
              disabled={disabled}
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          {canScrollUp && (
            <div className="flex items-center justify-center bg-muted/60 py-0.5">
              <ChevronUp className="size-3 text-muted-foreground" />
            </div>
          )}
          <div
            ref={listRef}
            className="overflow-y-auto p-1"
            style={{ maxHeight }}
            onScroll={updateScrollIndicators}
          >
            {filtered.length === 0 ? (
              <Text size="sm" muted className="px-2 py-4 text-center">
                {emptyMessage}
              </Text>
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
          </div>
          {canScrollDown && (
            <div className="flex items-center justify-center rounded-b-md bg-muted/60 py-0.5">
              <ChevronDown className="size-3 text-muted-foreground" />
            </div>
          )}
        </PopoverContent>
      </Popover>
      {errorNode}
      {helperNode}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Internal multi-select variant (Popover-based)                      */
/* ------------------------------------------------------------------ */

interface MultiSelectProps {
  id: string;
  value: string[];
  onValueChange?: (value: string[]) => void;
  options: SelectOption[];
  placeholder: string;
  disabled?: boolean;
  variant: "default" | "error" | null | undefined;
  className?: string;
  maxHeight: number;
  emptyMessage: string;
  searchable: boolean;
  ariaDescribedBy?: string;
  children: React.ReactNode;
}

function MultiSelect({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  variant,
  className,
  maxHeight,
  emptyMessage,
  searchable,
  ariaDescribedBy,
  children,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOptions = useMemo(
    () => options.filter((o) => value.includes(o.value)),
    [options, value],
  );

  const updateScrollIndicators = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 0);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  }, []);

  const filtered = useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(lower));
  }, [options, search]);

  useEffect(() => {
    if (open) {
      const frame = requestAnimationFrame(updateScrollIndicators);
      return () => cancelAnimationFrame(frame);
    }
  }, [open, filtered, updateScrollIndicators]);

  function handleToggle(optionValue: string) {
    if (!onValueChange) return;
    if (value.includes(optionValue)) {
      onValueChange(value.filter((v) => v !== optionValue));
    } else {
      onValueChange([...value, optionValue]);
    }
  }

  function handleRemove(optionValue: string, e: React.MouseEvent) {
    e.stopPropagation();
    onValueChange?.(value.filter((v) => v !== optionValue));
  }

  function handleClearAll(e: React.MouseEvent) {
    e.stopPropagation();
    onValueChange?.([]);
    setSearch("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      setSearch("");
    }
  }

  const childArray = Array.isArray(children) ? children : [children];
  const labelNode = childArray[0];
  const errorNode = childArray[1];
  const helperNode = childArray[2];

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {labelNode}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <button
            type="button"
            onClick={() => !disabled && setOpen((o) => !o)}
            className={cn(
              searchableTriggerVariants({ variant }),
              "h-auto min-h-9 flex-wrap",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            {selectedOptions.length === 0 ? (
              <Text as="span" size="sm" muted className="flex-1 truncate text-left">
                {placeholder}
              </Text>
            ) : (
              <span className="flex flex-1 flex-wrap items-center gap-1 py-0.5">
                {selectedOptions.map((opt) => (
                  <span
                    key={opt.value}
                    className="inline-flex items-center gap-0.5 rounded-full border bg-muted px-2 py-0.5 text-xs"
                  >
                    {opt.label}
                    {!disabled && (
                      <span
                        role="button"
                        tabIndex={-1}
                        onClick={(e) => handleRemove(opt.value, e)}
                        onKeyDown={(e) =>
                          e.key === "Enter" &&
                          handleRemove(
                            opt.value,
                            e as unknown as React.MouseEvent,
                          )
                        }
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={`Remove ${opt.label}`}
                      >
                        <X className="size-3" />
                      </span>
                    )}
                  </span>
                ))}
              </span>
            )}
            {value.length > 0 && !disabled ? (
              <span
                role="button"
                tabIndex={-1}
                onClick={handleClearAll}
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  handleClearAll(e as unknown as React.MouseEvent)
                }
                className="text-muted-foreground hover:text-foreground"
                aria-label="Clear all selections"
              >
                <X className="size-4" />
              </span>
            ) : (
              <ChevronDown className="size-4 shrink-0 opacity-50" />
            )}
          </button>
        </PopoverAnchor>
        <PopoverContent
          id={`${id}-listbox`}
          role="listbox"
          aria-multiselectable="true"
          className="w-(--radix-popper-anchor-width) p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {searchable && (
            <div className="flex items-center border-b px-3 py-2">
              <Search className="mr-2 size-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded={open}
                aria-controls={`${id}-listbox`}
                aria-invalid={!!errorNode}
                aria-describedby={ariaDescribedBy}
                aria-autocomplete="list"
                disabled={disabled}
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          )}
          {canScrollUp && (
            <div className="flex items-center justify-center bg-muted/60 py-0.5">
              <ChevronUp className="size-3 text-muted-foreground" />
            </div>
          )}
          <div
            ref={listRef}
            className="overflow-y-auto p-1"
            style={{ maxHeight }}
            onScroll={updateScrollIndicators}
          >
            {filtered.length === 0 ? (
              <Text size="sm" muted className="px-2 py-4 text-center">
                {emptyMessage}
              </Text>
            ) : (
              filtered.map((option) => {
                const isSelected = value.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={option.disabled}
                    onClick={() => handleToggle(option.value)}
                    className={cn(
                      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-muted hover:text-foreground",
                      option.disabled && "pointer-events-none opacity-50",
                      isSelected && "bg-muted text-foreground",
                    )}
                  >
                    <span className="absolute left-2 flex size-3.5 items-center justify-center">
                      {isSelected && <Check className="size-4" />}
                    </span>
                    {option.label}
                  </button>
                );
              })
            )}
          </div>
          {canScrollDown && (
            <div className="flex items-center justify-center rounded-b-md bg-muted/60 py-0.5">
              <ChevronDown className="size-3 text-muted-foreground" />
            </div>
          )}
        </PopoverContent>
      </Popover>
      {errorNode}
      {helperNode}
    </div>
  );
}

export { SelectField, selectFieldVariants };
