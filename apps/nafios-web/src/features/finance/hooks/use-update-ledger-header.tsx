import {
  createLedgerCommands,
  type GetLedgerQueryResp,
  type Money,
  type UpdateLedgerResult,
} from "@nafios/finance";
import { toast } from "@nafios/ui/components/ui/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type PrimitiveAtom, useAtom, useAtomValue, useStore } from "jotai";
import { useCallback, useRef, useState } from "react";
import { getFinanceClient } from "../lib/finance-client";
import {
  type BlockedLedgerUpdateRejection,
  STALE_ROW_REASONS,
  UPDATE_LEDGER_REJECTION_TOASTS_MAP,
} from "../lib/ledger-header-update-rejection";
import {
  _ledgerInSession,
  _metrics_maxCapped,
  _metrics_openingBalance,
  _startLedgerSession,
} from "../state/ledger-sheet/ledger-sheet.atoms";
import { ledgerQueryOptions } from "./use-ledger";

/**
 * The rejection toast currently on screen, kept so the next SUCCESSFUL write can
 * dismiss it — the toasts are `duration: Infinity` (a rejection is a state, not a
 * notice), so nothing else would ever take them down.
 *
 * Module scope, not a ref, because the dismissal is cross-instance: fixing the
 * opening balance is what clears an `exceeds_hard_cap` complaint that the max-capped
 * card raised. The flip side is that only the newest toast is tracked, so if both
 * cards are rejected at once the older toast stays until the user closes it.
 */
let ERROR_TOAST_ID: string | number | null = null;

/** The rollback payload handed from `onMutate` to `onError` / `onSuccess`. */
interface UpdateFieldContext {
  /** The last PERSISTED value of the edited field — the only correct rollback target. */
  readonly previous: Money | null;
}

/**
 * The `overspend_warning` decision, held while the dialog is open. It carries BOTH
 * outcomes so neither has to rederive anything: `value` is the retry payload for
 * "acknowledge", `previous` is the rollback target for "decline". `previous` has to
 * ride along because the optimistic paint is still on screen at this point — the
 * mutation settled `ok: false`, so `onError` never ran and nothing rolled it back.
 */
interface PendingOverspendAck {
  readonly value: Money;
  readonly previous: Money | null;
}

/** The ledger-header money fields this hook can drive. */
type LedgerHeaderField = "openingBalance" | "maxCapped";

/**
 * Which atom mirrors which field. This map is the whole reason one hook can serve
 * both cards: everything else about the two edits — optimistic paint, rollback,
 * overspend acknowledgement, staleness recovery — is identical, and `updateLedger`
 * already takes the full header row rather than a per-field command.
 */
const FIELDS_ATOMS: Record<LedgerHeaderField, PrimitiveAtom<Money | null>> = {
  openingBalance: _metrics_openingBalance,
  maxCapped: _metrics_maxCapped,
};

export interface UseUpdateLedgerHeaderOptions {
  /** The header field this instance owns; picks the atom it paints and the key it writes. */
  field: LedgerHeaderField;
}

/**
 * Optimistic editing for a single ledger-header money field.
 *
 * The write is `updateLedger`, which takes the whole header: the session row is spread
 * and only `field` is overridden, so an edit is last-write-wins over the row this
 * session last saw persisted. Three outcomes come back and each is handled differently:
 *
 * - `ok` — the server row is authoritative: repaint from it, re-seat the session, and
 *   push it into the query cache so a remount doesn't refetch a row we already hold.
 * - `overspend_warning` — a decision, not a failure. The paint STAYS and the caller
 *   renders a dialog off `pendingAck`; `confirmAck` retries with the flag, `declineAck`
 *   rolls back.
 * - anything else — terminal. Roll back, then explain via toast (and refetch, if the
 *   reason means our row is stale).
 */
export function useUpdateLedgerHeader({ field }: UseUpdateLedgerHeaderOptions) {
  const [fieldValue, setFieldValue] = useAtom(FIELDS_ATOMS[field]);
  const [pendingAck, setPendingAck] = useState<PendingOverspendAck | null>(null);

  const store = useStore();
  const ledger = useAtomValue(_ledgerInSession);

  const queryClient = useQueryClient();

  /**
   * The same decision as `pendingAck`, held where it can be claimed SYNCHRONOUSLY.
   * State renders the dialog; this ref resolves it — a `setPendingAck(null)` is not
   * visible to any closure built in the current render, so two handler calls landing
   * before the next paint (a double-click on confirm, say) would both still see a
   * non-null `pendingAck` and act twice. A ref clears immediately, so the first
   * outcome to land is the only one that gets a decision to act on.
   */
  const pendingRef = useRef<PendingOverspendAck | null>(null);

  /** Take the pending decision and retire it, in one indivisible step. */
  const claimPendingAck = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    setPendingAck(null);
    return pending;
  }, []);

  /**
   * Explain a terminal rejection, and recover from it when the cause is our own
   * staleness. Assumes the caller has already rolled the paint back.
   */
  const notifyUpdateRejection = useCallback(
    async (reason: BlockedLedgerUpdateRejection) => {
      const copy = UPDATE_LEDGER_REJECTION_TOASTS_MAP[reason];
      /**
       * Keyed by reason so a repeated rejection updates one toast instead of stacking,
       * and `Infinity` because this describes a condition the user has to act on — it
       * is dismissed on the next successful write, or by the close button.
       */
      ERROR_TOAST_ID = toast.error(copy.title, {
        id: `opening-bal-rejected:${reason}`,
        description: copy.description,
        closeButton: true,
        duration: Infinity,
      });

      if (!STALE_ROW_REASONS.has(reason)) return;

      /**
       * Our row is wrong. Refetch AND re-seed the session by hand: the sheet's
       * seed-once ref means its effect will never do it for us.
       */
      const month = store.get(_ledgerInSession)?.month;
      if (!month) return;

      /**
       * `staleTime: 0` is REQUIRED — with the options' `Infinity`, `fetchQuery` is a
       * cache read and would hand back the very row that just failed.
       */
      const fresh = await queryClient.fetchQuery({ ...ledgerQueryOptions(month), staleTime: 0 });

      if (fresh.ledger) {
        store.set(_startLedgerSession, fresh.ledger);
      }
    },
    [store, queryClient],
  );

  const mutation = useMutation<
    UpdateLedgerResult,
    Error,
    { value: Money; ack: boolean },
    UpdateFieldContext
  >({
    /**
     * Scoped per field per ledger, so Query serializes the writes: an acknowledged
     * retry can never overtake the original, and a fast second edit of the same card
     * queues instead of racing. Two DIFFERENT fields still run concurrently — each
     * sends the whole header, so the later response wins the row.
     */
    scope: { id: `ledger-header-update:${field}:${ledger?.id}` },
    mutationFn: ({ value, ack }) => {
      if (!ledger) throw new Error("no ledger in session");

      return createLedgerCommands(getFinanceClient()).updateLedger(
        { ...ledger, [field]: value },
        ack,
      );
    },
    /** Paint the new value now; hand `onError`/`onSuccess` the value it displaces. */
    onMutate: ({ value }) => {
      /**
       * The rollback target comes from `_ledgerInSession` (the last persisted row) and
       * NOT from `fieldValue` — the atom already holds whatever the user typed.
       */
      const persisted = store.get(_ledgerInSession);
      store.set(FIELDS_ATOMS[field], value);
      return {
        previous: persisted?.[field] ?? null,
      };
    },

    /** Transport/throw failure: nothing was written, so undo the paint. */
    onError: (_error, _value, context) => {
      store.set(FIELDS_ATOMS[field], context?.previous ?? null);
    },
    onSuccess: (result, vars, context) => {
      const targetFieldAtom = FIELDS_ATOMS[field];
      if (!result.ok) {
        if (result.reason === "overspend_warning") {
          /**
           * The one reason with a decision attached. Raise it as state; the component
           * renders the dialog. `vars.value` IS the retry payload — nothing to rederive.
           * We deliberately do NOT roll back here: the dialog asks about the value the
           * user is looking at, so the paint stays until they decide.
           */
          const pending = { value: vars.value, previous: context.previous ?? null };
          pendingRef.current = pending;
          setPendingAck(pending);
          return;
        }

        // Terminal: nothing was written, so the paint is a lie. Roll back first.
        store.set(targetFieldAtom, context.previous ?? null);

        /** Narrowed to `BlockedLedgerUpdateRejection` here. */
        void notifyUpdateRejection(result.reason);
        return;
      }

      /**
       * Repaint from the returned row rather than from `vars.value` — the server may
       * have normalized it, and the row carries the sibling field's current truth too.
       */
      store.set(targetFieldAtom, result.ledger[field]);
      store.set(_ledgerInSession, result.ledger);

      /** Seed the cache so a remount of this month reads the row we just wrote. */
      queryClient.setQueryData<GetLedgerQueryResp>(["finance", "ledger", result.ledger.month], {
        ledger: result.ledger,
      });

      /** A successful write settles whatever the last rejection was complaining about. */
      if (ERROR_TOAST_ID !== null) {
        toast.dismiss(ERROR_TOAST_ID);
      }
    },
  });

  /**
   * "Save it anyway." The retry is the SAME amount with the flag set — `pending.value`
   * is what the dialog just asked about, so nothing is rederived from the input, which
   * the user may well have moved on from while the dialog was open.
   */
  const confirmAck = useCallback(() => {
    const pending = claimPendingAck();

    /** Null means the decision is already spent — nothing left to act on. */
    if (pending === null) return;

    mutation.mutate({ value: pending.value, ack: true });
  }, [claimPendingAck, mutation.mutate]);

  /**
   * "Don't." Declining means nothing was ever written, so the optimistic paint is a
   * lie — the same terminal-rejection path as `onError`, just reached by a user
   * decision instead of a failure. `pending.previous` is the value `onMutate`
   * captured, so this lands on the last PERSISTED value and not on whatever the input
   * holds.
   */
  const declineAck = useCallback(() => {
    const pending = claimPendingAck();

    if (pending === null) return;

    store.set(FIELDS_ATOMS[field], pending.previous);
  }, [claimPendingAck, store, field]);

  /**
   * Abandon an in-progress edit (blur, escape) without ever sending it: snap the atom
   * back to the session row, discarding whatever the input left in it.
   */
  const cancelUpdate = useCallback(() => {
    if (ledger === null) return;
    store.set(FIELDS_ATOMS[field], ledger[field]);
  }, [ledger, store, field]);

  return {
    /** The optimistic value to display — mirrors the field, ahead of the server. */
    fieldValue,
    /** Local edit while typing; nothing is sent until `mutate`. */
    setFieldValue,
    /** Commit an edit. Pass `ack: false`; the overspend path handles its own retry. */
    mutate: mutation.mutate,
    /** Non-null while an overspend acknowledgement is outstanding — render the dialog off this. */
    pendingAck,
    confirmAck,
    declineAck,
    /** The last persisted row, for the caller's "did this actually change?" guard. */
    baseLedger: ledger,
    cancelUpdate,
  };
}
