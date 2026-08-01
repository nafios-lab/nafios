/**
 * Local client date as a "YYYY-MM-DD" string — the browser's calendar day.
 *
 * The finance-home read runs client-side (ADR-0026), so `today` is the user's
 * actual local clock (per-user-timezone accurate; no server clock to reconcile).
 * Built from local components (NOT `toISOString`, which is UTC) so the
 * day-of-month math matches the user's calendar day. This is the only clock read
 * — kept out of the pure resolver (extracted from EF3.10's mock seam).
 */
export function localTodayIso(): string {
  const now = new Date();
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
