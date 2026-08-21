// @nafios/finance — data layer (src/internal/). The LEDGER command surface —
// every write path for a MonthlyLedger, the mirror of envelope-commands.ts.
// Further ledger operations land here as they ship.
//
// Its first member is createLedger (EF3.7): the ONE code path that opens a
// MonthlyLedger, and the FIRST finance command — the first src/internal/ unit
// that COMPOSES pure domain rules with repository writes rather than being a
// pure leaf or a thin data primitive. It establishes the command pattern EF3.8
// mirrors: validate-in-domain → orchestrate repository writes → return a
// { ok } result union for user-input rejections / throw FinanceDataError on a
// DB failure.
//
// createLedger adds NO business rule. The maxCapped guardrail is EF3.5's, the
// openable-month math is EF3.4's, the data primitives are EF3.6's. Its whole job
// is composition + ordering + atomicity: enforce the pure rules server-side
// (regardless of caller — the form is a UX affordance, not the boundary), then
// sequence the previous-ongoing → reconciling park and the new-ledger insert so
// the "at most one ongoing" invariant is never violated and the observable
// outcome is all-or-nothing.
//
// createLedger's atomicity mechanism (§4.2 — the central design decision):
// ordered writes + compensation, backstopped by EF1.1's uq_one_ongoing_ledger
// partial unique index. The Supabase JS SDK exposes no multi-statement
// transaction, and EF3 adds NO migration / NO RPC — so it parks-first (the index forbids
// two ongoing rows, so the new insert cannot land while the old ledger is still
// ongoing) then inserts, and compensates (reverts the park) if the insert
// throws. The index is the hard, unconditional backstop for the invariant.
//
// Its second member is updateLedger — the only EDIT on a ledger's own header,
// covering BOTH header money fields at once and taking the edited MonthlyLedger
// rather than a single value. Same pattern, none of the atomicity: one row, so
// the whole job is the GATE STACK before the write (exists/owned → the
// 'ongoing'-only header lock → non-negativity → the EF3.5 guardrail on the
// incoming pair). It too adds NO business rule: the header lock is EF3.2's
// isLedgerHeaderEditable, the guardrail is EF3.5's validateMaxCapped. It takes
// both fields because the guardrail constrains a RELATION between them: when a
// caller moves both in one edit, only the proposed PAIR is a meaningful thing to
// validate (raising the ceiling AND the opening balance that funds it is legal as
// a whole, yet either half judged against the stored other can reject). It reads
// `id` and the two amounts and NOTHING else off its argument — the status gate
// runs against the STORED row, so a caller cannot smuggle `status: 'ongoing'`
// past the lock on a settled ledger — and writes both columns in ONE UPDATE, so a
// half-applied header is never observable.

import { compareMonths, type Month, today } from "@nafios/datetime";
import { resolveCreationState } from "../../domain/creation-window";
import { validateMaxCapped } from "../../domain/max-capped";
import { compareMoney, type Money, ZERO_MONEY } from "../../domain/money";
import { isLedgerHeaderEditable, type MonthlyLedger } from "../../domain/monthly-ledger";
import type { FinanceClient } from "../client";
import { createLedgerRepository } from "../repositories/ledger.repo";

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
  /** The user's explicit amber-zone acknowledgement (EF3.5) — "yes, I know I'm setting
   *  maxCapped above income and will draw from savings". Lifts the amber gate only;
   *  never overrides a blocked (> 2× opening) value. */
  readonly acknowledgedOverspend: boolean;
}

// ───────────── Rejection (deterministic input/context failure) ─────────────

/** Why a ledger write command refused BEFORE any write — a deterministic
 *  input/context failure the UI renders, not a DB error. (DB/query failures throw
 *  FinanceDataError instead — §4.3.)
 *
 *  This is the union for the WHOLE ledger command surface, not just createLedger
 *  — the same shape as envelope-commands.ts's `EnvelopeRejectionReason`. Reasons
 *  like `negative_amount` are shared by every write path that takes a Money
 *  input (create, and the balance/cap edits that follow), so the union lives at
 *  the module level and each command's `*Result` narrows to the subset it can
 *  actually return. That keeps a caller's exhaustive `Record<reason, …>` copy map
 *  tied to one command rather than to every reason the module will ever add. */
export type LedgerRejectionReason =
  | "month_not_openable" // month ∉ EF3.4 openable set: far-future, back-fill, or already has a ledger
  | "ledger_not_found" // target ledger absent / not owned (RLS-scoped read returned null) — edit paths
  | "ledger_not_ongoing" // header money fields are locked once the ledger leaves 'ongoing' (§2) — edit paths
  | "negative_amount" // a Money input < 0 (EF3.5 does not police sign; DB ck_balances_nonneg backstops)
  | "overspend_warning" // EF3.5 amber zone, acknowledgedOverspend === false
  | "exceeds_hard_cap"; // EF3.5 blocked zone (> 2× opening) — NO override

// ───────────────────────────── Result ─────────────────────────────

/**
 * The command's result. A deterministic pre-write rejection is `{ ok: false }`
 * carrying only its `reason` — the caller renders copy from the reason alone.
 * (The guardrail payload — `savingsDraw` / `hardCap` — was removed; the UI does
 * not consume it. Richer per-reason detail can be reintroduced later if a
 * situation warrants it.) On success, `parkedLedgerId` is the id of the ledger
 * moved to `reconciling` (S3/S5), or null when nothing was parked (fresh start — S2).
 */
export type CreateLedgerResult =
  | {
      readonly ok: true;
      readonly ledger: MonthlyLedger;
      readonly parkedLedgerId: string | null;
    }
  | {
      readonly ok: false;
      /** Narrowed to the reasons createLedger itself can return — the module-wide
       *  `LedgerRejectionReason` is wider. */
      readonly reason:
        | "month_not_openable"
        | "negative_amount"
        | "overspend_warning"
        | "exceeds_hard_cap";
    };

/**
 * The shared result of an edit to an EXISTING ledger row, addressed by id — the
 * common shape every such command returns (`updateLedger` today; further header
 * edits reuse it rather than declaring a near-identical twin). On success
 * `ledger` is the header AS WRITTEN (read back by the repository), so the caller
 * replaces its copy rather than patching it locally. A rejection carries only its
 * `reason` — same stance as `CreateLedgerResult`: the UI renders copy from the
 * reason alone.
 */
export type UpdateLedgerResult =
  | { readonly ok: true; readonly ledger: MonthlyLedger }
  | {
      readonly ok: false;
      /** Narrowed to the reasons an edit path can return — the module-wide
       *  `LedgerRejectionReason` is wider (`month_not_openable` is creation-only:
       *  an edit never chooses a month, it addresses an existing ledger by id). */
      readonly reason:
        | "ledger_not_found"
        | "ledger_not_ongoing"
        | "negative_amount"
        | "overspend_warning"
        | "exceeds_hard_cap";
    };

// ─────────────────────────── The command ──────────────────────────

export interface LedgerCommands {
  /**
   * Open a MonthlyLedger. Enforces (in this precedence — §4.1) input
   * non-negativity, the EF3.5 maxCapped guardrail, and the EF3.4 openable-month
   * rule; on any failure returns `{ ok: false }` and performs NO write. On
   * success it parks the current `ongoing` ledger (if any) to `reconciling` and
   * inserts the new `ongoing` ledger as one all-or-nothing operation (§4.2),
   * returning the created MonthlyLedger.
   *
   * Throws FinanceDataError (EF3.6) for a genuine DB/query failure — including
   * the rare lost race where the month was validated free but got taken before
   * the insert; the parked ledger is compensated (reverted to `ongoing`) before
   * the throw (§4.2 / §4.3).
   */
  createLedger(input: CreateLedgerInput): Promise<CreateLedgerResult>;

  /**
   * Edit an existing ledger's WHOLE editable header — `openingBalance` and
   * `maxCapped` together — by handing back the ledger as the caller now holds it.
   * The command a header-edit surface uses when either money field may have
   * moved.
   *
   * Same gate stack, same precedence (§4.1), no write on any failure:
   * existence/ownership → the `ongoing`-only header lock (EF3.2) → non-negativity
   * of BOTH amounts → the EF3.5 guardrail evaluated on the incoming PAIR. That
   * last point is why one command takes both fields: the guardrail constrains the
   * RELATION between them, so a client moving both at once (raising the ceiling
   * while raising the income that funds it) must be judged on the pair it is
   * actually asking for — validating one field at a time against the stored other
   * would reject an edit that is legal as a whole.
   *
   * The `ledger` argument is INPUT, not authority. Only `id` and the two money
   * fields are read: `id` addresses the row, the amounts are the proposal. The
   * supplied `status` / `month` / `createdAt` / `settledAt` are IGNORED — the gate
   * runs against the STORED status (a caller could otherwise send `'ongoing'` and
   * edit a settled ledger), `month` is immutable once opened, and the timestamps
   * are DB-owned. Both amounts land in ONE UPDATE, so a half-applied header is
   * never observable.
   *
   * @param ledger the ledger as edited. `id` must be one the caller owns (else
   *        `ledger_not_found` — never a leak that it exists); `openingBalance` and
   *        `maxCapped` must both be ≥ 0 (`negative_amount`).
   * @param acknowledgedOverspend the user's explicit amber-zone acknowledgement,
   *        defaulting to **false** — an unacknowledged amber pair rejects
   *        `overspend_warning` and the caller re-submits with `true` after the
   *        confirmation sheet. It can NEVER rescue a blocked (> 2× opening) pair.
   * @see LedgerRejectionReason for every reason the ledger command surface returns.
   */
  updateLedger(ledger: MonthlyLedger, acknowledgedOverspend?: boolean): Promise<UpdateLedgerResult>;
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
      const { month, openingBalance, maxCapped, acknowledgedOverspend } = input;

      // ── §4.1 pre-write validation — all deterministic, all before any write ──

      // 1. Non-negativity (pure). EF3.5 deliberately does not police the sign
      //    (§4.3 rule 2), so the command does — a clean rejection before any
      //    write, so the DB ck_balances_nonneg is only ever a backstop. Compared
      //    via EF3.1's compareMoney against ZERO_MONEY — no raw-number math.
      if (compareMoney(openingBalance, ZERO_MONEY) < 0 || compareMoney(maxCapped, ZERO_MONEY) < 0) {
        return { ok: false, reason: "negative_amount" };
      }

      // 2. MaxCapped guardrail (pure — EF3.5). The command surfaces only the
      //    reason (`overspend_warning` / `exceeds_hard_cap`); the guardrail
      //    payload (savingsDraw / hardCap) is intentionally NOT propagated — the
      //    UI branches on the reason alone. The command does NOT re-derive the zones.
      const validation = validateMaxCapped({ openingBalance, maxCapped, acknowledgedOverspend });
      if (!validation.ok) {
        return { ok: false, reason: validation.reason };
      }

      // 3. Openable-month (needs the single list() read — EF3.4). The caller's
      //    ledgers (a MonthlyLedger[], which structurally satisfies EF3.4's
      //    LedgerMonthStatus[]) feed the resolver; `month` must equal an openable
      //    month (compared via compareMonths). Rejects far-future, back-fill, and
      //    — because a taken month is never offered — any month already taken.
      //    `today` is read here from @nafios/datetime's clock seam (the suite's
      //    sole `new Date()`, ADR-0028), not taken as an input.
      const ledgers = await repo.list();
      const { openable } = resolveCreationState({ today: today(), leadDays: LEAD_DAYS, ledgers });
      const isOpenable =
        (openable.current !== null && compareMonths(openable.current, month) === 0) ||
        (openable.next !== null && compareMonths(openable.next, month) === 0);
      if (!isOpenable) {
        return { ok: false, reason: "month_not_openable" };
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
      let ledger: MonthlyLedger;
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

    async updateLedger(ledger, acknowledgedOverspend = false) {
      // ── §4.1 pre-write validation — the same gate stack, same precedence, as
      //    createLedger; the guardrail runs on the incoming PAIR.

      // (a) Target ledger, read by the id on the supplied object. null under RLS =
      //     absent OR not owned — deliberately indistinguishable to the caller.
      //     This read is the source of TRUTH for `status`: the gate below must not
      //     trust the status field the caller handed us.
      const stored = await repo.findById(ledger.id);
      if (stored === null) {
        return { ok: false, reason: "ledger_not_found" };
      }

      // (b) Header lock (pure — EF3.2), on the STORED status. Both money fields
      //     are editable ONLY while `ongoing`; `reconciling` and `settled` lock
      //     them (monthly-ledger.md §2). NOT `isLedgerMutable` — that stays true
      //     in `reconciling`, where envelope amounts move but the header must not.
      if (!isLedgerHeaderEditable(stored.status)) {
        return { ok: false, reason: "ledger_not_ongoing" };
      }

      // (c) Non-negativity (pure) on BOTH amounts, via compareMoney against
      //     ZERO_MONEY — no raw-number math. Same stance as createLedger, which
      //     checks the identical pair: reject cleanly here so the DB
      //     ck_balances_nonneg is only ever a backstop.
      if (
        compareMoney(ledger.openingBalance, ZERO_MONEY) < 0 ||
        compareMoney(ledger.maxCapped, ZERO_MONEY) < 0
      ) {
        return { ok: false, reason: "negative_amount" };
      }

      // (d) MaxCapped guardrail (pure — EF3.5) on the incoming PAIR — the whole
      //     reason this command takes both fields rather than one. The guardrail
      //     is a RELATION between the two fields; when both move together only
      //     the proposed pair is meaningful. Judging each side
      //     against the stored other would reject a legal edit (e.g. raising the
      //     ceiling AND the opening balance that funds it) purely from evaluation
      //     order. Identical call to createLedger's — one pure rule, every write path.
      const validation = validateMaxCapped({
        openingBalance: ledger.openingBalance,
        maxCapped: ledger.maxCapped,
        acknowledgedOverspend,
      });
      if (!validation.ok) {
        return { ok: false, reason: validation.reason };
      }

      // ── The write — a single-row UPDATE of two columns, trivially atomic ──

      // No-op fast-path: NEITHER amount moved, so there is nothing to write (the
      // same fast path as editEnvelope's empty patch). It
      // also keeps a re-submit after the amber confirmation from logging an
      // adjustment the user never made (monthly-ledger.md §2). Compared via
      // compareMoney, so "7000" and "7000.00" are the same value. A change to
      // EITHER field writes BOTH — one UPDATE, never a half-applied header.
      if (
        compareMoney(ledger.openingBalance, stored.openingBalance) === 0 &&
        compareMoney(ledger.maxCapped, stored.maxCapped) === 0
      ) {
        return { ok: true, ledger: stored };
      }

      // Touches only this ledger's own two money columns — no status transition,
      // no sibling row, so none of createLedger's park/compensate machinery
      // applies. A DB failure throws FinanceDataError (EF3.6) with nothing written.
      const updated = await repo.updateHeader(ledger);
      return { ok: true, ledger: updated };
    },
  };
}
