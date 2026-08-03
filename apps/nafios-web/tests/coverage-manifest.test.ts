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
// Schemas
import "../src/features/auth/schemas/login-schema.ts";
import "../src/features/auth/schemas/signup-schema.ts";
// Hooks
import "../src/features/auth/hooks/use-account-signup.ts";
import "../src/features/auth/hooks/use-sign-in.ts";
import "../src/features/auth/hooks/use-sign-out.ts";
// Components
import "../src/features/auth/components/login-form.tsx";
import "../src/features/auth/components/sign-out-button.tsx";
import "../src/features/auth/components/signup-form.tsx";

test("coverage manifest imports every in-scope module", () => {
  expect(true).toBe(true);
});
