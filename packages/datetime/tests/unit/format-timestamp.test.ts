import { describe, expect, test } from "bun:test";
import { CodecError } from "../../src/codec-error";
import { formatTimestamp } from "../../src/format-timestamp";

// formatTimestamp renders in LOCAL time, so no assertion may hard-code a wall
// clock — that would only pass in the author's zone. Every expected string here
// is derived from a locally-constructed Date (round-tripped through
// `toISOString`, exactly the shape PostgREST returns), which holds in ANY TZ.
/** The ISO string for a given LOCAL wall-clock time. */
const isoForLocal = (y: number, m: number, d: number, h: number, min: number): string =>
  new Date(y, m, d, h, min, 0, 0).toISOString();

describe("formatTimestamp", () => {
  test("#1 renders the house format: un-padded day, short month, 12-hour time", () => {
    expect(formatTimestamp(isoForLocal(2027, 1, 1, 17, 15))).toBe("1 Feb 2027, 5:15 PM");
  });

  test("#2 a two-digit day and a morning time", () => {
    expect(formatTimestamp(isoForLocal(2026, 11, 25, 9, 5))).toBe("25 Dec 2026, 9:05 AM");
  });

  test("#3 the 12-hour boundaries read as 12, not 0", () => {
    expect(formatTimestamp(isoForLocal(2027, 6, 4, 0, 0))).toBe("4 Jul 2027, 12:00 AM");
    expect(formatTimestamp(isoForLocal(2027, 6, 4, 12, 0))).toBe("4 Jul 2027, 12:00 PM");
  });

  test("#4 offset spellings of the SAME instant render identically (Z, +00:00, +08:00)", () => {
    const utcZ = formatTimestamp("2027-02-01T09:15:00Z");
    expect(formatTimestamp("2027-02-01T09:15:00+00:00")).toBe(utcZ);
    expect(formatTimestamp("2027-02-01T09:15:00.000Z")).toBe(utcZ);
    // 17:15+08:00 IS 09:15Z — a different spelling, not a different moment.
    expect(formatTimestamp("2027-02-01T17:15:00+08:00")).toBe(utcZ);
  });

  test("#5 fractional seconds are accepted, and never reach the label", () => {
    const label = formatTimestamp("2027-02-01T09:15:23.482Z");
    expect(label).toBe(formatTimestamp("2027-02-01T09:15:00Z"));
    expect(label).not.toContain("482");
  });

  test("#6 rejects a bare YYYY-MM-DD — a date is not an instant", () => {
    expect(() => formatTimestamp("2027-02-01")).toThrow(CodecError);
    try {
      formatTimestamp("2027-02-01");
    } catch (e) {
      expect((e as CodecError).code).toBe("timestamp_not_a_datetime");
    }
  });

  test("#7 rejects garbage, empty strings and a YYYY-MM month", () => {
    for (const bad of ["", "not-a-date", "2027-02", "tomorrow", "01/02/2027"]) {
      expect(() => formatTimestamp(bad)).toThrow(CodecError);
    }
  });

  test("#8 rejects an impossible instant that is shaped like one", () => {
    expect(() => formatTimestamp("2027-13-01T10:00:00Z")).toThrow(CodecError);
    try {
      formatTimestamp("2027-13-01T10:00:00Z");
    } catch (e) {
      expect((e as CodecError).code).toBe("timestamp_not_a_datetime");
    }
  });
});
