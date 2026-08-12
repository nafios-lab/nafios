// Form-level schema for the Create-Ledger dialog (the `MoneyInput` fields).
// Validation-only: it gates the two manual money inputs on "required" and
// nothing more. Non-negativity (the `MoneyInput` clamps at `min=0`) and the
// cross-field maxCapped guardrail (the amber/blocked zones — a confirmation
// flow, not a field error) are owned by `@nafios/finance`'s `createLedger`
// command, so this schema deliberately does NOT re-derive them.

import type { Money } from "@nafios/finance";
import { z } from "zod";

/**
 * A single `MoneyInput` field. The input holds `Money | null` — `null` is the
 * empty state it renders and emits — so the schema's *input* type matches the
 * field's value type (same stance as the onboarding string fields, where the
 * schema mirrors the field's `""` empty value).
 *
 * `Money` is an externally-branded `number`, so `z.custom` is the only way to
 * carry the brand through — with no validator it accepts the raw field value as
 * given (the `MoneyInput` guarantees it's a valid `Money` or `null`, so `null`
 * is the sole failing case). The type-guard `refine` enforces "required" and
 * narrows the parsed output to `Money`, so `z.infer` yields a non-null `Money`
 * that drops straight into the command's `CreateLedgerInput`.
 */
const requireMoney = (label: string) =>
  z.custom<Money | null>().refine((v): v is Money => v !== null, {
    error: `Enter ${label}`,
  });

/**
 * The two manual amounts a user keys to open a ledger. Parsed output is
 * `{ openingBalance: Money; maxCapped: Money }` — the money half of
 * `CreateLedgerInput`; the caller supplies `month` and `acknowledgedOverspend`
 * (the amber-zone acknowledgement) outside these form fields.
 */
export const createLedgerSchema = z.object({
  openingBalance: requireMoney("an opening balance"),
  maxCapped: requireMoney("a spending cap"),
});

/**
 * The form-state (pre-parse) shape: each field is `Money | null` while editing
 * — `null` is the `MoneyInput` empty state. Use this to type the form's
 * `defaultValues` so the fields accept both the empty `null` and a keyed-in
 * `Money` (`z.infer` alone would type them non-null and reject the empty state).
 */
export type CreateLedgerFormValues = z.input<typeof createLedgerSchema>;
