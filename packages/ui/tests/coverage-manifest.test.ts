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
 * Scope is defined in adr/0020-test-coverage-scoping-and-gate.md. Excluded
 * files (shadcn primitives, stories, barrels) are filtered by
 * coveragePathIgnorePatterns in bunfig.toml, so importing them here is
 * harmless — they won't be counted.
 */
import { expect, test } from "bun:test";

// First-party composites
import "../src/components/autocomplete.tsx";
import "../src/components/avatar-upload.tsx";
import "../src/components/confirm-dialog.tsx";
import "../src/components/credential-input.tsx";
import "../src/components/data-table.tsx";
import "../src/components/date-picker.tsx";
import "../src/components/date-range-picker.tsx";
import "../src/components/date-time-picker.tsx";
import "../src/components/dob-input.tsx";
import "../src/components/dropdown-menu-field.tsx";
import "../src/components/month-select.tsx";
import "../src/components/otp-input.tsx";
import "../src/components/product-switcher.tsx";
import "../src/components/select-field.tsx";
import "../src/components/text-input.tsx";
import "../src/components/year-select.tsx";

// Typography
import "../src/components/typography/code.tsx";
import "../src/components/typography/heading.tsx";
import "../src/components/typography/text.tsx";

// Logos
import "../src/components/logo/budgeting-logo.tsx";
import "../src/components/logo/calendar-logo.tsx";
import "../src/components/logo/doc-logo.tsx";
import "../src/components/logo/finance-logo.tsx";
import "../src/components/logo/logo.tsx";
import "../src/components/logo/notebook-logo.tsx";
import "../src/components/logo/radio-logo.tsx";
import "../src/components/logo/storage-logo.tsx";

// Logic
import "../src/hooks/use-theme.ts";
import "../src/internal/avatar-validation.ts";
import "../src/internal/crop-image.ts";
import "../src/lib/utils.ts";

test("in-scope @nafios/ui modules load for coverage instrumentation", () => {
  expect(true).toBe(true);
});
