import { describe, expect, test } from "bun:test";
import {
  ACK_OVERSPEND_COPY,
  type BlockedLedgerUpdateRejection,
  STALE_ROW_REASONS,
  UPDATE_LEDGER_REJECTION_TOASTS_MAP,
} from "../../src/features/finance/lib/ledger-header-update-rejection.ts";

// The COPY TABLE for `updateLedger`'s rejections, and the routing decision that
// goes with each one: toast, or dialog. Both halves are worth pinning because both
// are silent when wrong — a missing reason renders an empty toast, and a reason
// mis-sorted into `STALE_ROW_REASONS` either refetches for nothing or, worse,
// leaves a wrong row on screen with no refetch.
//
// `UPDATE_LEDGER_REJECTION_TOASTS_MAP` is a `Record<BlockedLedgerUpdateRejection, …>`,
// so a NEW reason on the command breaks the build here. What the type cannot check
// is the reverse — copy left behind for a reason that no longer exists — so the key
// set is asserted against the literal list below.
//
// This table now serves EVERY header field (`useUpdateLedgerHeader` drives both the
// opening-balance and max-capped cards off it), which is what makes the per-reason
// copy worth re-reading rather than just re-counting.

/** Every blocked reason the command can return, per `UpdateLedgerResult`.
 *  `overspend_warning` is absent on purpose: it is the one with a decision
 *  attached, so it drives the ConfirmDialog instead of a toast. */
const BLOCKED: readonly BlockedLedgerUpdateRejection[] = [
  "ledger_not_found",
  "ledger_not_ongoing",
  "negative_amount",
  "exceeds_hard_cap",
];

describe("UPDATE_LEDGER_REJECTION_TOASTS_MAP", () => {
  test("covers every blocked reason and nothing more", () => {
    expect(Object.keys(UPDATE_LEDGER_REJECTION_TOASTS_MAP).sort()).toEqual([...BLOCKED].sort());
  });

  test("excludes overspend_warning — that one is a decision, not a notification", () => {
    expect(UPDATE_LEDGER_REJECTION_TOASTS_MAP).not.toHaveProperty("overspend_warning");
  });

  test.each(
    BLOCKED.map((reason) => [reason] as const),
  )("%s carries non-empty title and description copy", (reason) => {
    // A toast is raised with `duration: Infinity`, so blank copy would sit on the
    // user's screen forever saying nothing.
    const copy = UPDATE_LEDGER_REJECTION_TOASTS_MAP[reason];
    expect(copy.title.trim().length).toBeGreaterThan(0);
    expect(copy.description.trim().length).toBeGreaterThan(0);
  });

  test("the two refresh reasons tell the user a refresh happened", () => {
    // The hook refetches and re-seeds behind these, so the copy has to account for
    // the figure changing under the user.
    for (const reason of ["ledger_not_ongoing", "ledger_not_found"] as const) {
      expect(UPDATE_LEDGER_REJECTION_TOASTS_MAP[reason].description).toContain("refreshed");
    }
  });

  test("the two stale-row reasons read field-agnostically", () => {
    // These fire from either card, so they must not name a field the user was not
    // editing. They talk about the LEDGER, which is what actually went stale.
    for (const reason of ["ledger_not_ongoing", "ledger_not_found"] as const) {
      expect(UPDATE_LEDGER_REJECTION_TOASTS_MAP[reason].title.toLowerCase()).toContain("ledger");
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
      expect(UPDATE_LEDGER_REJECTION_TOASTS_MAP[reason]).toBeDefined();
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
