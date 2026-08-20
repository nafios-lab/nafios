/**
 * Coverage manifest — NOT a behavioral test.
 *
 * Bun only measures coverage for files a test actually loads, so an in-scope
 * module with no test would silently vanish from the report and inflate the
 * percentage. Importing every in-scope module here forces it into the coverage
 * denominator: an untested file surfaces as low coverage instead of disappearing.
 *
 * The auth lib, hooks, and components all have dedicated tests; they enter the
 * denominator through those. The schemas are only *transitively* imported by the
 * forms, so they are pinned here as a backstop — a future untested module can't
 * dodge the gate by simply never being imported.
 *
 * Scope is defined in adr/0020-test-coverage-scoping-and-gate.md. The routing
 * layer (routes/, router.tsx, routeTree.gen.ts) is excluded via
 * coveragePathIgnorePatterns in bunfig.toml.
 */
import { expect, test } from "bun:test";

// Lib
import "../src/lib/auth.ts";
import "../src/lib/database.ts";
// Schemas
import "../src/features/auth/schemas/login-schema.ts";
import "../src/features/auth/schemas/signup-schema.ts";
import "../src/features/onboarding/schemas/onboarding-schema.ts";
import "../src/features/finance/schemas/create-ledger-schema.ts";
// Onboarding lib
import "../src/features/onboarding/lib/avatar.ts";
import "../src/features/onboarding/lib/family-helpers.ts";
import "../src/features/onboarding/lib/onboarding-data.ts";
// Finance lib
import "../src/features/finance/lib/finance-client.ts";
import "../src/features/finance/lib/ledger-crumb-label.ts";
import "../src/features/finance/lib/local-today-iso.ts";
// Onboarding context
import "../src/features/onboarding/context/onboarding-wizard-provider.tsx";
// Finance client state (ADR-0030) — atoms + the store boundary
import "../src/features/finance/state/ledger-sheet/ledger-sheet-provider.tsx";
import "../src/features/finance/state/ledger-sheet/ledger-sheet.atoms.ts";
// Hooks
import "../src/features/auth/hooks/use-account-signup.ts";
import "../src/features/auth/hooks/use-sign-in.ts";
import "../src/features/auth/hooks/use-sign-out.ts";
import "../src/features/onboarding/hooks/use-complete-onboarding.ts";
import "../src/features/onboarding/hooks/use-onboarding-profile.ts";
import "../src/features/finance/hooks/use-finance-home-state.ts";
import "../src/features/finance/hooks/use-ledger.ts";
import "../src/features/finance/hooks/use-update-opening-bal.ts";
// Components
import "../src/features/auth/components/login-form.tsx";
import "../src/features/auth/components/sign-out-button.tsx";
import "../src/features/auth/components/signup-form.tsx";
import "../src/features/onboarding/components/acc-creation-loader.tsx";
import "../src/features/onboarding/components/family-member-form.tsx";
import "../src/features/onboarding/components/family-member-list-item.tsx";
import "../src/features/onboarding/components/onboard-step-family.tsx";
import "../src/features/onboarding/components/onboard-step-profile.tsx";
import "../src/features/onboarding/components/onboarding-wizard.tsx";
import "../src/features/finance/components/home/finance-home.tsx";
import "../src/features/finance/components/home/ledger-detail-card.tsx";
import "../src/features/finance/components/home/ledger-start-card.tsx";
// `components/ledger/index.tsx` is the LedgerSheet itself, not a barrel — the
// `**/index.ts` ignore pattern does not cover it, so it is in scope and pinned here.
import "../src/features/finance/components/ledger/index.tsx";
import "../src/features/finance/components/ledger/ledger-header-bar.tsx";
import "../src/features/finance/components/ledger/ledger-loading.tsx";
import "../src/features/finance/components/ledger/ledger-status-alert.tsx";
// The summary strip moved to `ledger/metrics/` (2026-08). `metrics/index.tsx` is
// the strip itself, not a barrel — the `**/index.ts` ignore pattern does not
// cover a .tsx, so it is in scope and pinned alongside the card it composes.
import "../src/features/finance/components/ledger/metrics/index.tsx";
import "../src/features/finance/components/ledger/metrics/metric-card.tsx";
import "../src/features/finance/components/reconciliation/pending-reconciliation-section.tsx";
import "../src/features/finance/components/shared/view-settled-ledgers-button.tsx";
// Shell chrome: the navbar skeleton + its slot contract, which every module
// layout fills. The rest of the shell (sidebar, service menu) is still untested
// and unpinned — pinning it belongs with its own tests, not this change.
import "../src/shared/components/navbar.tsx";

test("coverage manifest imports every in-scope module", () => {
  expect(true).toBe(true);
});
