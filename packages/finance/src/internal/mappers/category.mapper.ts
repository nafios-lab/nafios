// @nafios/finance — data layer (src/internal/). The row↔domain mapper for the
// category table (EF3.9). The THIRD mapper — it copies the ledger mapper's
// one-function-per-direction shape (ledger.mapper.ts, EF3.6) and is the SIMPLEST
// in the package: no money, no enum, no status seam, no codec. Just a column
// rename (`display_order` → `displayOrder`) and a verbatim `color` passthrough.
//
// The only thing worth stating twice: the WRITE direction sets `user_id`
// EXPLICITLY from the passed `userId` (§4.2). This is the service/trusted-job
// onboarding path — a `service_role` insert that omits `user_id` is rejected by
// `NOT NULL` because `auth.uid()` is null (DB-design §8.2). Setting it explicitly
// is harmless on an authed client too (it equals `auth.uid()`, passing the
// `owner_all` WITH CHECK), so the one write serves both callers.

import type { Tables, TablesInsert } from "@nafios/database";
import type { Category } from "../../domain/category";
import type { NewCategory } from "../repositories/category.repo";

/**
 * The category columns a Category is built from — every column the domain type
 * needs, EXCLUDING `user_id` (RLS-scoped, never surfaced) and the audit trio the
 * domain omits (`created_at`, `updated_at`). The repository selects exactly these.
 */
export type CategoryRow = Pick<Tables<"category">, "id" | "name" | "display_order" | "color">;

/**
 * READ: category row → Category. `id`/`name` pass through; `displayOrder` renames
 * `display_order`; `color` is verbatim (may be null). `user_id`/`created_at`/
 * `updated_at` are NOT surfaced.
 */
export function rowToCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    displayOrder: row.display_order,
    color: row.color,
  };
}

/**
 * WRITE: `(userId, NewCategory)` → category insert row. `user_id` is set
 * EXPLICITLY to `userId` (the service/trusted-job path — §4.2); `name` is set;
 * `display_order` defaults to 0 and `color` to null when the input omits them.
 * `id`, `created_at`, `updated_at` are OMITTED (DB defaults).
 */
export function newCategoryToInsertRow(
  userId: string,
  input: NewCategory,
): TablesInsert<"category"> {
  return {
    user_id: userId,
    name: input.name,
    display_order: input.displayOrder ?? 0,
    color: input.color ?? null,
  };
}
