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
