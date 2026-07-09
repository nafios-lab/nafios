// @nafios/finance — data layer (src/internal/). The create-ledger command
// (EF3.7): the ONE code path that opens a MonthlyLedger. The FIRST finance
// command — the first src/internal/ unit that COMPOSES pure domain rules with
// repository writes rather than being a pure leaf or a thin data primitive. It
// establishes the command pattern EF3.8 mirrors: validate-in-domain →
// orchestrate repository writes → return a { ok } result union for user-input
// rejections / throw FinanceDataError on a DB failure.
//
// It adds NO business rule. The maxCapped guardrail is EF3.5's, the
// openable-month math is EF3.4's, the data primitives are EF3.6's. Its whole job
// is composition + ordering + atomicity: enforce the pure rules server-side
// (regardless of caller — the form is a UX affordance, not the boundary), then
// sequence the previous-ongoing → reconciling park and the new-ledger insert so
// the "at most one ongoing" invariant is never violated and the observable
// outcome is all-or-nothing.
//
// Atomicity mechanism (§4.2 — the central design decision): ordered writes +
// compensation, backstopped by EF1.1's uq_one_ongoing_ledger partial unique
// index. The Supabase JS SDK exposes no multi-statement transaction, and EF3
// adds NO migration / NO RPC — so this command parks-first (the index forbids
// two ongoing rows, so the new insert cannot land while the old ledger is still
// ongoing) then inserts, and compensates (reverts the park) if the insert
// throws. The index is the hard, unconditional backstop for the invariant.

import { resolveCreationState } from "../../domain/creation-window";
import { type MaxCappedGuardrail, validateMaxCapped } from "../../domain/max-capped";
import { compareMoney, type Money, ZERO_MONEY } from "../../domain/money";
import { compareMonths, type Month } from "../../domain/month";
import type { FinanceClient } from "../client";
import { createLedgerRepository, type LedgerHeader } from "../repositories/ledger.repo";

// No config layer in EF3 (monthly-ledger.md §3/§6) — leadDays is a fixed 7. When
// a config capability lands it supplies the value; this command's contract is
// unchanged (same stance as EF3.4/EF3.5).
const LEAD_DAYS = 7;

// ───────────────────────── Command input ─────────────────────────

/**
 * The MANUAL inputs a user supplies to open a ledger. There is no config prefill
 * in EF3 (no finance-settings layer) — openingBalance and maxCapped are keyed by
 * the user on the creation form every time, and leadDays is fixed at 7 (not
 * passed in).
 */
export interface CreateLedgerInput {
  /** The month to open. MUST be one of EF3.4's openable months (current, or next
   *  in-window); any other month is rejected 'month_not_openable' (no far-future,
   *  no back-fill, and — because a taken month is never offered — no month that
   *  already has a ledger). */
  readonly month: Month; // EF3.1
  readonly openingBalance: Money; // EF3.1 — manual; must be ≥ 0
  readonly maxCapped: Money; // EF3.1 — manual; must be ≥ 0 and pass the EF3.5 guardrail
  /** The user's explicit amber-zone acknowledgement (EF3.5). Lifts the amber gate
   *  only; never overrides a blocked (> 2× opening) value. */
  readonly confirmed: boolean;
  /** Caller-supplied "YYYY-MM-DD" (the web loader has it — EF3.4 discipline: no
   *  clock in the command's decision path). Validated via EF3.1 through the EF3.4
   *  resolver; a malformed value throws CodecError. */
  readonly today: string;
}

// ───────────────── Rejection (deterministic input failure) ─────────────────

/** Why createLedger refused BEFORE any write — a deterministic input/context
 *  failure the UI renders, not a DB error. (DB/query failures throw
 *  FinanceDataError instead — §4.3.) */
export type CreateLedgerRejectionReason =
  | "month_not_openable" // month ∉ EF3.4 openable set: far-future, back-fill, or already has a ledger
  | "negative_amount" // openingBalance or maxCapped < 0 (EF3.5 does not police sign; DB ck_balances_nonneg backstops)
  | "requires_confirmation" // EF3.5 amber zone, confirmed === false
  | "exceeds_hard_cap"; // EF3.5 blocked zone (> 2× opening) — NO override

// ───────────────────────────── Result ─────────────────────────────

/**
 * The command's result. A deterministic pre-write rejection is `{ ok: false }`
 * (the caller renders it — same channel as EF3.5's validation result).
 * `guardrail` is present iff the reason is a guardrail one (so the amber sheet
 * has `savingsDraw` / the block message has `hardCap`), null otherwise. On
 * success, `parkedLedgerId` is the id of the ledger moved to `reconciling`
 * (S3/S5), or null when nothing was parked (fresh start — S2).
 */
export type CreateLedgerResult =
  | {
      readonly ok: true;
      readonly ledger: LedgerHeader;
      readonly parkedLedgerId: string | null;
    }
  | {
      readonly ok: false;
      readonly reason: CreateLedgerRejectionReason;
      readonly guardrail: MaxCappedGuardrail | null;
    };

// ─────────────────────────── The command ──────────────────────────

export interface LedgerCommands {
  /**
   * Open a MonthlyLedger. Enforces (in this precedence — §4.1) input
   * non-negativity, the EF3.5 maxCapped guardrail, and the EF3.4 openable-month
   * rule; on any failure returns `{ ok: false }` and performs NO write. On
   * success it parks the current `ongoing` ledger (if any) to `reconciling` and
   * inserts the new `ongoing` ledger as one all-or-nothing operation (§4.2),
   * returning the created LedgerHeader.
   *
   * Throws FinanceDataError (EF3.6) for a genuine DB/query failure — including
   * the rare lost race where the month was validated free but got taken before
   * the insert; the parked ledger is compensated (reverted to `ongoing`) before
   * the throw (§4.2 / §4.3). Throws CodecError if `today` is malformed (a
   * programming error, not user input).
   */
  createLedger(input: CreateLedgerInput): Promise<CreateLedgerResult>;
}

/**
 * Construct the ledger command surface bound to an authed FinanceClient (EF2.2).
 * It builds the EF3.6 repository over the same client; every read/write runs as
 * that user under RLS. Inserts never set `user_id` (the DB default `auth.uid()`
 * fills it — EF2.2 AC4).
 */
export function createLedgerCommands(client: FinanceClient): LedgerCommands {
  const repo = createLedgerRepository(client);

  return {
    async createLedger(input) {
      const { month, openingBalance, maxCapped, confirmed, today } = input;

      // ── §4.1 pre-write validation — all deterministic, all before any write ──

      // 1. Non-negativity (pure). EF3.5 deliberately does not police the sign
      //    (§4.3 rule 2), so the command does — a clean rejection before any
      //    write, so the DB ck_balances_nonneg is only ever a backstop. Compared
      //    via EF3.1's compareMoney against ZERO_MONEY — no raw-number math.
      if (compareMoney(openingBalance, ZERO_MONEY) < 0 || compareMoney(maxCapped, ZERO_MONEY) < 0) {
        return { ok: false, reason: "negative_amount", guardrail: null };
      }

      // 2. MaxCapped guardrail (pure — EF3.5). Returned verbatim: the reason is
      //    exactly EF3.5's `requires_confirmation` / `exceeds_hard_cap`, and the
      //    guardrail (savingsDraw / hardCap) travels so EF3.12 renders the sheet /
      //    message. The command does NOT re-derive the zones.
      const validation = validateMaxCapped({ openingBalance, maxCapped, confirmed });
      if (!validation.ok) {
        return { ok: false, reason: validation.reason, guardrail: validation.guardrail };
      }

      // 3. Openable-month (needs the single list() read — EF3.4). The caller's
      //    ledgers (a LedgerHeader[], which structurally satisfies EF3.4's
      //    LedgerSummary[]) feed the resolver; `month` must equal an openable
      //    month (compared via compareMonths). Rejects far-future, back-fill, and
      //    — because a taken month is never offered — any month already taken. A
      //    malformed `today` throws CodecError from the resolver here (§4.3).
      const ledgers = await repo.list();
      const { openable } = resolveCreationState({ today, leadDays: LEAD_DAYS, ledgers });
      const isOpenable =
        (openable.current !== null && compareMonths(openable.current, month) === 0) ||
        (openable.next !== null && compareMonths(openable.next, month) === 0);
      if (!isOpenable) {
        return { ok: false, reason: "month_not_openable", guardrail: null };
      }

      // ── §4.2 open the month — the atomic prev-ongoing → reconciling transition ──

      const ongoing = await repo.findOngoing();

      // No parking needed (S2 — fresh start / clean gap): a single insert,
      // trivially atomic.
      if (ongoing === null) {
        const ledger = await repo.insert({ month, openingBalance, maxCapped, status: "ongoing" });
        return { ok: true, ledger, parkedLedgerId: null };
      }

      // Park-then-insert (S3 next month, or S5 opening the current month while a
      // previous one is stuck ongoing). Park FIRST — uq_one_ongoing_ledger forbids
      // a second ongoing row, so the old ledger MUST leave `ongoing` before the
      // new insert can land. Compensate (revert the park) if the insert throws, so
      // the outcome is all-or-nothing: either "new open + old parked" or "nothing
      // changed — old still ongoing".
      await repo.updateStatus(ongoing.id, "reconciling");
      let ledger: LedgerHeader;
      try {
        ledger = await repo.insert({ month, openingBalance, maxCapped, status: "ongoing" });
      } catch (error) {
        // Revert the park before re-throwing. A failed compensation is not fatal:
        // the target month is still free, so re-opening it self-heals (findOngoing
        // then returns null and the insert lands cleanly — §4.2). Re-throw the
        // ORIGINAL insert error either way.
        try {
          await repo.updateStatus(ongoing.id, "ongoing");
        } catch {
          // swallow — self-heals on retry; the original error is what matters.
        }
        throw error;
      }
      return { ok: true, ledger, parkedLedgerId: ongoing.id };
    },
  };
}
