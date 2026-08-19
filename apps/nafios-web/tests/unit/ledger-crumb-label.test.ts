import { describe, expect, test } from "bun:test";
import { ledgerCrumbLabel } from "../../src/features/finance/lib/ledger-crumb-label.ts";

// The label is derived from a RAW ROUTE PARAM — whatever sits in the URL — so
// these cases are split between the happy path and the junk a hand-typed or
// stale link can deliver.

describe("ledgerCrumbLabel", () => {
  test("names the kind, then the month: `Ledger : August 2026`", () => {
    // The noun lives in the label because `/finance/ledger` is not a place —
    // it redirects to the module root, so it cannot be a crumb of its own.
    expect(ledgerCrumbLabel("2026-08-01")).toBe("Ledger : August 2026");
  });

  test("takes the month the param falls in, not just its prefix", () => {
    // The param is a first-of-month DATE (what `encodeMonth` emits), but the
    // label must not depend on the day component being 01.
    expect(ledgerCrumbLabel("2026-12-31")).toBe("Ledger : December 2026");
  });

  test.each([
    ["not a date at all", "august"],
    ["a month, not a date", "2026-08"],
    ["an impossible month", "2026-13-01"],
    ["an impossible day", "2026-02-30"],
    ["empty", ""],
  ])("degrades to the bare noun when the param is %s", (_case, param) => {
    // A junk URL is the ledger page's error to surface. The bar is module
    // chrome: it must stay standing, so this never throws.
    expect(ledgerCrumbLabel(param)).toBe("Ledger");
  });
});
