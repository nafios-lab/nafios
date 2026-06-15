import { z } from "zod";

// ── Step 1: Account ──────────────────────────────────────────────────
export const accountStepSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  email: z.email().trim().min(1, "Email is required").trim(),
  mobile: z
    .string()
    .trim()
    .regex(/^\(\+65\) [89]\d{3} \d{4}$/, "Invalid Singapore mobile number"),
});

export type AccountStepValues = z.infer<typeof accountStepSchema>;

// ── Step 2: Security ─────────────────────────────────────────────────
export const securityStepSchema = z
  .object({
    password: z
      .string()
      .min(1, "Password is required")
      .min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type SecurityStepValues = z.infer<typeof securityStepSchema>;

// ── Step 3: Family ───────────────────────────────────────────────────
export const familyMemberSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  relationship: z.enum(["spouse", "child", "parent", "sibling", "other"]),
  nric: z.string().optional(),
  mobile: z
    .string()
    .trim()
    .regex(/^\(\+65\) [89]\d{3} \d{4}$/, "Invalid Singapore mobile number")
    .optional(),
  dateOfBirth: z.string().optional(),
});

export type FamilyMemberValues = z.infer<typeof familyMemberSchema>;

/** Form-input schema — all required strings so TanStack Form's defaultValues align. */
export const familyMemberFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  relationship: z.string().min(1, "Please select a relationship"),
  nric: z.string(),
  mobile: z.union([
    z
      .string()
      .trim()
      .regex(/^\(\+65\) [89]\d{3} \d{4}$/, "Invalid Singapore mobile number"),
    z.literal(""),
  ]),
  dateOfBirth: z.string(),
});

export const familyStepSchema = z.object({
  familyMembers: z.array(familyMemberSchema),
});

export type FamilyStepValues = z.infer<typeof familyStepSchema>;

// ── Combined wizard data ─────────────────────────────────────────────
export interface SignupWizardData {
  account: AccountStepValues;
  security: SecurityStepValues;
  family: FamilyStepValues;
}
