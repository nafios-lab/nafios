---
name: project_currency_input_two_layer
description: Currency fields use a two-layer split — generic CurrencyInput in @nafios/ui + Money adapter in finance
metadata:
  type: project
---

Currency input is split in two layers because `@nafios/ui` is a pure domain-free
leaf (zero `@nafios/*` deps) and cannot import `Money` from `@nafios/finance`.

- **`@nafios/ui/components/currency-input`** (`CurrencyInput`) — generic primitive
  speaking **integer minor units** (`number | null`; cents for USD, whole yen for
  JPY). Symbol/decimals/grouping derived from `Intl.NumberFormat` per
  `currency`/`locale`. Grouped at rest, plain while focused. Pure helpers in
  `packages/ui/src/internal/currency-format.ts`. This layer owns the Storybook
  (`currency-input.stories.tsx`) — Storybook only covers `packages/ui`.
- **`apps/nafios-web/.../features/finance/components/money-input.tsx`** (`MoneyInput`)
  — thin finance adapter typed in `Money` on both sides, bridging via
  `toCents`/`moneyFromCents`. `Money` *is* cents (USD, M1) so they align 1:1.
  Clamps to ±999,999,999,999 cents so `moneyFromCents` never throws on overflow.

**Why:** design-system stays domain-free; other modules (Budgeting) reuse the
primitive without dragging in finance.

**How to apply:** new domain money fields wrap `CurrencyInput` with their own
minor-units↔type adapter — don't put branded types in `@nafios/ui`. See
[[project_datetime_sole_date_fns_seam]] for the same leaf-package stance.
