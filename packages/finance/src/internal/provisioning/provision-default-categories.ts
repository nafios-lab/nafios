// @nafios/finance — data layer (src/internal/). The onboarding provisioning API
// + the runtime picker read (EF3.9). This is the app-facing surface the barrel
// exports; the category repository it composes stays internal.
//
// provisionDefaultCategories is the settled mechanism for stocking a brand-new
// user (resolves the EF3 epic's open trigger-vs-seed question): a FINANCE-OWNED
// TS API the AUTH/ONBOARDING layer imports and calls once per new user, as a
// trusted backend job on a SERVICE client (RLS bypassed, `user_id` explicit per
// DB-design §8.2). Finance owns WHAT (the catalog) and HOW (idempotent insert);
// the auth layer owns only WHEN (§4.5 integration contract). It adds exactly one
// rule — the idempotency count-guard — and re-derives nothing.
//
// listCategories is the runtime AUTHED read the EF3.14 picker / EF3.13 grouping
// consume — a thin passthrough to the repository's RLS-scoped listByUser.
//
// Two failure channels only (§4.4): a DB fault throws FinanceDataError (EF3.6,
// reused unextended). There is NO `{ ok:false }` rejection union — provisioning
// takes a `userId`, not free user input, so there is no deterministic input
// rejection to model (and no CodecError channel — categories carry no codec).

import type { Category } from "../../domain/category";
import { DEFAULT_CATEGORIES } from "../../domain/default-categories";
import type { FinanceClient } from "../client";
import { createCategoryRepository } from "../repositories/category.repo";

/**
 * Outcome of provisioning. `seeded` is true iff this call inserted the defaults;
 * false means the user already owned ≥1 category (no write). `categories` is
 * always the user's current set, ordered.
 */
export interface ProvisionCategoriesResult {
  readonly seeded: boolean;
  readonly categories: Category[];
}

/**
 * Idempotently give `userId` the default category set. Called by the
 * AUTH/ONBOARDING layer as a trusted backend job — pass a SERVICE client
 * (createServiceClient) so RLS is bypassed and `user_id` is set explicitly
 * (DB-design §8.2).
 *
 * If the user already owns ≥1 category → no-op, returns
 * `{ seeded: false, categories: <existing, ordered> }`; otherwise inserts
 * DEFAULT_CATEGORIES as that user's rows → `{ seeded: true, categories: <new> }`.
 * Takes a `userId`, not free input → no rejection union; throws FinanceDataError
 * on a DB fault only.
 *
 * Idempotency is a COUNT-GUARD (§4.3), not `ON CONFLICT`: EF1.2 ships no
 * `UNIQUE(user_id, name)` (§13 #3), so "provision iff the user owns zero
 * categories" is the rule. Running onboarding twice for a stocked user is a safe
 * no-op. Documented edges: a rare concurrent double-call can double-seed (benign,
 * deletable), and re-provisioning a user who deleted ALL their categories
 * re-stocks them (a zero-category state is unusable, so re-seeding it is benign).
 *
 * (Also correct on an authed client whose `auth.uid()` === `userId` — the explicit
 * `user_id` then simply matches the RLS WITH CHECK.)
 */
export async function provisionDefaultCategories(
  client: FinanceClient,
  userId: string,
): Promise<ProvisionCategoriesResult> {
  const repo = createCategoryRepository(client);

  // (1) The idempotency count-guard — the ONE rule this layer adds. Explicit
  //     user_id filter, so it is correct under the service client (§4.3 step 1).
  const existing = await repo.countForUser(userId);

  // (2) Already stocked (≥1 category) → NO write; return the user's current set,
  //     ordered, via the explicit-user_id read (§4.3 step 2).
  if (existing > 0) {
    const categories = await repo.listForUser(userId);
    return { seeded: false, categories };
  }

  // (3) Zero categories → seed the catalog as this user's rows (color null) and
  //     return the created set, in catalog/display order (§4.3 step 3).
  const categories = await repo.insertManyForUser(
    userId,
    DEFAULT_CATEGORIES.map((c) => ({ name: c.name, displayOrder: c.displayOrder, color: null })),
  );
  return { seeded: true, categories };
}

/**
 * The AUTHED caller's categories, ordered by display_order then name. The picker
 * source for EF3.14 and the grouping source for EF3.13. Thin passthrough to the
 * repository's listByUser — performs no provisioning (onboarding already ran) and
 * must NOT be called on a service client (RLS bypassed → would return every
 * user's rows).
 */
export function listCategories(client: FinanceClient): Promise<Category[]> {
  return createCategoryRepository(client).listByUser();
}
