import { AlertCircle } from "lucide-react";
import type * as React from "react";
import { useRef } from "react";
import { Button } from "./ui/button.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog.tsx";

export interface ErrorDialogProps {
  /**
   * Element that opens the dialog. Optional: omit it when driving the dialog
   * in controlled mode via `open` / `onOpenChange`.
   */
  trigger?: React.ReactNode;
  /** Controlled open state. Pair with `onOpenChange`. */
  open?: boolean;
  /** Controlled open-state handler. Required when `open` is provided. */
  onOpenChange?: (open: boolean) => void;
  title?: string;
  description?: string;
  /**
   * Optional secondary detail (e.g. a technical message or error code) shown
   * in a de-emphasised block below the description.
   */
  details?: string;
  dismissLabel?: string;
  retryLabel?: string;
  /** When provided, a retry action is shown alongside the dismiss button. */
  onRetry?: () => void;
  /** Called when the dialog is dismissed via the dismiss button. */
  onDismiss?: () => void;
}

export function ErrorDialog({
  trigger,
  open,
  onOpenChange,
  title = "Something went wrong",
  description,
  details,
  dismissLabel = "Dismiss",
  retryLabel = "Try again",
  onRetry,
  onDismiss,
}: ErrorDialogProps) {
  // Freeze the copy shown while the dialog is open. Radix keeps the content
  // mounted for its ~200ms close animation, so if a parent clears the state
  // that derives `title`/`description` on dismiss, the live props would flash
  // placeholder/default copy during the fade-out. Reading from the last
  // open-state snapshot keeps the closing card visually stable.
  const shown = useRef({ title, description, details, dismissLabel, retryLabel });
  if (open !== false) {
    shown.current = { title, description, details, dismissLabel, retryLabel };
  }
  const content = shown.current;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent>
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-error text-error-foreground">
              <AlertCircle className="size-5" aria-hidden="true" />
            </span>
            <div className="grid gap-1.5">
              <DialogTitle>{content.title}</DialogTitle>
              <DialogDescription className={content.description ? undefined : "sr-only"}>
                {content.description || `${content.title} error dialog`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        {content.details ? (
          <p className="max-h-40 overflow-auto rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
            {content.details}
          </p>
        ) : null}
        <DialogFooter>
          {onRetry && (
            <DialogClose asChild>
              <Button variant="outline" onClick={onRetry}>
                {content.retryLabel}
              </Button>
            </DialogClose>
          )}
          <DialogClose asChild>
            <Button variant="default" onClick={onDismiss}>
              {content.dismissLabel}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
