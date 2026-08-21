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

export interface ConfirmDialogProps {
  /**
   * Element that opens the dialog. Optional: omit it when driving the dialog
   * in controlled mode via `open` / `onOpenChange`.
   */
  trigger?: React.ReactNode;
  /** Controlled open state. Pair with `onOpenChange`. */
  open?: boolean;
  /**
   * Controlled open-state handler. Reports OPEN STATE only - it fires behind every
   * close, including the one that rides in right after a confirm. Never map it to
   * "the user declined"; use `onReject` for that.
   */
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  /**
   * The user turned the question down - cancel, Esc, overlay click, or the X.
   * Guaranteed AT MOST ONCE per open cycle, and never after `onConfirm`.
   */
  onReject?: () => void;
  onConfirm: () => void;
  hideConfirm?: boolean;
}

export function ConfirmDialog({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  hideConfirm = false,
  onReject,
  onConfirm,
}: ConfirmDialogProps) {
  /**
   * The outcome already reported for the CURRENT open cycle, held in a ref because
   * the decision and the close it triggers land in the same tick. Radix wraps both
   * buttons in `DialogClose`, so a click reports its outcome and then closes, and
   * that close is indistinguishable from an Esc/overlay dismissal at the
   * `onOpenChange` boundary. Recording the outcome first lets the close handler
   * tell "nobody decided, so this is a dismissal" from "this is the echo of a
   * decision" - and keeps every caller from having to make that call itself.
   */
  const outcomeRef = useRef<"confirm" | "reject" | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          outcomeRef.current = null;
          onOpenChange?.(true);
          return;
        }

        const decided = outcomeRef.current;
        outcomeRef.current = null;

        onOpenChange?.(false);

        /** Closed with no decision behind it: Esc, overlay, or the X - a rejection. */
        if (decided === null) onReject?.();
      }}
    >
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={description ? undefined : "sr-only"}>
            {description || `${title} confirmation dialog`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button
              onClick={() => {
                outcomeRef.current = "reject";
                onReject?.();
              }}
              variant="outline"
            >
              {cancelLabel}
            </Button>
          </DialogClose>
          {!hideConfirm && (
            <DialogClose asChild>
              <Button
                variant={variant === "destructive" ? "destructive" : "default"}
                onClick={() => {
                  outcomeRef.current = "confirm";
                  onConfirm();
                }}
              >
                {confirmLabel}
              </Button>
            </DialogClose>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
