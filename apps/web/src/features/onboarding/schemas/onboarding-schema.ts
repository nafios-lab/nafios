import type { SelectOption } from "@nafios/ui/components/select-field";
import { z } from "zod";

// ----- Step 2 — Profile -------------------------------//
// (Canonical numbering per specs/domain/onboarding-flow.md: Step 1 is signup.)
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

// ----- Step 3 — Family (+ Review) ---------------------//
/** Hard cap on family members collected in onboarding (spec + UI both enforce). */
export const MAX_FAMILY_MEMBERS = 10;

/** The relationship enum is the single source of truth; {@link RELATIONSHIP_OPTIONS}
 *  derives the `SelectField` options from it (label-cased for display). */
export const familyRelationships = ["spouse", "child", "parent", "sibling", "other"] as const;

/**
 * Canonical stored shape for one family member — identical to the spec's
 * `FamilyMemberValues` entity and to `@nafios/database`'s `FamilyMemberInput`
 * (modulo `avatar`→`avatarUrl`, mapped in the later persistence pass). The
 * session-only `clientKey` (React key / edit target) is deliberately **not**
 * part of this schema — see `lib/family-helpers.ts`.
 *
 * @NOTE the Review screen needs no form schema — it is read-only.
 */
export const familyMemberSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  relationship: z.enum(familyRelationships),
  /** Processed avatar as a data URL, held in-memory until the final Confirm persists it. */
  avatar: z.string().optional(),
  nric: z.string().optional(),
  mobileNo: z.string().trim().regex(SG_MOBILE_RE, "Invalid Singapore mobile number").optional(),
  dateOfBirth: z.string().optional(),
});

export type FamilyMemberValues = z.infer<typeof familyMemberSchema>;

/**
 * Form-level schema for the inline add/edit form. Unlike the canonical
 * {@link familyMemberSchema} (where `mobileNo` is `optional()` and so only
 * accepts `undefined`), the form's mobile field holds `""` when empty — the
 * masked input's empty value. The `refine` mirrors the Profile step's `phone`
 * field: `""` is valid, a non-empty value must match the SG format. The form
 * cleans `""` → `undefined` (and uppercases NRIC, converts the DOB to ISO) on
 * commit, so what reaches wizard state is the canonical shape.
 *
 * `relationship` is a refined `string` (not `z.enum`) so the schema's input type
 * matches the form's string-typed field — the `SelectField` only ever sets a
 * valid value, so an empty string is the sole failing case (= not yet chosen).
 */
export const familyMemberFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  relationship: z
    .string()
    .refine(
      (v): v is (typeof familyRelationships)[number] =>
        (familyRelationships as readonly string[]).includes(v),
      { message: "Relationship is required" },
    ),
  // Optional fields are plain strings here — the form always holds `""` when
  // blank (so the StandardSchema input matches the form's value type); the
  // commit handler cleans `""` → `undefined`.
  nric: z.string(),
  mobileNo: z
    .string()
    .trim()
    .refine((v) => v === "" || SG_MOBILE_RE.test(v), {
      message: "Invalid Singapore mobile number",
    }),
  dateOfBirth: z.string(),
});

export type FamilyMemberFormValues = z.infer<typeof familyMemberFormSchema>;

/** Drives the relationship `SelectField`; values mirror {@link familyRelationships}. */
export const RELATIONSHIP_OPTIONS: SelectOption[] = [
  { value: "spouse", label: "Spouse" },
  { value: "child", label: "Child" },
  { value: "parent", label: "Parent" },
  { value: "sibling", label: "Sibling" },
  { value: "other", label: "Other" },
];

export const familiesSchema = z.object({
  familyMembers: z.array(familyMemberSchema).max(MAX_FAMILY_MEMBERS, "You can add up to 10 people"),
});

export type FamiliesValues = z.infer<typeof familiesSchema>;

export interface OnboardingWizardData {
  profile: ProfileValues;
  family: FamiliesValues;
}
