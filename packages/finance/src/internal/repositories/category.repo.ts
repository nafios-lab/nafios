// @nafios/finance — data layer (src/internal/). The category repository (EF3.9):
// the typed CRUD-lite primitives over the category table. The THIRD finance
// repository — it reuses EF3.6's foundations verbatim (the FinanceDataError +
// mapPostgrestError classifier, the row↔domain mapper shape) and extends the
// classifier with NO new SQLSTATE branch: a category write has no user-supplied
// FK (its only FK is `user_id`, validated by NOT NULL/RLS, not a picker value).
//
// NO business logic here — no idempotency guard (that is the provisioning layer's
// one rule), no metrics, no money, no enum, no status seam. This is the simplest
// repository in the package: a data primitive the provisioning API composes.
//
// TWO client contexts, one surface. The `*ForUser(userId)` methods set/filter
// `user_id` EXPLICITLY, so they are correct under a SERVICE client (RLS bypassed —
// the onboarding path) as well as an AUTHED one. `listByUser()` is the RLS-scoped
// runtime read and must run on an authed client (a service client would return
// every user's rows). The repository stays INTERNAL (like the ledger/envelope
// repos): the barrel exports provisionDefaultCategories / listCategories, which
// compose it.

import type { Category } from "../../domain/category";
import type { FinanceClient } from "../client";
import { mapPostgrestError } from "../errors";
import {
  type CategoryRow,
  newCategoryToInsertRow,
  rowToCategory,
} from "../mappers/category.mapper";

// ───────────────────────────── Insert input ─────────────────────────────

/**
 * The fields to insert a category. `user_id` is supplied by the repository method
 * (explicit — §4.2), never by the caller here; `id`, `created_at`, `updated_at`
 * are DB defaults. `displayOrder` defaults to 0, `color` to null (the mapper).
 */
export interface NewCategory {
  readonly name: string;
  readonly displayOrder?: number; // -> display_order, default 0
  readonly color?: string | null; // default null
}

// ───────────────────────── The category repository ─────────────────────────

/** The category columns the mapper builds a Category from — the repository's read
 *  surface (excludes user_id, created_at, updated_at). */
const CATEGORY_COLUMNS = "id, name, display_order, color";

export interface CategoryRepository {
  /** Count the categories owned by `userId`. Filters user_id EXPLICITLY, so it is
   *  correct under a service client (RLS bypassed) and an authed one. The
   *  idempotency guard's input. Throws FinanceDataError on a DB fault. */
  countForUser(userId: string): Promise<number>;

  /** Bulk-insert categories owned by `userId` (user_id set EXPLICITLY —
   *  service/trusted-job safe, DB-design §8.2). Returns the created rows, in the
   *  order the DB returned them (a single bulk insert preserves array order — so
   *  seeding DEFAULT_CATEGORIES yields display_order 0..n). Throws
   *  FinanceDataError on a DB fault. */
  insertManyForUser(userId: string, inputs: readonly NewCategory[]): Promise<Category[]>;

  /** `userId`'s own categories, filtered by user_id EXPLICITLY (service/trusted-job
   *  safe — the provisioning no-op read), ordered by display_order asc then name
   *  asc. [] when they have none. Distinct from `listByUser` because provisioning
   *  runs on a SERVICE client, where an RLS-scoped read would return every user's
   *  rows (§2.2 / §4.3). Throws FinanceDataError on a DB fault. */
  listForUser(userId: string): Promise<Category[]>;

  /** The AUTHED caller's own categories under RLS, ordered by display_order asc
   *  then name asc. [] when they have none. The runtime picker read — do NOT call
   *  on a service client (RLS bypassed → would return every user's rows). */
  listByUser(): Promise<Category[]>;
}

/**
 * Construct a category repository bound to a FinanceClient (EF2.2). The
 * `*ForUser(userId)` methods work under either a service or authed client; the
 * caller picks the client per §4.2 (service for provisioning, authed for the read).
 */
export function createCategoryRepository(client: FinanceClient): CategoryRepository {
  const table = () => client.from("category");

  return {
    async countForUser(userId) {
      const { count, error } = await table()
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      if (error) {
        throw mapPostgrestError(error);
      }
      return count ?? 0;
    },

    async insertManyForUser(userId, inputs) {
      const { data, error } = await table()
        .insert(inputs.map((input) => newCategoryToInsertRow(userId, input)))
        .select(CATEGORY_COLUMNS);
      if (error) {
        throw mapPostgrestError(error);
      }
      return (data as CategoryRow[]).map(rowToCategory);
    },

    async listForUser(userId) {
      const { data, error } = await table()
        .select(CATEGORY_COLUMNS)
        .eq("user_id", userId)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) {
        throw mapPostgrestError(error);
      }
      return (data as CategoryRow[]).map(rowToCategory);
    },

    async listByUser() {
      const { data, error } = await table()
        .select(CATEGORY_COLUMNS)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) {
        throw mapPostgrestError(error);
      }
      return (data as CategoryRow[]).map(rowToCategory);
    },
  };
}
