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
// Onboarding lib
import "../src/features/onboarding/lib/avatar.ts";
import "../src/features/onboarding/lib/family-helpers.ts";
import "../src/features/onboarding/lib/onboarding-data.ts";
// Finance lib
import "../src/features/finance/lib/finance-client.ts";
import "../src/features/finance/lib/format-month.ts";
import "../src/features/finance/lib/local-today-iso.ts";
// Onboarding context
import "../src/features/onboarding/context/onboarding-wizard-provider.tsx";
// Hooks
import "../src/features/auth/hooks/use-account-signup.ts";
import "../src/features/auth/hooks/use-sign-in.ts";
import "../src/features/auth/hooks/use-sign-out.ts";
import "../src/features/onboarding/hooks/use-complete-onboarding.ts";
import "../src/features/onboarding/hooks/use-onboarding-profile.ts";
import "../src/features/finance/hooks/use-finance-home-state.ts";
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
import "../src/features/finance/components/finance-home.tsx";
import "../src/features/finance/components/ledger-detail-card.tsx";
import "../src/features/finance/components/ledger-start-card.tsx";
import "../src/features/finance/components/pending-reconciliation-section.tsx";
import "../src/features/finance/components/view-settled-ledgers-button.tsx";

test("coverage manifest imports every in-scope module", () => {
  expect(true).toBe(true);
});
