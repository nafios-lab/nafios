import { describe, expect, test } from "bun:test";
import { accountSignupSchema } from "../../src/features/auth/schemas/signup-schema.ts";

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
