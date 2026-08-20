// @nafios/finance — data layer (src/internal/). The ledger repository (EF3.6):
// the typed, RLS-scoped CRUD + lookup primitives over the monthly_ledger table.
// The FIRST finance repository — it also lands the two foundations later
// repositories reuse: the row↔domain mapper (ledger.mapper.ts) and the
// FinanceDataError classifier (errors.ts).
//
// NO business logic here — no guardrail (EF3.5), no creation-window check
// (EF3.4), no mutability check (EF3.2), no atomic prev-ongoing→reconciling
// orchestration (EF3.7), no metrics (EF3.10). This is the data primitive those
// compose. Every method runs on a caller-supplied AUTHED client, so auth.uid()
// resolves and the owner_all RLS policy scopes all reads/writes; inserts NEVER
// set user_id (the DB default auth.uid() fills it).

import type { Tables } from "@nafios/database";
import { encodeMonth, type Month } from "@nafios/datetime";
import type { Money } from "../../domain/money";
import type {
  LedgerStatus,
  LedgerSummaryCard,
  MonthlyLedger,
  ReconPendingLedger,
} from "../../domain/monthly-ledger";
import type { FinanceClient } from "../client";
import { mapPostgrestError } from "../errors";
import {
  ledgerSummaryDTOToCard,
  newLedgerToInsertRow,
  openingBalanceToUpdateRow,
  reconPendingLedgerDTOToDomain,
  rowToMonthlyLedger,
} from "../mappers/ledger.mapper";

/**
 * The monthly_ledger columns a MonthlyLedger is built from — every column except
 * `user_id` (RLS-scoped, never surfaced to the domain). The repository selects
 * exactly these, casting the numeric(12,2) columns `::text` (see HEADER_COLUMNS).
 * The generated `Tables<>` row types those columns as `number` (that is what the
 * bare column would be); the `::text` cast overrides them to `string` here so the
 * TYPE matches what the SELECT actually returns and the mapper needs no cast.
 */
export type LedgerRow = Omit<
  Pick<
    Tables<"monthly_ledger">,
    "id" | "month" | "opening_balance" | "max_capped" | "status" | "created_at" | "settled_at"
  >,
  "opening_balance" | "max_capped"
> & {
  readonly opening_balance: string; // numeric(12,2) ::text — decode via decodeMoney
  readonly max_capped: string; // numeric(12,2) ::text — decode via decodeMoney
};

/**
 * The exact jsonb shape `get_ledger_summary` emits. Money fields are TEXT
 * (numeric(12,2) cast ::text in SQL); counts are plain integers; `month` is the
 * first-of-month DATE string; `status` is the raw enum label; and
 * `envelope_counts.carried_over` uses the DB snake_case label (this mapper
 * translates it to the domain's `carriedOver`). The generated bindings only know
 * the return as `Json`, so the RPC's real contract is pinned here.
 */
export interface LedgerSummaryDTO {
  readonly id: string;
  readonly month: string; // 'YYYY-MM-01' DATE
  readonly status: LedgerStatus; // raw enum label
  readonly opening_balance: string;
  readonly max_capped: string;
  readonly col: string;
  readonly asm_contribution: string; // may be negative
  readonly health_margin: string; // may be negative
  readonly is_asm_negative: boolean;
  readonly outstanding: {
    readonly count: number;
    readonly total: string;
  };
  readonly envelope_counts: {
    readonly total: number;
    readonly paid: number;
    readonly pending: number;
    readonly skipped: number;
    readonly carried_over: number; // DB snake_case label
  };
}

/**
 * The exact row shape `get_pending_recon_ledgers` emits — one per `reconciling`
 * ledger. `pending_sum_amount` is TEXT (numeric(12,2) cast ::text) so money
 * crosses the wire as a string the Money codec decodes — NEVER a JS float; the
 * counts are plain integers; `month` is the first-of-month DATE string; `status`
 * is the raw enum label (always 'reconciling' from this RPC). Mirrors the
 * money-as-string contract of `LedgerSummaryDTO` above. The RPC returns a SET
 * (typed as an array by the generated bindings), so the repo reads `data` as
 * `ReconPendingLedgerDTO[]`.
 */
export interface ReconPendingLedgerDTO {
  readonly id: string;
  readonly month: string; // 'YYYY-MM-01' DATE
  readonly status: LedgerStatus; // raw enum label ('reconciling')
  readonly pending_env_counts: number;
  readonly pending_sum_amount: string; // numeric(12,2) ::text — decode via decodeMoney
}

/**
 * The header fields a caller supplies to create a ledger. No `id`
 * (DB gen_random_uuid), no `user_id` (DB default auth.uid() — NEVER set on the
 * authed path), no `createdAt` (DB default now()), no `settledAt` (EF3 never
 * inserts a settled ledger). `status` defaults to 'ongoing'.
 */
export interface NewLedger {
  readonly month: Month;
  readonly openingBalance: Money;
  readonly maxCapped: Money;
  readonly status?: Extract<LedgerStatus, "ongoing" | "reconciling">;
}

/**
 * The columns a MonthlyLedger is built from — the mapper's read surface.
 *
 * The numeric(12,2) columns are cast `::text` in the SELECT so PostgREST emits
 * them as JSON STRINGS. Without the cast PostgREST serializes numeric as a JSON
 * *number* and the SDK hands the mapper a float — exactly what the Money codec
 * exists to prevent. This is the same money-as-text contract the
 * `get_ledger_summary` / `get_pending_recon_ledgers` RPCs already apply in SQL;
 * table reads now match it. A cast column keeps its own name, so the mapper still
 * reads `opening_balance` / `max_capped`.
 */
const HEADER_COLUMNS =
  "id, month, opening_balance::text, max_capped::text, status, created_at, settled_at";

export interface LedgerRepository {
  /**
   * Insert a new ledger (user_id filled by the DB default auth.uid() — never set
   * here). Returns the created MonthlyLedger (read back so DB-defaulted
   * id/createdAt/status are present). Throws FinanceDataError on a DB failure
   * (duplicate_month | ongoing_exists | check_violation | …).
   */
  insert(input: NewLedger): Promise<MonthlyLedger>;

  /** Fetch by id, RLS-scoped to the caller. null when not found OR not owned. */
  findById(id: string): Promise<MonthlyLedger | null>;

  /**
   * The ledger's SUMMARY-CARD payload — header + COL / ASM Contribution / Health
   * Margin / Outstanding + the per-status envelope counts — in ONE round-trip,
   * aggregated server-side by the `get_ledger_summary` RPC and RLS-scoped to the
   * caller. null when the ledger is missing or not owned (mirrors `findById`).
   * Throws FinanceDataError on a DB failure. The metrics match the pure
   * `computeLedgerMetrics` to the cent (the migration's DUPLICATION SEAM).
   */
  getLedgerSummary(id: string): Promise<LedgerSummaryCard | null>;

  /**
   * The reconciliation worklist: every `reconciling` ledger for the caller, each
   * with its unresolved (still 'pending') envelope count + Σ amount, aggregated
   * server-side by the `get_pending_recon_ledgers` RPC in ONE round-trip and
   * RLS-scoped to the caller. [] when nothing is reconciling. Throws
   * FinanceDataError on a DB failure. The 'pending'-only subset mirrors
   * `getLedgerSummary`'s Outstanding, so a worklist row and that ledger's summary
   * card agree to the cent (the migration's DUPLICATION SEAM).
   */
  listPendingRecon(): Promise<ReconPendingLedger[]>;

  /** The caller's ledger for a given month, or null — the uniqueness/conflict
   *  probe EF3.7 uses before opening a month. */
  findByMonth(month: Month): Promise<MonthlyLedger | null>;

  /** THE "one ongoing" query: the caller's single `ongoing` ledger, or null. The
   *  uq_one_ongoing_ledger partial unique index guarantees at most one. */
  findOngoing(): Promise<MonthlyLedger | null>;

  /** All the caller's ledgers, chronological by month (ascending). [] when none.
   *  Satisfies EF3.4's LedgerMonthStatus[] input directly (month + status). */
  list(): Promise<MonthlyLedger[]>;

  /**
   * Transition a ledger's status (EF3 uses this ONLY for ongoing → reconciling).
   * Returns the updated header. Does NOT enforce the guardrail, the mutability
   * rule, or atomicity across writes — that composition is EF3.7's.
   */
  updateStatus(
    id: string,
    status: Extract<LedgerStatus, "ongoing" | "reconciling">,
  ): Promise<MonthlyLedger>;

  /**
   * Delete a ledger, RLS-scoped. A complete-CRUD primitive; NO EF3 user story
   * deletes a ledger — present for test teardown and repository completeness. */
  delete(id: string): Promise<void>;

  /**
   * Update one ledger's opening balance, returning the header as written. RLS
   * scopes the write; a DB failure throws FinanceDataError (EF3.6). Does NOT
   * enforce the mutability rule (EF3.2) or the guardrail (EF3.5) — this is the
   * data primitive those compose.
   */
  updateOpeningBalance(id: string, value: Money): Promise<MonthlyLedger>;
}

/**
 * Construct a ledger repository bound to an authed FinanceClient (EF2.2). Every
 * method runs as that user under RLS.
 */
export function createLedgerRepository(client: FinanceClient): LedgerRepository {
  const table = () => client.from("monthly_ledger");

  return {
    async insert(input) {
      const { data, error } = await table()
        .insert(newLedgerToInsertRow(input))
        .select(HEADER_COLUMNS)
        .single();
      if (error) {
        throw mapPostgrestError(error);
      }
      return rowToMonthlyLedger(data as LedgerRow);
    },

    async findById(id) {
      const { data, error } = await table().select(HEADER_COLUMNS).eq("id", id).maybeSingle();
      if (error) {
        throw mapPostgrestError(error);
      }
      return data ? rowToMonthlyLedger(data as LedgerRow) : null;
    },

    async getLedgerSummary(id) {
      // The RPC aggregates in SQL and returns a single jsonb payload (typed `Json`
      // by the generated bindings). It returns SQL NULL — surfacing as `data:
      // null` — when the ledger is missing or not owned, exactly like findById.
      const { data, error } = await client.rpc("get_ledger_summary", { p_ledger_id: id });
      if (error) {
        throw mapPostgrestError(error);
      }
      return data ? ledgerSummaryDTOToCard(data as unknown as LedgerSummaryDTO) : null;
    },

    async listPendingRecon() {
      // The RPC aggregates in SQL and returns a SET of rows (typed as an array by
      // the generated bindings). No arguments: RLS scopes to the caller and the
      // function filters status = 'reconciling' internally. Empty set → [].
      const { data, error } = await client.rpc("get_pending_recon_ledgers");
      if (error) {
        throw mapPostgrestError(error);
      }
      return ((data ?? []) as unknown as ReconPendingLedgerDTO[]).map(
        reconPendingLedgerDTOToDomain,
      );
    },

    async findByMonth(month) {
      const { data, error } = await table()
        .select(HEADER_COLUMNS)
        .eq("month", encodeMonth(month))
        .maybeSingle();
      if (error) {
        throw mapPostgrestError(error);
      }
      return data ? rowToMonthlyLedger(data as LedgerRow) : null;
    },

    async findOngoing() {
      const { data, error } = await table()
        .select(HEADER_COLUMNS)
        .eq("status", "ongoing")
        .maybeSingle();
      if (error) {
        throw mapPostgrestError(error);
      }
      return data ? rowToMonthlyLedger(data as LedgerRow) : null;
    },

    async list() {
      const { data, error } = await table()
        .select(HEADER_COLUMNS)
        .order("month", { ascending: true });
      if (error) {
        throw mapPostgrestError(error);
      }
      return (data as LedgerRow[]).map(rowToMonthlyLedger);
    },

    async updateStatus(id, status) {
      const { data, error } = await table()
        .update({ status })
        .eq("id", id)
        .select(HEADER_COLUMNS)
        .single();
      if (error) {
        throw mapPostgrestError(error);
      }
      return rowToMonthlyLedger(data as LedgerRow);
    },

    async delete(id) {
      const { error } = await table().delete().eq("id", id);
      if (error) {
        throw mapPostgrestError(error);
      }
    },

    async updateOpeningBalance(id, value) {
      const { data, error } = await table()
        .update(openingBalanceToUpdateRow(value))
        .eq("id", id)
        .select(HEADER_COLUMNS)
        .single();
      if (error) {
        throw mapPostgrestError(error);
      }
      return rowToMonthlyLedger(data as LedgerRow);
    },
  };
}
