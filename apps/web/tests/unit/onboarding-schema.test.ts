import { describe, expect, test } from "bun:test";
import {
  familyMemberSchema,
  profileSchema,
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

  test("rejects a malformed phone when one is provided", () => {
    expect(
      familyMemberSchema.safeParse({ name: "Bo", relationship: "child", phone: "999" }).success,
    ).toBe(false);
  });
});
