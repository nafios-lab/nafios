import { describe, expect, test } from "bun:test";
import {
  familiesSchema,
  familyMemberFormSchema,
  familyMemberSchema,
  MAX_FAMILY_MEMBERS,
  profileSchema,
  RELATIONSHIP_OPTIONS,
} from "../../src/features/onboarding/schemas/onboarding-schema.ts";

describe("profileSchema (Step 2 — Profile)", () => {
  test("accepts an empty phone — the field is optional", () => {
    expect(profileSchema.safeParse({ phone: "" }).success).toBe(true);
  });

  test("accepts a well-formed SG mobile with an avatar data URL", () => {
    const result = profileSchema.safeParse({
      phone: "(+65) 9123 4567",
      avatar: "data:image/webp;base64,xx",
    });
    expect(result.success).toBe(true);
  });

  test("rejects a malformed phone with one clean message", () => {
    const result = profileSchema.safeParse({ phone: "12345" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Invalid Singapore mobile number");
    }
  });
});

describe("familyMemberSchema (Step 3 — Family)", () => {
  test("accepts a name with a valid relationship", () => {
    expect(familyMemberSchema.safeParse({ name: "Aisha", relationship: "spouse" }).success).toBe(
      true,
    );
  });

  test("rejects a blank name", () => {
    expect(familyMemberSchema.safeParse({ name: "  ", relationship: "child" }).success).toBe(false);
  });

  test("rejects an unknown relationship", () => {
    expect(familyMemberSchema.safeParse({ name: "Bo", relationship: "cousin" }).success).toBe(
      false,
    );
  });

  test("rejects a malformed mobileNo when one is provided", () => {
    expect(
      familyMemberSchema.safeParse({ name: "Bo", relationship: "child", mobileNo: "999" }).success,
    ).toBe(false);
  });

  test("accepts a well-formed mobileNo", () => {
    expect(
      familyMemberSchema.safeParse({
        name: "Bo",
        relationship: "child",
        mobileNo: "(+65) 9123 4567",
      }).success,
    ).toBe(true);
  });
});

describe("familyMemberFormSchema (inline add/edit form)", () => {
  const base = { name: "Aisha", relationship: "spouse", nric: "", mobileNo: "", dateOfBirth: "" };

  test("accepts the required fields with empty optionals", () => {
    expect(familyMemberFormSchema.safeParse(base).success).toBe(true);
  });

  test("rejects a blank name with a clear message", () => {
    const result = familyMemberFormSchema.safeParse({ ...base, name: "  " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Name is required");
    }
  });

  test("rejects an unchosen (empty) relationship", () => {
    const result = familyMemberFormSchema.safeParse({ ...base, relationship: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Relationship is required");
    }
  });

  test("allows an empty mobileNo but rejects a malformed one", () => {
    expect(familyMemberFormSchema.safeParse({ ...base, mobileNo: "" }).success).toBe(true);
    expect(familyMemberFormSchema.safeParse({ ...base, mobileNo: "(+65) 9123 4567" }).success).toBe(
      true,
    );
    expect(familyMemberFormSchema.safeParse({ ...base, mobileNo: "999" }).success).toBe(false);
  });
});

describe("familiesSchema (the 0–10 cap)", () => {
  const member = { name: "A", relationship: "child" as const };

  test("accepts exactly the max number of members", () => {
    const familyMembers = Array.from({ length: MAX_FAMILY_MEMBERS }, () => member);
    expect(familiesSchema.safeParse({ familyMembers }).success).toBe(true);
  });

  test("rejects more than the cap", () => {
    const familyMembers = Array.from({ length: MAX_FAMILY_MEMBERS + 1 }, () => member);
    const result = familiesSchema.safeParse({ familyMembers });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("You can add up to 10 people");
    }
  });
});

describe("RELATIONSHIP_OPTIONS", () => {
  test("exposes one labelled option per relationship value", () => {
    expect(RELATIONSHIP_OPTIONS.map((o) => o.value)).toEqual([
      "spouse",
      "child",
      "parent",
      "sibling",
      "other",
    ]);
    expect(RELATIONSHIP_OPTIONS.find((o) => o.value === "spouse")?.label).toBe("Spouse");
  });
});
