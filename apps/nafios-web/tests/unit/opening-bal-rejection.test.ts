import { describe, expect, test } from "bun:test";
import {
  ACK_OVERSPEND_COPY,
  BLOCKED_OPENING_BAL_TOASTS,
  type BlockedOpeningBalReason,
  STALE_ROW_REASONS,
} from "../../src/features/finance/lib/openin-bal-rejection.ts";

// The COPY TABLE for `updateLedger`'s rejections, and the routing decision
// that goes with each one: toast, or dialog. Both halves are worth pinning because
// both are silent when wrong — a missing reason renders an empty toast, and a
// reason mis-sorted into `STALE_ROW_REASONS` either refetches for nothing or,
// worse, leaves a wrong row on screen with no refetch.
//
// `BLOCKED_OPENING_BAL_TOASTS` is a `Record<BlockedOpeningBalReason, ...>`, so a
// NEW reason on the command breaks the build here. What the type cannot check is
// the reverse — copy left behind for a reason that no longer exists — so the key
// set is asserted against the literal list below.

/** Every blocked reason the command can return, per `UpdateLedgerResult`.
 *  `overspend_warning` is absent on purpose: it is the one with a decision
 *  attached, so it drives the ConfirmDialog instead of a toast. */
const BLOCKED: readonly BlockedOpeningBalReason[] = [
  "ledger_not_found",
  "ledger_not_ongoing",
  "negative_amount",
  "exceeds_hard_cap",
];

describe("BLOCKED_OPENING_BAL_TOASTS", () => {
  test("covers every blocked reason and nothing more", () => {
    expect(Object.keys(BLOCKED_OPENING_BAL_TOASTS).sort()).toEqual([...BLOCKED].sort());
  });

  test("excludes overspend_warning — that one is a decision, not a notification", () => {
    expect(BLOCKED_OPENING_BAL_TOASTS).not.toHaveProperty("overspend_warning");
  });

  test.each(
    BLOCKED.map((reason) => [reason] as const),
  )("%s carries non-empty title and description copy", (reason) => {
    // A toast is raised with `duration: Infinity`, so blank copy would sit on the
    // user's screen forever saying nothing.
    const copy = BLOCKED_OPENING_BAL_TOASTS[reason];
    expect(copy.title.trim().length).toBeGreaterThan(0);
    expect(copy.description.trim().length).toBeGreaterThan(0);
  });

  test("the two refresh reasons tell the user a refresh happened", () => {
    // The hook refetches and re-seeds behind these, so the copy has to account
    // for the figure changing under the user.
    for (const reason of ["ledger_not_ongoing", "ledger_not_found"] as const) {
      expect(BLOCKED_OPENING_BAL_TOASTS[reason].description).toContain("refreshed");
    }
  });
});

describe("STALE_ROW_REASONS", () => {
  test("holds exactly the reasons that mean OUR ROW is wrong", () => {
    // Not the guardrail rejections: those mean the INPUT was wrong and the row we
    // hold is still correct, so refetching behind them would be pure noise.
    expect([...STALE_ROW_REASONS].sort()).toEqual(["ledger_not_found", "ledger_not_ongoing"]);
  });

  test("every member has toast copy — the two tables cannot drift apart", () => {
    for (const reason of STALE_ROW_REASONS) {
      expect(BLOCKED_OPENING_BAL_TOASTS[reason]).toBeDefined();
    }
  });

  test("the guardrail rejections are deliberately out", () => {
    expect(STALE_ROW_REASONS.has("negative_amount")).toBe(false);
    expect(STALE_ROW_REASONS.has("exceeds_hard_cap")).toBe(false);
  });
});

describe("ACK_OVERSPEND_COPY", () => {
  test("asks a question the user can answer, and says what saving means", () => {
    // This is the ConfirmDialog's body, not a toast: it has to be enough to decide
    // on, so it names the consequence (drawing from savings) rather than the rule.
    expect(ACK_OVERSPEND_COPY.title.trim().length).toBeGreaterThan(0);
    expect(ACK_OVERSPEND_COPY.description).toContain("savings");
  });
});
