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
 * DEFERRED — not imported here yet because they pull in `createServerFn` from
 * @tanstack/react-start, which needs the Vite/Start compiler transform and
 * throws on a raw import. They remain in-scope and will enter the denominator
 * once their tests mock the runtime:
 *   - src/lib/auth-fns.ts
 *   - src/components/navbar.tsx (imports auth-fns)
 */
import { expect, test } from "bun:test";

// Schemas
import "../src/features/auth/schemas/login-schema.ts";
import "../src/features/auth/schemas/signup-schema.ts";

// Hooks & context
import "../src/features/auth/hooks/use-signup-wizard.ts";
import "../src/features/auth/context/signup-wizard.tsx";

// Feature components
import "../src/features/auth/components/family-member-form.tsx";
import "../src/features/auth/components/login-form.tsx";
import "../src/features/auth/components/signup-step-account.tsx";
import "../src/features/auth/components/signup-step-family.tsx";
import "../src/features/auth/components/signup-step-review.tsx";
import "../src/features/auth/components/signup-step-security.tsx";
import "../src/features/auth/components/signup-wizard.tsx";

test("in-scope @nafios/web modules load for coverage instrumentation", () => {
  expect(true).toBe(true);
});
