import type { UpdateLedgerResult } from "@nafios/finance";

export type LedgerUpdateRejection = Extract<UpdateLedgerResult, { ok: false }>["reason"];

export type BlockedLedgerUpdateRejection = Exclude<LedgerUpdateRejection, "overspend_warning">;

export interface RejectionCopy {
  readonly title: string;
  readonly description: string;
}

export const UPDATE_LEDGER_REJECTION_TOASTS_MAP: Record<
  BlockedLedgerUpdateRejection,
  RejectionCopy
> = {
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

export const STALE_ROW_REASONS: ReadonlySet<BlockedLedgerUpdateRejection> = new Set([
  "ledger_not_found",
  "ledger_not_ongoing",
]);

export const ACK_OVERSPEND_COPY: RejectionCopy = {
  title: "That leaves your spending cap above your balance",
  description:
    "Your cap is higher than this opening balance, so the month is set up to run at a deficit — you'd be drawing from savings. Acknowledge to save this balance anyway.",
};
