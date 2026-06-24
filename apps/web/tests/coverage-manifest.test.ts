/**
 * Coverage manifest — NOT a behavioral test.
 *
 * Bun only measures coverage for files a test actually loads, so an in-scope
 * module with no test would silently vanish from the report and inflate the
 * percentage. Importing every in-scope module here forces it into the coverage
 * denominator: untested files surface as low coverage instead of disappearing.
 *
 * As real tests land, modules stay listed here as a backstop — a newly added
 * untested file can't dodge the gate by simply never being imported.
 *
 * Scope is defined in adr/0020-test-coverage-scoping-and-gate.md. The routing
 * layer (routes/, router.tsx, routeTree.gen.ts) is excluded via
 * coveragePathIgnorePatterns in bunfig.toml.
 *
 * The former DEFERRED set — the `createServerFn` server fns (lib/auth-fns,
 * lib/onboarding-fns), the request-scoped cookie adapter (lib/server-cookies),
 * and navbar — now have real tests. `createServerFn` and the auth/db/router
 * boundaries are stubbed process-wide in tests/setup.ts so those modules build
 * and their real bodies run under test. They enter the denominator via those
 * tests; no manifest import is needed.
 */
import { expect, test } from "bun:test";

// Schemas
import "../src/features/auth/schemas/login-schema.ts";
import "../src/features/auth/schemas/signup-schema.ts";
import "../src/features/onboarding/schemas/onboarding-schema.ts";

// Hooks & context
import "../src/features/auth/hooks/use-account-signup.ts";
import "../src/features/auth/hooks/use-sign-in.ts";
import "../src/features/onboarding/context/onboarding-wizard-provider.tsx";
import "../src/features/onboarding/hooks/use-onboarding-profile.ts";

// Feature components
import "../src/features/auth/components/login-form.tsx";
import "../src/features/auth/components/signup-form.tsx";
import "../src/features/onboarding/components/onboard-step-family.tsx";
import "../src/features/onboarding/components/onboard-step-profile.tsx";
import "../src/features/onboarding/components/onboard-step-review.tsx";
import "../src/features/onboarding/components/onboarding-wizard.tsx";

test("in-scope @nafios/web modules load for coverage instrumentation", () => {
  expect(true).toBe(true);
});
