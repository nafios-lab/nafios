import {
  createLedgerCommands,
  type GetLedgerQueryResp,
  type Money,
  type UpdateOpeningBalanceResult,
} from "@nafios/finance";
import { toast } from "@nafios/ui/components/ui/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtom, useAtomValue, useStore } from "jotai";
import { useCallback, useRef, useState } from "react";
import { getFinanceClient } from "../lib/finance-client";
import {
  BLOCKED_OPENING_BAL_TOASTS,
  type BlockedOpeningBalReason,
  STALE_ROW_REASONS,
} from "../lib/openin-bal-rejection";
import {
  _ledgerInSession,
  _metrics_openingBalance,
  _startLedgerSession,
} from "../state/ledger-sheet/ledger-sheet.atoms";
import { ledgerQueryOptions } from "./use-ledger";

/** The rollback payload handed from `onMutate` to `onError` / `onSuccess`. */
interface UpdateOpeningBalContext {
  /** The last PERSISTED opening balance — the only correct rollback target. */
  readonly previous: Money | null;
}

/**
 * The `overspend_warning` decision, held while the dialog is open. It carries BOTH
 * outcomes so neither has to rederive anything: `value` is the retry payload for
 * "acknowledge", `previous` is the rollback target for "decline". `previous` has to
 * ride along because the optimistic paint is still on screen at this point - the
 * mutation settled `ok: false`, so `onError` never ran and nothing rolled it back.
 */
interface PendingOverspendAck {
  readonly value: Money;
  readonly previous: Money | null;
}

export function useOptimisticOpeningBal() {
  const [openingBalance, setOpeningBalance] = useAtom(_metrics_openingBalance);
  const store = useStore();
  const ledger = useAtomValue(_ledgerInSession);

  const queryClient = useQueryClient();
  const [pendingAck, setPendingAck] = useState<PendingOverspendAck | null>(null);

  /**
   * The same decision as `pendingAck`, held where it can be claimed SYNCHRONOUSLY.
   * State renders the dialog; this ref resolves it - a `setPendingAck(null)` is not
   * visible to any closure built in the current render, so two handler calls landing
   * before the next paint (a double-click on confirm, say) would both still see a
   * non-null `pendingAck` and act twice. A ref clears immediately, so the first
   * outcome to land is the only one that gets a decision to act on.
   *
   * Which outcome that is, is `ConfirmDialog`'s job: it reports `onReject` at most
   * once per open cycle and never behind an `onConfirm`, so confirm-then-decline is
   * no longer a case this has to absorb.
   */
  const pendingRef = useRef<PendingOverspendAck | null>(null);

  /** Take the pending decision and retire it, in one indivisible step. */
  const claimPendingAck = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    setPendingAck(null);
    return pending;
  }, []);

  const notifyBlocked = useCallback(
    async (reason: BlockedOpeningBalReason) => {
      const copy = BLOCKED_OPENING_BAL_TOASTS[reason];
      toast.error(copy.title, {
        id: `opening-bal-rejected:${reason}`,
        description: copy.description,
        closeButton: true,
        duration: Infinity,
      });

      if (!STALE_ROW_REASONS.has(reason)) return;

      /**
       * Our row is wrong. Refetch AND re-seed the session by hand: OPTIMISTIC-UPDATES
       * Phase 3's seed-once ref means the sheet's effect will never do it for us.
       */
      const month = store.get(_ledgerInSession)?.month;
      if (!month) return;

      /**
       * `staleTime: 0` is REQUIRED - with the options `Infinity`, fetchQuery is a
       * cache read and would hand back the very rowthat jsut failed
       */

      const fresh = await queryClient.fetchQuery({ ...ledgerQueryOptions(month), staleTime: 0 });

      if (fresh.ledger) {
        store.set(_startLedgerSession, fresh.ledger);
      }
    },
    [store, queryClient],
  );

  const mutation = useMutation<
    UpdateOpeningBalanceResult,
    Error,
    { value: Money; ack: boolean },
    UpdateOpeningBalContext
  >({
    scope: { id: `ledger-opening-bal:${ledger?.id}` },
    mutationFn: ({ value, ack }) => {
      if (!ledger) throw new Error("no ledger in session");
      return createLedgerCommands(getFinanceClient()).updateOpeningBalance(ledger?.id, value, ack);
    },
    onMutate: ({ value }) => {
      const persisted = store.get(_ledgerInSession);
      store.set(_metrics_openingBalance, value);
      return {
        previous: persisted?.openingBalance ?? null,
      };
    },

    onError: (_error, _value, context) => {
      store.set(_metrics_openingBalance, context?.previous ?? null);
    },

    onSuccess: (result, vars, context) => {
      if (!result.ok) {
        if (result.reason === "overspend_warning") {
          /**
           * The one reason with a decision attached. Raise it as state; the component
           * renders the dialog. `vars.value` IS the retry payload - nothing to rederive.
           * We deliberately do NOT roll back here: the dialog asks about the value the
           * user is looking at, so the paint stays until they decide.
           */
          const pending = { value: vars.value, previous: context?.previous ?? null };
          pendingRef.current = pending;
          setPendingAck(pending);
          return;
        }

        // Terminal: nothing was written, so the paint is a lie. Roll back first.
        store.set(_metrics_openingBalance, context?.previous ?? null);

        /** Narrowed to BlockedOpeningBalReason here */
        void notifyBlocked(result.reason);
        return;
      }

      store.set(_metrics_openingBalance, result.ledger.openingBalance);
      store.set(_ledgerInSession, result.ledger);

      queryClient.setQueryData<GetLedgerQueryResp>(["finance", "ledger", result.ledger.month], {
        ledger: result.ledger,
      });
    },
  });

  const confirmOverspend = useCallback(() => {
    const pending = claimPendingAck();

    if (pending === null) return;

    /**
     * The retry is the SAME amount with the flag set - `pending.value` is what the
     * dialog just asked about, so nothing is rederived from the input, which the
     * user may well have moved on from while the dialog was open.
     */
    mutation.mutate({ value: pending.value, ack: true });
  }, [claimPendingAck, mutation.mutate]);

  const declineOverspend = useCallback(() => {
    const pending = claimPendingAck();

    /** Null means the decision is already spent - nothing left to undo. */
    if (pending === null) return;

    /**
     * Declining means nothing was ever written, so the optimistic paint is a lie -
     * same terminal-rejection path as `onError`, just reached by a user decision
     * instead of a failure. `pending.previous` is the value `onMutate` captured, so
     * this lands on the last PERSISTED balance and not on whatever the input holds.
     */
    store.set(_metrics_openingBalance, pending.previous);
  }, [claimPendingAck, store]);

  const cancelUpdate = useCallback(() => {
    if (ledger === null) return;
    store.set(_metrics_openingBalance, ledger.openingBalance);
  }, [ledger, store]);

  return {
    openingBalance,
    setOpeningBalance,
    mutate: mutation.mutate,
    confirmOverspend,
    declineOverspend,
    pendingAck,
    baseLedger: ledger,
    cancelUpdate,
  };
}
