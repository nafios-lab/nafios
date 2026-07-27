// @nafios/finance — domain layer (pure). The default-category catalog (EF3.9).
//
// The SINGLE SOURCE OF TRUTH for the eight-category default set a brand-new user
// is provisioned with (finance-domain-spec §3, "Categories (default set)"). It
// lives here — one pure constant, zero I/O — so that:
//   • nothing in SQL and nothing in the auth/onboarding package hardcodes the list;
//   • tuning it (the list is PROVISIONAL — EF3 epic Notes) is a one-line domain
//     edit, never a migration and never an auth-package change.
//
// Once provisioned these become ordinary, fully-mutable user rows (rename /
// reorder / recolor / delete). The names below are SEED VALUES, not reserved
// words — "Set-Asides" is only a seed name (RFC-008); nothing downstream keys off
// any default name.

/**
 * One entry in the canonical seed list. `color` is omitted — defaults ship
 * uncolored (recolor is a later reference-data capability, out of scope in EF3).
 * `displayOrder` is 0-based and monotonic (the spec's 1–8 numbering is a display
 * default, not a payment priority — finance-domain-spec §3 — and 0-based keeps it
 * consistent with the envelope `sortOrder` convention).
 */
export interface DefaultCategory {
  readonly name: string;
  readonly displayOrder: number;
}

/**
 * The canonical default category set (finance-domain-spec §3). Source of truth for
 * provisioning — no SQL and no auth-package code hardcodes this list.
 *
 * PROVISIONAL: expected to be tuned during development (EF3 epic Notes).
 */
export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { name: "Debt", displayOrder: 0 },
  { name: "Subscriptions", displayOrder: 1 },
  { name: "Taxes", displayOrder: 2 },
  { name: "Bills", displayOrder: 3 },
  { name: "Set-Asides", displayOrder: 4 },
  { name: "Advisories", displayOrder: 5 },
  { name: "Insurances & Investments", displayOrder: 6 },
  { name: "Life", displayOrder: 7 },
];
