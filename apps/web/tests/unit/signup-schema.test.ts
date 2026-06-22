import { describe, expect, test } from "bun:test";
import {
  accountSignupSchema,
  accountStepSchema,
  familyMemberSchema,
  familyStepSchema,
  securityStepSchema,
} from "../../src/features/auth/schemas/signup-schema.ts";

describe("accountStepSchema", () => {
  test("accepts a valid account", () => {
    const result = accountStepSchema.safeParse({
      username: "hanafi",
      email: "test@nafios.local",
      mobile: "(+65) 9123 4567",
    });
    expect(result.success).toBe(true);
  });

  test("rejects an empty username", () => {
    const result = accountStepSchema.safeParse({
      username: "  ",
      email: "test@nafios.local",
      mobile: "(+65) 9123 4567",
    });
    expect(result.success).toBe(false);
  });

  test("rejects a malformed mobile number", () => {
    const result = accountStepSchema.safeParse({
      username: "hanafi",
      email: "test@nafios.local",
      mobile: "12345678",
    });
    expect(result.success).toBe(false);
  });

  test("rejects an invalid email", () => {
    const result = accountStepSchema.safeParse({
      username: "hanafi",
      email: "not-an-email",
      mobile: "(+65) 9123 4567",
    });
    expect(result.success).toBe(false);
  });
});

describe("accountSignupSchema", () => {
  test("accepts a valid email with matching passwords of sufficient length", () => {
    const result = accountSignupSchema.safeParse({
      email: "test@nafios.local",
      password: "password123",
      confirmPassword: "password123",
    });
    expect(result.success).toBe(true);
  });

  test("rejects an invalid email", () => {
    const result = accountSignupSchema.safeParse({
      email: "not-an-email",
      password: "password123",
      confirmPassword: "password123",
    });
    expect(result.success).toBe(false);
  });

  test("rejects a short password", () => {
    const result = accountSignupSchema.safeParse({
      email: "test@nafios.local",
      password: "short",
      confirmPassword: "short",
    });
    expect(result.success).toBe(false);
  });

  test("flags mismatched confirmation on the confirmPassword path", () => {
    const result = accountSignupSchema.safeParse({
      email: "test@nafios.local",
      password: "password123",
      confirmPassword: "password124",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["confirmPassword"]);
    }
  });
});

describe("securityStepSchema", () => {
  test("accepts matching passwords of sufficient length", () => {
    const result = securityStepSchema.safeParse({
      password: "password123",
      confirmPassword: "password123",
    });
    expect(result.success).toBe(true);
  });

  test("rejects a short password", () => {
    const result = securityStepSchema.safeParse({
      password: "short",
      confirmPassword: "short",
    });
    expect(result.success).toBe(false);
  });

  test("flags mismatched confirmation on the confirmPassword path", () => {
    const result = securityStepSchema.safeParse({
      password: "password123",
      confirmPassword: "password124",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["confirmPassword"]);
    }
  });
});

describe("familyMemberSchema — avatar field", () => {
  const base = { name: "Jane Doe", relationship: "spouse" as const };

  test("accepts a member with an avatar data URL", () => {
    const result = familyMemberSchema.safeParse({
      ...base,
      avatar: "data:image/webp;base64,AAAA",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.avatar).toBe("data:image/webp;base64,AAAA");
  });

  test("treats avatar as optional — omitting it is valid", () => {
    const result = familyMemberSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.avatar).toBeUndefined();
  });

  test("rejects a non-string avatar", () => {
    const result = familyMemberSchema.safeParse({ ...base, avatar: 123 });
    expect(result.success).toBe(false);
  });

  test("rejects an unknown relationship", () => {
    const result = familyMemberSchema.safeParse({ ...base, relationship: "cousin" });
    expect(result.success).toBe(false);
  });

  test("rejects an empty name", () => {
    const result = familyMemberSchema.safeParse({ ...base, name: "" });
    expect(result.success).toBe(false);
  });
});

describe("familyStepSchema", () => {
  test("accepts an empty member list", () => {
    expect(familyStepSchema.safeParse({ familyMembers: [] }).success).toBe(true);
  });

  test("accepts members carrying avatars", () => {
    const result = familyStepSchema.safeParse({
      familyMembers: [
        { name: "Jane Doe", relationship: "spouse", avatar: "data:image/webp;base64,AAAA" },
        { name: "Kid One", relationship: "child" },
      ],
    });
    expect(result.success).toBe(true);
  });
});
