import { z } from "zod";

// ── Account Sign up ──────────────────────────────────────────────────
export const accountSignupSchema = z
  .object({
    email: z.email("Invalid email address").trim().min(1, "Email is required"),
    password: z
      .string()
      .min(1, "Password is required")
      .min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type AccountSignupValues = z.infer<typeof accountSignupSchema>;

//   ── Step 1: Account ──────────────────────────────────────────────────
/** @deprecated */
export const accountStepSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  email: z.email().trim().min(1, "Email is required").trim(),
  mobile: z
    .string()
    .trim()
    .regex(/^\(\+65\) [89]\d{3} \d{4}$/, "Invalid Singapore mobile number"),
});

/** @deprecated */
export type AccountStepValues = z.infer<typeof accountStepSchema>;

//  ── Step 2: Sec
/** @deprecated */
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

/** @deprecated */
export type SecurityStepValues = z.infer<typeof securityStepSchema>;

//  ── Step 3: Family ───────────────────────────────────────────────────
/** @deprecated */
export const familyMemberSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  relationship: z.enum(["spouse", "child", "parent", "sibling", "other"]),
  /** Processed avatar as a data URL, held in-memory until signup persists it. */
  avatar: z.string().optional(),
  nric: z.string().optional(),
  mobile: z
    .string()
    .trim()
    .regex(/^\(\+65\) [89]\d{3} \d{4}$/, "Invalid Singapore mobile number")
    .optional(),
  dateOfBirth: z.string().optional(),
});
/** @deprecated */
export type FamilyMemberValues = z.infer<typeof familyMemberSchema>;

/** Form-input schema — all required strings so TanStack Form's defaultValues align. */
/** @deprecated */
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

/** @deprecated */
export const familyStepSchema = z.object({
  familyMembers: z.array(familyMemberSchema),
});
/** @deprecated */
export type FamilyStepValues = z.infer<typeof familyStepSchema>;

// ── Combined wizard data ─────────────────────────────────────────────
/** @deprecated */
export interface SignupWizardData {
  account: AccountStepValues;
  security: SecurityStepValues;
  family: FamilyStepValues;
}
