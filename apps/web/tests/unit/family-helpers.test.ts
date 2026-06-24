import { describe, expect, test } from "bun:test";
import {
  dobDisplayToIso,
  dobIsoToDisplay,
  type FamilyListEntry,
  initials,
  maskNric,
  stripClientKey,
} from "../../src/features/onboarding/lib/family-helpers.ts";

describe("initials", () => {
  test("uses the first letter of the first and last word", () => {
    expect(initials("Nuratikah Afifah")).toBe("NA");
  });

  test("lowercases are uppercased", () => {
    expect(initials("john doe")).toBe("JD");
  });

  test("spans the outer words when there are three or more", () => {
    expect(initials("Mary Jane Watson")).toBe("MW");
  });

  test("takes the first two letters of a single word", () => {
    expect(initials("Nuratikah")).toBe("NU");
  });

  test("handles a single-character name", () => {
    expect(initials("A")).toBe("A");
  });

  test("collapses surrounding and inner whitespace", () => {
    expect(initials("  John   Doe  ")).toBe("JD");
  });

  test("returns an empty string for a blank name", () => {
    expect(initials("   ")).toBe("");
    expect(initials("")).toBe("");
  });
});

describe("maskNric", () => {
  test("reveals only the last four characters behind a fixed prefix", () => {
    expect(maskNric("S8986123A")).toBe("*****123A");
  });

  test("trims before masking", () => {
    expect(maskNric("  T0012345J  ")).toBe("*****345J");
  });

  test("returns an empty string for a blank NRIC", () => {
    expect(maskNric("")).toBe("");
    expect(maskNric("   ")).toBe("");
  });

  test("does not pad a value shorter than four characters", () => {
    expect(maskNric("12")).toBe("*****12");
  });
});

describe("dobDisplayToIso", () => {
  test("converts a complete masked display to ISO", () => {
    expect(dobDisplayToIso("25 / 12 / 1990")).toBe("1990-12-25");
  });

  test("parses bare digits too", () => {
    expect(dobDisplayToIso("25121990")).toBe("1990-12-25");
  });

  test("returns undefined for blank or incomplete input", () => {
    expect(dobDisplayToIso("")).toBeUndefined();
    expect(dobDisplayToIso("25 / 12")).toBeUndefined();
  });

  test("returns undefined for an out-of-range day or month", () => {
    expect(dobDisplayToIso("32 / 12 / 1990")).toBeUndefined();
    expect(dobDisplayToIso("25 / 13 / 1990")).toBeUndefined();
    expect(dobDisplayToIso("00 / 12 / 1990")).toBeUndefined();
  });
});

describe("dobIsoToDisplay", () => {
  test("converts ISO back to the masked display", () => {
    expect(dobIsoToDisplay("1990-12-25")).toBe("25 / 12 / 1990");
  });

  test("returns an empty string for a missing value", () => {
    expect(dobIsoToDisplay(undefined)).toBe("");
    expect(dobIsoToDisplay("")).toBe("");
  });

  test("returns an empty string for a malformed ISO date", () => {
    expect(dobIsoToDisplay("1990/12/25")).toBe("");
    expect(dobIsoToDisplay("not-a-date")).toBe("");
  });

  test("round-trips with dobDisplayToIso", () => {
    expect(dobDisplayToIso(dobIsoToDisplay("2001-03-09"))).toBe("2001-03-09");
  });
});

describe("stripClientKey", () => {
  test("drops the session-only clientKey and keeps the spec-shaped member", () => {
    const entry: FamilyListEntry = {
      clientKey: "abc-123",
      name: "Aisha",
      relationship: "spouse",
      avatar: "data:image/webp;base64,xx",
      nric: "S1234567A",
      mobileNo: "(+65) 9123 4567",
      dateOfBirth: "1990-12-25",
    };

    const stripped = stripClientKey(entry);

    expect(stripped).toEqual({
      name: "Aisha",
      relationship: "spouse",
      avatar: "data:image/webp;base64,xx",
      nric: "S1234567A",
      mobileNo: "(+65) 9123 4567",
      dateOfBirth: "1990-12-25",
    });
    expect("clientKey" in stripped).toBe(false);
  });
});
