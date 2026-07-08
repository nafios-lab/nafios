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

import type { Money } from "../../domain/money";
import { encodeMonth, type Month } from "../../domain/month";
import type { LedgerStatus, MonthlyLedger } from "../../domain/monthly-ledger";
import type { FinanceClient } from "../client";
import { mapPostgrestError } from "../errors";
import { type LedgerRow, newLedgerToInsertRow, rowToLedgerHeader } from "../mappers/ledger.mapper";

/**
 * The PERSISTED ledger — a MonthlyLedger WITHOUT its envelopes. Everything the
 * monthly_ledger table alone can produce; envelopes (EF3.8) are attached, with
 * computed metrics, by the composed read surface (EF3.10). Returning
 * Omit<…, 'envelopes'> (not a MonthlyLedger with envelopes: []) is deliberate:
 * it makes it a TYPE ERROR to run computeLedgerMetrics on a bare header read.
 */
export type LedgerHeader = Omit<MonthlyLedger, "envelopes">;

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

/** The columns a LedgerHeader is built from — the mapper's read surface. */
const HEADER_COLUMNS = "id, month, opening_balance, max_capped, status, created_at, settled_at";

export interface LedgerRepository {
  /**
   * Insert a new ledger (user_id filled by the DB default auth.uid() — never set
   * here). Returns the created LedgerHeader (read back so DB-defaulted
   * id/createdAt/status are present). Throws FinanceDataError on a DB failure
   * (duplicate_month | ongoing_exists | check_violation | …).
   */
  insert(input: NewLedger): Promise<LedgerHeader>;

  /** Fetch by id, RLS-scoped to the caller. null when not found OR not owned. */
  findById(id: string): Promise<LedgerHeader | null>;

  /** The caller's ledger for a given month, or null — the uniqueness/conflict
   *  probe EF3.7 uses before opening a month. */
  findByMonth(month: Month): Promise<LedgerHeader | null>;

  /** THE "one ongoing" query: the caller's single `ongoing` ledger, or null. The
   *  uq_one_ongoing_ledger partial unique index guarantees at most one. */
  findOngoing(): Promise<LedgerHeader | null>;

  /** All the caller's ledgers, chronological by month (ascending). [] when none.
   *  Satisfies EF3.4's LedgerSummary[] input directly (month + status). */
  list(): Promise<LedgerHeader[]>;

  /**
   * Transition a ledger's status (EF3 uses this ONLY for ongoing → reconciling).
   * Returns the updated header. Does NOT enforce the guardrail, the mutability
   * rule, or atomicity across writes — that composition is EF3.7's.
   */
  updateStatus(
    id: string,
    status: Extract<LedgerStatus, "ongoing" | "reconciling">,
  ): Promise<LedgerHeader>;

  /** Delete a ledger, RLS-scoped. A complete-CRUD primitive; NO EF3 user story
   *  deletes a ledger — present for test teardown and repository completeness. */
  delete(id: string): Promise<void>;
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
      return rowToLedgerHeader(data as LedgerRow);
    },

    async findById(id) {
      const { data, error } = await table().select(HEADER_COLUMNS).eq("id", id).maybeSingle();
      if (error) {
        throw mapPostgrestError(error);
      }
      return data ? rowToLedgerHeader(data as LedgerRow) : null;
    },

    async findByMonth(month) {
      const { data, error } = await table()
        .select(HEADER_COLUMNS)
        .eq("month", encodeMonth(month))
        .maybeSingle();
      if (error) {
        throw mapPostgrestError(error);
      }
      return data ? rowToLedgerHeader(data as LedgerRow) : null;
    },

    async findOngoing() {
      const { data, error } = await table()
        .select(HEADER_COLUMNS)
        .eq("status", "ongoing")
        .maybeSingle();
      if (error) {
        throw mapPostgrestError(error);
      }
      return data ? rowToLedgerHeader(data as LedgerRow) : null;
    },

    async list() {
      const { data, error } = await table()
        .select(HEADER_COLUMNS)
        .order("month", { ascending: true });
      if (error) {
        throw mapPostgrestError(error);
      }
      return (data as LedgerRow[]).map(rowToLedgerHeader);
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
      return rowToLedgerHeader(data as LedgerRow);
    },

    async delete(id) {
      const { error } = await table().delete().eq("id", id);
      if (error) {
        throw mapPostgrestError(error);
      }
    },
  };
}
