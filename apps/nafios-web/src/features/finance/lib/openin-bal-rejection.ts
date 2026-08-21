import type { UpdateOpeningBalanceResult } from "@nafios/finance";

/**
 * Every reason THIS command can return. Derived from the command's own result,
 * not from the module-wide `LedgerRejectionReason` - a reason
 * added for a future
 * Ledger command must not force copy here. Same stance as create-ledger-form
 */
export type OpeningBalRejection = Extract<UpdateOpeningBalanceResult, { ok: false }>["reason"];

/**
 * The reasons that resolve as a TOAST.
 * `overspend_warning` is excluded becausse
 * it is teh only one with a decision attached - it derives the ConfirmDialog
 */
export type BlockedOpeningBalReason = Exclude<OpeningBalRejection, "overspend_warning">;

export interface ToastCopy {
  readonly title: string;
  readonly description: string;
}

/**
 * `Record<>` makes this exhaustive: a new blocked reason will not compile until
 *  it has copy here. */
export const BLOCKED_OPENING_BAL_TOASTS: Record<BlockedOpeningBalReason, ToastCopy> = {
  exceeds_hard_cap: {
    title: "That's too low for your current spending cap",
    description:
      "Your cap would be more than twice your opening balance. That can't be overridden — lower the cap first, then change the balance.",
  },
  negative_amount: {
    title: "Opening balance can't be negative",
    description: "Enter zero or more and try again.",
  },
  ledger_not_ongoing: {
    title: "This ledger is no longer open",
    description:
      "Its status changed somewhere else, so the header is locked. We've refreshed this month for you.",
  },
  ledger_not_found: {
    title: "This ledger no longer exists",
    description: "It was removed somewhere else. We've refreshed this month for you.",
  },
};

export const STALE_ROW_REASONS: ReadonlySet<BlockedOpeningBalReason> = new Set([
  "ledger_not_ongoing",
  "ledger_not_found",
]);

export const ACK_OVERSPEND_COPY: ToastCopy = {
  title: "That leaves your spending cap above your balance",
  description:
    "Your cap is higher than this opening balance, so the month is set up to run at a deficit — you'd be drawing from savings. Acknowledge to save this balance anyway.",
};
