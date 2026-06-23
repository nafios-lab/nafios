import { z } from "zod";

// ----- Step 1 Profile ---------------------------------//
/** SG mobile in the formatted display shape, e.g. "(+65) 9123 4567". */
const SG_MOBILE_RE = /^\(\+65\) [89]\d{3} \d{4}$/;

/**
 * Profile step — both fields optional. `phone` is a plain (always-present)
 * string so it aligns with the masked input's `""` empty value; an empty string
 * is valid (the field is optional) and a non-empty value must match the SG
 * format. The `refine` gives one clean message rather than a union error.
 */
export const profileSchema = z.object({
  /** In-memory avatar data URL while editing; uploaded to Storage on Save. */
  avatar: z.string().optional(),
  phone: z
    .string()
    .trim()
    .refine((v) => v === "" || SG_MOBILE_RE.test(v), {
      message: "Invalid Singapore mobile number",
    }),
});

export type ProfileValues = z.infer<typeof profileSchema>;

// ----- Step 2 Family ---------------------------------//
/**
 * @NOTE step 3 do not need form schema, as it is only a review (read-only)
 */
export const familyMemberSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  relationship: z.enum(["spouse", "child", "parent", "sibling", "other"]),
  /** Processed avatar as a data URL, held in-memory until signup persists it. */
  avatar: z.string().optional(),
  nric: z.string().optional(),
  phone: z
    .string()
    .trim()
    .regex(SG_MOBILE_RE, "Invalid Singapore mobile number")
    .optional(),
  dateOfBirth: z.string().optional(),
});

export const familiesSchema = z.object({
  familyMembers: z.array(familyMemberSchema),
});

export type FamiliesValues = z.infer<typeof familiesSchema>;

export interface OnboardingWizardData {
  profile: ProfileValues;
  family: FamiliesValues;
}
