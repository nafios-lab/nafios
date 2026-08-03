import { z } from "zod";

export const loginSchema = z.object({
  // Supabase authenticates by email (signup collects email; profiles has no
  // username). Login mirrors that — no username→email lookup exists.
  email: z.email("Enter a valid email address"),
  // Login only needs the password to be present — its correctness (and any
  // length policy) is the server's call. Length-validating here would pre-empt
  // the real "incorrect email or password" message with a misleading one.
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean(),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
