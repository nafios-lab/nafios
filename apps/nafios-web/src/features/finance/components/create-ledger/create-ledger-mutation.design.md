# Create-Ledger submit → backend: `useMutation` hook design

**Question:** in the form's `onSubmit` callback ([create-ledger-form.tsx:41-44](./create-ledger-form.tsx#L41-L44),
today just `console.log(value)`) we need to call the backend to actually open
the ledger. Should this go through a custom hook wrapping TanStack
`useMutation`? **Yes.** This note shows how it fits the code that already exists.

> Design only — no code was changed. This is the plan for the eventual edit.

---

## 1. Why `useMutation` (and a custom hook) is the right call here

The app already runs **all** finance data client-side through TanStack Query
(ADR-0026): the read side is a `useQuery` hook — `useFinanceHomeState` in
[use-finance-home-state.ts](../../hooks/use-finance-home-state.ts) — driving the
finance browser client. Creating a ledger is the **write** counterpart, so the
symmetric, in-convention choice is a `useMutation` hook living beside it in
`features/finance/hooks/`.

`useMutation` (vs. the hand-rolled `useState`/retry loop used in
[use-complete-onboarding.ts](../../../onboarding/hooks/use-complete-onboarding.ts))
buys us, for free, exactly what this form needs:

- `isPending` → disable the "Open ledger" button / show a spinner.
- `error` + `onError` → a single place for the thrown `FinanceDataError` (EF3.6).
- `onSuccess` → **cache invalidation** so the Finance Home re-reads the new
  ongoing ledger, plus closing the dialog.
- No retry loop is needed (unlike onboarding). `createLedger` is a
  guarded, all-or-nothing command; a genuine DB fault should surface, not silently
  retry.

The onboarding hook predates any mutation in this app (there are currently **zero**
`useMutation` usages in `nafios-web`). This would be the first, and it sets the
pattern for the finance write hooks that follow (envelopes, etc.).

## 2. The one subtlety that shapes the whole design

`createLedger` has **two** distinct failure channels — do not collapse them:

| Outcome | How it arrives | Meaning | UI |
| --- | --- | --- | --- |
| `{ ok: true, ledger, parkedLedgerId }` | resolved value | ledger opened | close dialog, invalidate, toast |
| `{ ok: false, reason, guardrail }` | **resolved value** (not thrown) | deterministic pre-write rejection — user-fixable / needs confirmation | render inline; `requires_confirmation` → amber sheet |
| throws `FinanceDataError` | **rejected promise** | genuine DB/query fault (EF3.6) | generic error state |

Source: `CreateLedgerResult` and the command contract in
[packages/finance/src/internal/commands/create-ledger.ts:80-108](../../../../../../../packages/finance/src/internal/commands/create-ledger.ts#L80-L108).

Consequence for `useMutation`:

- **Only the thrown `FinanceDataError` routes to `onError`.** A `{ ok: false }`
  rejection is a *successful* promise, so it lands in `onSuccess` / the returned
  `data`. Branch on `data.ok` — do **not** re-throw rejections into `onError`.
  Rejections like `requires_confirmation` are a confirmation flow, not an error;
  throwing them would lose the `guardrail` payload the amber sheet needs and would
  trip React Query's retry/error semantics.

This is why we keep the command's discriminated union intact and branch on it,
rather than "throw on any non-success".

## 3. Where the guard lives — FE, command, or DB?

A natural question: if we need the amber confirmation, can't we just guard it on
the FE? Do we even need the check in the "backend" too? And if so, why must it
return more than an error?

First, a fact about this architecture that reframes the usual "FE vs backend"
split: **there is no backend service.** The finance command
(`createLedgerCommands`) runs **client-side in the browser** (ADR-0026); the only
true server-side enforcement is Postgres — RLS + `CHECK`/`UNIQUE` constraints. So
"put it on the backend" here means one of two very different things: the **domain
command** layer (still in the browser — the single source of truth for the
*rules*, but **not** a trust boundary), or the **database** (the real trust
boundary — but it can only express *constraints*, never a "did the user
acknowledge?" interaction).

Three layers, three distinct jobs — not duplicates of one:

| Layer | Runs where | Owns | For create-ledger |
| --- | --- | --- | --- |
| Form schema (zod) | browser | field presence only | "required" on the two money inputs — deliberately nothing else ([create-ledger-schema.ts](../../schemas/create-ledger-schema.ts) comment: does **not** re-derive EF3.5) |
| Domain command | browser | the business *rules* (single source of truth) | amber (`requires_confirmation`), hard cap (`exceeds_hard_cap`), non-negativity, openable-month |
| Postgres (RLS/CHECK/UNIQUE) | server (**trust boundary**) | hard *invariants* | `ck_balances_nonneg`, one-ledger-per-month uniqueness (`duplicate_month`), owner RLS |

**Why not just guard the amber rule on the FE?** You *can* mirror
`maxCapped > openingBalance` in the form — but you shouldn't:

1. **The spec assigns it to the command.** EF3.5 is owned by `createLedger`, and
   the schema file explicitly says it does not re-derive the guardrail. A copy in
   the form is a second definition of one rule that will drift.
2. **Letting the command decide costs nothing.** `validateMaxCapped` is *pure* and
   runs **before any DB read** — the command returns `requires_confirmation` at the
   guardrail step, ahead of `repo.list()`. So submitting with
   `acknowledgedOverspend: false` incurs **no network round-trip** for the amber
   case. The usual reason to pre-check on the FE (avoid a wasted server hit) does
   not apply.
3. **The FE still owns the *interaction*.** Rendering the amber sheet and capturing
   "yes" is pure UI state; that "yes" is the `acknowledgedOverspend` boolean fed
   back into the same command. The FE guards the *conversation*; the command guards
   the *rule*.

**Why the command must "return more than an error."** The amber case is **not an
error** — it's a request for one more input. An exception can only carry a
message; the rejection has to carry the `guardrail` payload (`savingsDraw` for the
sheet copy, `hardCap` for the block message). That is exactly why the command
returns the `CreateLedgerResult` **discriminated union** rather than throwing (see
§2). Exceptions stay reserved for genuine faults (`FinanceDataError`). So yes, the
command must return structured rejection data — and it already does; the FE needs
no *additional* validation shape, it just consumes the union.

**Bottom line:** don't move the guard to the FE and don't add a parallel FE check.
Keep the rule in the command (it's free and canonical), let the FE own only the
sheet + the `acknowledgedOverspend` toggle, and rely on Postgres constraints as the
ultimate backstop for the invariants the command can't guarantee against a tampered
client.

## 4. The hook — `features/finance/hooks/use-create-ledger.ts`

```ts
import {
  type CreateLedgerInput,
  type CreateLedgerResult,
  createLedgerCommands,
} from "@nafios/finance";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getFinanceClient } from "../lib/finance-client";

/**
 * The Create-Ledger write (EF3.7), client-side per ADR-0026: a `useMutation`
 * over the finance browser client that opens a MonthlyLedger. The mutation
 * RESOLVES with the command's `CreateLedgerResult` — including the deterministic
 * `{ ok: false }` rejections (month-not-openable, amber guardrail, …), which are
 * data the caller branches on, NOT errors. Only a genuine `FinanceDataError`
 * (EF3.6) rejects the promise and lands in `error` / `onError`.
 *
 * On a successful open it invalidates the Finance-Home read so the Home card
 * re-resolves against the newly-ongoing (and possibly newly-parked) ledgers.
 */
export function useCreateLedger() {
  const queryClient = useQueryClient();

  return useMutation<CreateLedgerResult, Error, CreateLedgerInput>({
    mutationFn: (input) => createLedgerCommands(getFinanceClient()).createLedger(input),
    onSuccess: (result) => {
      // Only a real open changes server state worth re-reading. A pre-write
      // rejection ({ ok: false }) wrote nothing — leave the cache untouched.
      if (result.ok) {
        // Broad key: re-resolves every Finance-Home day-slice (see the query key
        // in use-finance-home-state.ts → ["finance", "home", today]).
        queryClient.invalidateQueries({ queryKey: ["finance", "home"] });
      }
    },
  });
}
```

Notes:

- `getFinanceClient()` is the same lazy RLS-scoped singleton the read hook uses
  ([finance-client.ts](../../lib/finance-client.ts)) — `auth.uid()` resolves, the
  owner RLS policy applies, `user_id` is filled by the DB default (never set in the
  insert).
- The mutation's error type is `Error` because the command throws
  `FinanceDataError` (an `Error` subclass); the caller can `instanceof`-narrow it
  in `onError` if it wants code-specific copy (`duplicate_month`, `ongoing_exists`, …).
- No `staleTime`/retry knobs — mutations don't cache, and we deliberately don't
  auto-retry a guarded write.

## 5. Wiring it into the form

Replace the placeholder `onSubmit` in
[create-ledger-form.tsx:41-44](./create-ledger-form.tsx#L41-L44). The form schema
already parses to `{ openingBalance: Money; maxCapped: Money }` (non-null — see
[create-ledger-schema.ts](../../schemas/create-ledger-schema.ts)); the hook needs
two more fields the form owns, not the schema:

- `month` ← `props.ledgerMonth` (already a prop).
- `acknowledgedOverspend` ← starts `false`; flips to `true` only after the amber
  confirmation (see §6).

```ts
// inside CreateLedgerForm
const createLedger = useCreateLedger();

const formApi = useForm({
  defaultValues: EMPTY_FORM,
  validators: { onSubmit: createLedgerSchema, onChange: createLedgerSchema },
  onSubmit: async ({ value }) => {
    const result = await createLedger.mutateAsync({
      month: props.ledgerMonth,
      openingBalance: value.openingBalance, // schema guarantees non-null Money
      maxCapped: value.maxCapped,
      acknowledgedOverspend: false, // first attempt; §5 handles the amber re-submit
    });

    if (result.ok) {
      // close the dialog (lift `open` to state) + optional success toast
      return;
    }

    // result.ok === false → branch on result.reason:
    //   "month_not_openable" | "negative_amount" → inline error copy
    //   "requires_confirmation" → open the amber sheet with result.guardrail (§6)
    //   "exceeds_hard_cap"      → blocked message with result.guardrail.hardCap
  },
});
```

Button binds to the mutation's pending state:

```tsx
<Button variant="brand" type="submit" disabled={createLedger.isPending}>
  {createLedger.isPending ? "Opening…" : "Open ledger"}
</Button>
```

`mutateAsync` (not `mutate`) is used so the `onSubmit` async fn can await the
result and branch inline; `useMutation`'s `onSuccess` still runs (it handles cache
invalidation, which is orthogonal to the component's navigation/close logic).

> The `Dialog` is currently uncontrolled (only `onOpenChange` to reset). To close
> it programmatically on success you'll need to lift `open` into state — a small
> change, called out here so it isn't a surprise.

## 6. The amber-zone confirmation (two-phase submit)

`requires_confirmation` (EF3.5) is the reason this must be a *branch on data*, not
an error. Flow:

1. First submit → `acknowledgedOverspend: false` → command returns
   `{ ok: false, reason: "requires_confirmation", guardrail: { savingsDraw, … } }`.
2. Form opens the amber confirmation sheet using `guardrail.savingsDraw`.
3. User confirms → **re-run the same mutation** with `acknowledgedOverspend: true`
   → the guardrail gate lifts and the write proceeds (or returns `exceeds_hard_cap`
   if it was actually blocked, which acknowledgement can never override).

Because both attempts go through the same `useCreateLedger().mutateAsync`, the
pending state, cache invalidation, and error handling are shared — no duplicated
logic. The only thing the component tracks is "am I showing the amber sheet", which
is form/UI state, not server state.

## 7. Testing (fits the existing harness)

- Unit-test the hook with `@tanstack/react-query`'s `QueryClientProvider` (the app
  already has `tests/query-wrapper.tsx` for `['session']`-invalidating hooks; reuse
  the same wrapper). Mock `@nafios/finance`'s `createLedgerCommands` to return each
  `CreateLedgerResult` variant + to throw `FinanceDataError`.
- Assert: `ok: true` → `invalidateQueries(["finance","home"])` called; `ok: false`
  → **not** called and no throw; thrown `FinanceDataError` → surfaces on `error`.
- The 90% per-file coverage gate applies to the hook (it's not in the excluded set).

## 8. Verdict

Yes — a `useCreateLedger` custom hook wrapping `useMutation`, mirroring the
existing `useFinanceHomeState` read hook. The single design rule that makes it
correct: **treat the command's `{ ok: false }` union as resolved data to branch
on, and let only `FinanceDataError` reject** — so `onError` stays for real faults,
`onSuccess` invalidates the Finance-Home cache, and the amber-confirmation
re-submit is just the same mutation called again with `acknowledgedOverspend: true`.

### Files this would touch (when implemented)

- **new** `features/finance/hooks/use-create-ledger.ts` — the hook above.
- **edit** [create-ledger-form.tsx](./create-ledger-form.tsx) — real `onSubmit`,
  pending-bound button, controlled `open` for programmatic close, amber-sheet branch.
- no change to `@nafios/finance` — `createLedgerCommands` / `CreateLedgerInput` /
  `CreateLedgerResult` are already on the barrel.

## Appendix — what the command returns, concretely (OK / amber / error)

> **Not a wire payload.** There is no backend service (§3) — `createLedger` runs
> in the browser, so "returns" means the **resolved value** of the promise and
> "error" means a **thrown/rejected** `Error`. `Money` is a branded `number`
> ([money.ts:18](../../../../../../../packages/finance/src/domain/money.ts#L18)),
> so it appears as a plain number below, not a `{ amount, currency }` object.
> The exact types are `CreateLedgerResult` / `LedgerHeader` / `MaxCappedGuardrail`
> / `FinanceDataError` — this is just their runtime shape made concrete.

Worked example for all three: opening a ledger with `openingBalance: 3000`.

### 1. OK — the write happened (`data.ok === true`, lands in `onSuccess`)

`maxCapped: 2500` (≤ opening → no friction). The promise **resolves** with:

```jsonc
{
  "ok": true,
  "ledger": {                              // LedgerHeader = MonthlyLedger minus `envelopes`
    "id": "b1f4c0de-...-uuid",
    "month": "2026-08",                    // Month, "YYYY-MM"
    "openingBalance": 3000,
    "maxCapped": 2500,
    "status": "ongoing",                   // the new ledger is always the ongoing one
    "createdAt": "2026-08-15T09:12:44.000Z", // ISO-8601 timestamptz, opaque
    "settledAt": null                      // null until status === 'settled'
  },
  "parkedLedgerId": null                   // uuid of the ledger parked to 'reconciling', or null (fresh start / clean gap)
}
```

`parkedLedgerId` is non-null only when a previous `ongoing` ledger was moved to
`reconciling` to make room (S3/S5); it stays `null` on a fresh start (S2).

### 2. amber — needs confirmation (`data.ok === false`, still `onSuccess`)

`maxCapped: 3500` (> opening, ≤ 2×) with `acknowledgedOverspend: false`. The
promise **resolves** (it is *not* an error) with:

```jsonc
{
  "ok": false,
  "reason": "requires_confirmation",       // CreateLedgerRejectionReason
  "guardrail": {                           // MaxCappedGuardrail — present because the reason is a guardrail one
    "zone": "amber",
    "hardCap": 6000,                        // 2 × openingBalance — the ceiling that can never be crossed
    "savingsDraw": 500                      // maxCapped − openingBalance — the "$Z drawn from savings" for the sheet copy
  }
}
```

The FE reads `guardrail.savingsDraw` for the amber sheet, then re-submits the
**same** mutation with `acknowledgedOverspend: true` (§6). The sibling
guardrail rejection `exceeds_hard_cap` (maxCapped > 2×, e.g. `6500`) has the
same shape but `reason: "exceeds_hard_cap"`, `guardrail.zone: "blocked"`, and
`savingsDraw: null` — a hard block that acknowledgement can never lift. The two
non-guardrail reasons (`month_not_openable`, `negative_amount`) also resolve
`{ ok: false, … }` but with `guardrail: null`.

### 3. error — a genuine DB fault (thrown → rejected promise → `onError`)

Not a value at all — the promise **rejects** with a `FinanceDataError` (EF3.6).
It is a real `Error`, so it carries a `message` plus the finance-specific fields:

```jsonc
// (FinanceDataError instance — shown as fields, not JSON)
{
  "name": "FinanceDataError",
  "message": "finance data error (duplicate_month) on uq_ledger_user_month: duplicate key value violates unique constraint \"uq_ledger_user_month\"",
  "code": "duplicate_month",               // FinanceDataErrorCode — branch on this, not the message
  "constraint": "uq_ledger_user_month",    // violated DB constraint (null when the SQLSTATE carries none)
  "cause": { /* raw PostgrestError from the SDK */ }
}
```

`code` is one of `duplicate_month | ongoing_exists | check_violation |
foreign_key_violation | not_null_violation | unknown`
([errors.ts:21-27](../../../../../../../packages/finance/src/internal/errors.ts#L21-L27)).
This is the **only** outcome that reaches React Query's `error` / `onError`; the
`{ ok: false }` cases in (2) do **not** (§2).
