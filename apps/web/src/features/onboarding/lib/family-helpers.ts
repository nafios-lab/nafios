import type { FamilyMemberValues } from "../schemas/onboarding-schema";

/**
 * A stored family member plus a **session-only** `clientKey`. The key is a React
 * list key and the add/edit/delete target; it is regenerated on every remount
 * (e.g. back-navigation) and is deliberately **not** part of `familyMemberSchema`
 * or the persisted wizard state — the stored shape stays identical to the spec
 * `FamilyMemberValues` entity. The matching Storage path segment
 * (`family/{clientKey}.webp`) is assigned later, in the persistence pass.
 */
export type FamilyListEntry = { clientKey: string } & FamilyMemberValues;

/**
 * Up to two uppercase initials for an avatar fallback. Two-or-more words →
 * first letter of the first and last word ("Nuratikah Afifah" → "NA"); a single
 * word → its first two letters ("Nuratikah" → "NU"); blank → "".
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * Masks an NRIC for display, revealing only the last four characters behind a
 * fixed prefix (`S8986123A` → `*****123A`) — the Singapore/PDPA convention of
 * showing the last three digits + checksum. Returns "" for a blank input;
 * callers omit the line entirely when there is no NRIC.
 */
export function maskNric(nric: string): string {
  const trimmed = nric.trim();
  if (!trimmed) return "";
  return `*****${trimmed.slice(-4)}`;
}

/**
 * Converts the masked DOB display (`DD / MM / YYYY`) to an ISO `YYYY-MM-DD`
 * string. Returns `undefined` for a blank or incomplete entry, or one whose
 * day/month falls out of range — an incomplete DOB is treated as "not provided"
 * (the field is optional), never a stored partial value.
 */
export function dobDisplayToIso(display: string): string | undefined {
  const digits = display.replace(/\D/g, "");
  if (digits.length !== 8) return undefined;

  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);

  const d = Number(day);
  const m = Number(month);
  if (d < 1 || d > 31 || m < 1 || m > 12) return undefined;

  return `${year}-${month}-${day}`;
}

/**
 * Inverse of {@link dobDisplayToIso} — turns a stored ISO `YYYY-MM-DD` back into
 * the `DD / MM / YYYY` display used to seed the edit form. Returns "" when the
 * input is missing or not a well-formed ISO date.
 */
export function dobIsoToDisplay(iso?: string): string {
  if (!iso) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${day} / ${month} / ${year}`;
}

/**
 * Drops the session-only `clientKey`, yielding the spec-shaped member written
 * into wizard state. Keeping this here (vs. an inline destructure) keeps the
 * orchestrator lean and the strip-on-persist contract unit-testable.
 */
export function stripClientKey(entry: FamilyListEntry): FamilyMemberValues {
  return {
    name: entry.name,
    relationship: entry.relationship,
    avatar: entry.avatar,
    nric: entry.nric,
    mobileNo: entry.mobileNo,
    dateOfBirth: entry.dateOfBirth,
  };
}
