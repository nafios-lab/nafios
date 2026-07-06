# EF3.5 — MaxCapped guardrails (amber confirm, 2× hard block)

> - `M1`
> - `type:feature`
> - `module:finance`
> - `area:domain`
> - `P0`
> - `size:S`
> - **Epic:** EF3 — Get started: open your first ledger & track it with manual envelopes

> **This ticket is self-contained.** Everything needed to build the **MaxCapped guardrail** — the pure zone classifier (`evaluateMaxCapped`) and the enforcement gate (`validateMaxCapped`) that encode the amber-zone confirm (`maxCapped > openingBalance`) and the 2× hard block (`maxCapped > 2 × openingBalance`) — is in this file. Stack: **plain TypeScript, pure, zero I/O.** It lives in `@nafios/finance`'s **domain layer** (`src/domain/`) — no Supabase, no `@nafios/db`, no `fetch`, no clock access. **No ORM / no Drizzle. No schema changes** (EF3 consumes the EF1 schema unchanged).
>
> **Depends on:**
>
> - **EF3.1** (Money codec) — `openingBalance` / `maxCapped` are `Money`; every comparison and derived amount goes through `compareMoney` / `addMoney` / `subtractMoney`. **No float math anywhere** — the `2×` ceiling is `addMoney(opening, opening)` (exact), never `opening * 2`.
>
> **Consumed by (this ticket is the single home of the guardrail rule):**
>
> - **EF3.7** (create-ledger command) — calls `validateMaxCapped({ openingBalance, maxCapped, confirmed })` **before committing** and refuses to write on `ok: false`. This is what makes the guardrail hold "regardless of caller" (epic Success Criteria).
> - **EF3.12** (new-ledger creation flow) — calls `evaluateMaxCapped` live as the user types to drive the amber **blocking confirmation sheet** (using `savingsDraw`) and to hard-disable submit when `zone === 'blocked'` (story-map S6); passes the user's explicit `confirmed` flag to EF3.7.
>
> **Build-order & PR readiness.** A **leaf** domain function: it depends only on EF3.1 (`Money`) and nothing in the domain layer depends on it (its consumers are all in the data/web layers). It is independently PR-able the moment EF3.1's `Money` type exists — stack it on or co-merge it with EF3.1; either way `bun run check` stays green (see §9). It does **not** depend on EF3.2/EF3.3/EF3.4 — the guardrail is a pure comparison of two `Money` inputs and is unrelated to COL, the metrics engine, or the month resolver.
>
> **Assumes EF2 is done** (the `@nafios/finance` package shell — `src/domain/` + `src/internal/` layers, the eslint import-boundary rule, green `bun run check`).

---

## 1. What you're building

The **MaxCapped guardrail** — the pure rule that decides whether a proposed `maxCapped` value is acceptable for a given `openingBalance`, and, when it is only conditionally acceptable, whether the user has explicitly confirmed it. Two functions in `src/domain/`:

1. **`evaluateMaxCapped(openingBalance, maxCapped)`** — the pure **zone classifier**. Returns which of three zones the pair falls in (`ok` / `amber` / `blocked`), the `2×` hard ceiling (for UI messaging), and the amber-zone **savings draw** (`maxCapped − openingBalance`) the confirmation sheet needs.
2. **`validateMaxCapped({ openingBalance, maxCapped, confirmed })`** — the **enforcement gate**. Composes the zone with the caller's explicit `confirmed` flag into an accept/reject result: green passes; amber passes **only** with `confirmed === true`; blocked **always** rejects (no override, even when `confirmed`).

Framework-agnostic, side-effect-free TypeScript. Numbers only — **no user-facing copy** (that's the web layer's job — §4.3).

**Why it exists — the problem it solves:**

`maxCapped` is the user's self-imposed spending ceiling, and `ASM Contribution = Opening Balance − COL` is real money flowing to savings (`monthly-ledger.md` §5). A `maxCapped` set _above_ Opening Balance is the root cause of a negative ASM — the user is permitting themselves to spend more than they earn (`monthly-ledger.md` §5, Case 3). RFC-022 resolved this with **Informed Friction**: don't block a _deliberate_ overspend, but make an _accidental_ one impossible. That resolution has two input-side rules that must fire **at the point of configuration change**, before the number is ever written:

- **Amber zone** — when `maxCapped > openingBalance`, require an **explicit confirmation** ("Your spending ceiling now exceeds this month's income; you'll be drawing $Z from savings. Continue?"). A dismiss is not a confirm (`monthly-ledger.md` §2).
- **Hard block** — when `maxCapped > 2 × openingBalance`, reject outright with **no override**. This catches typos and decimal slips (e.g. a `71523.50` where `7152.35` was meant), not intentional decisions (`monthly-ledger.md` §2, RFC-022).

If this logic were re-typed in the create command (EF3.7) and again in the creation form (EF3.12), the boundary would drift — the form could offer to confirm a value the command then blocks, or the "no override" could quietly leak an override. This ticket pins **both rules in one pure, fully-tested place** so the command's enforcement and the form's live UI agree by construction, and so the enforcement holds no matter who calls it.

> **Cross-ticket decision (from the EF3 epic).** The MaxCapped guardrail rule (amber `> Opening`; hard-block `> 2× Opening`, no override) lives **once**, here (`evaluateMaxCapped` / `validateMaxCapped`), and is **consumed** by the create-ledger command (EF3.7) and the creation form (EF3.12). It is never re-implemented in the data or web layers. This is the same "rule lives in one domain function, both the command and the UI consume it" discipline as the COL-contribution rule (EF3.3) and the creation-window math (EF3.4).

---

## 2. Public API / contract

Exact TS signatures. These names are the contract every later ticket imports — keep them stable. Barrel-exported from `src/index.ts`; implementation lives in `src/domain/max-capped.ts`.

```ts
import type { Money } from "./money"; // EF3.1

// ─────────────────────────────── Zones ───────────────────────────────

/**
 * Which guardrail zone a (openingBalance, maxCapped) pair falls in
 * (monthly-ledger.md §2, RFC-022):
 *   'ok'      — maxCapped ≤ openingBalance                 → no friction (green)
 *   'amber'   — openingBalance < maxCapped ≤ 2×opening      → allowed WITH explicit confirmation
 *   'blocked' — maxCapped > 2×openingBalance                → rejected, NO override (input-error guard)
 *
 * Boundaries are strict on the low side and inclusive on the high side of amber:
 * maxCapped == openingBalance is 'ok' (Case 2 — no structural floor, but no friction);
 * maxCapped == 2×openingBalance is 'amber' (the block is only ABOVE 2×).
 */
export type MaxCappedZone = "ok" | "amber" | "blocked";

/**
 * The pure classification of a proposed maxCapped against an opening balance.
 * All money values are exact Money (EF3.1). Numbers only — no display copy (§4.3).
 */
export interface MaxCappedGuardrail {
  readonly zone: MaxCappedZone;
  /** The absolute ceiling: 2 × openingBalance, via addMoney(opening, opening) — exact, no
   *  multiplication/float. Always present so the UI can show "ceiling can't exceed $X". */
  readonly hardCap: Money;
  /** The savings draw the amber confirmation sheet reports — maxCapped − openingBalance —
   *  i.e. the "$Z you'll be drawing from savings". Non-null IFF zone === 'amber'; null for
   *  'ok' (no draw) and 'blocked' (rejected — the UI shows a hard-cap message, not a draw). */
  readonly savingsDraw: Money | null;
}

/**
 * THE zone classifier. Pure: same inputs → same outputs, no I/O, no clock.
 * Drives the creation-form UI (EF3.12) live as the user types, and is the basis
 * validateMaxCapped composes with the confirm flag. Order matters — openingBalance
 * first (the reference income), maxCapped second (the proposed ceiling).
 */
export function evaluateMaxCapped(
  openingBalance: Money,
  maxCapped: Money,
): MaxCappedGuardrail;

// ─────────────────────────── Enforcement gate ─────────────────────────

/** Why validateMaxCapped rejected a proposed maxCapped. */
export type MaxCappedRejectionReason =
  | "requires_confirmation" // amber zone, but `confirmed` was false
  | "exceeds_hard_cap"; // blocked zone — above 2×opening; NEVER overridable

/**
 * The gate's result. Both variants carry `guardrail` so the caller always has the
 * zone / hardCap / savingsDraw for messaging (a rejected amber still needs $Z to
 * prompt; a rejected block still needs hardCap to explain the ceiling).
 */
export type MaxCappedValidation =
  | { readonly ok: true; readonly guardrail: MaxCappedGuardrail }
  | {
      readonly ok: false;
      readonly reason: MaxCappedRejectionReason;
      readonly guardrail: MaxCappedGuardrail;
    };

/**
 * THE enforcement gate — used by the create-ledger command (EF3.7) before it writes,
 * and mirrored by the creation form (EF3.12). Pure; never throws (a bad maxCapped is
 * USER input, not a programming error — so it returns a result, unlike EF3.1's codecs
 * which throw on malformed DB values).
 *
 *   zone 'ok'                    → { ok: true }                              (confirmed ignored)
 *   zone 'amber' & confirmed     → { ok: true }
 *   zone 'amber' & !confirmed    → { ok: false, reason: 'requires_confirmation' }
 *   zone 'blocked' (any confirm) → { ok: false, reason: 'exceeds_hard_cap' }  (NO override)
 *
 * `confirmed` is the user's explicit amber-zone acknowledgement ("Yes, I understand" —
 * monthly-ledger.md §2 / RFC-022). It can only lift the amber gate; it can NEVER rescue
 * a blocked value.
 */
export function validateMaxCapped(input: {
  readonly openingBalance: Money;
  readonly maxCapped: Money;
  readonly confirmed: boolean;
}): MaxCappedValidation;
```

---

## 3. Package placement, layer & exports

Pure **domain code** — lands in `@nafios/finance`'s domain layer (the layer that must never import Supabase, `@nafios/db`, or `src/internal/` — enforced by the EF2 eslint import-boundary rule).

```
packages/finance/
├── src/
│   ├── index.ts            # barrel: re-exports the §2 surface (alongside EF3.1–EF3.4)
│   ├── domain/
│   │   ├── money.ts        # Money, addMoney, subtractMoney, compareMoney (EF3.1) — consumed here
│   │   └── max-capped.ts   # MaxCappedZone, MaxCappedGuardrail, evaluateMaxCapped,
│   │                       #   MaxCappedRejectionReason, MaxCappedValidation, validateMaxCapped  ← this ticket
│   └── internal/           # (EF3.7 create command calls validateMaxCapped before writing — later)
└── tests/
    └── unit/
        └── max-capped.test.ts  # the §6 matrix
```

- **Zero I/O, zero new dependencies, no clock.** No `@supabase/supabase-js`, no `@nafios/db`, no `Date.now()` / argless `new Date()` / `fetch` / env access. Both functions are pure functions of their two/three arguments.
- **All math through EF3.1's Money helpers.** `hardCap = addMoney(openingBalance, openingBalance)`; `savingsDraw = subtractMoney(maxCapped, openingBalance)`; zone boundaries via `compareMoney`. No `*`, no `/`, no raw-number arithmetic on cents — the `2×` ceiling is doubling-by-addition, exact for the full `numeric(12,2)` range (EF3.1 §4.1).
- **Barrel is the only surface.** Everything in §2 is re-exported from `src/index.ts`; the data and web layers import from `@nafios/finance`, never a deep path.
- Files kebab-case; `typecheck` + `test` keys (from EF2.1) keep these wired into the root `bun run check`.

---

## 4. Behavior & rules

### 4.1 Zone classification (`evaluateMaxCapped`)

1. **Three zones by the `maxCapped` : `openingBalance` relationship** (`monthly-ledger.md` §2, RFC-022 Tiers). Let `hardCap = addMoney(opening, opening)` (= 2× opening):
   - **`ok`** ⟺ `compareMoney(maxCapped, opening) <= 0` — i.e. `maxCapped ≤ opening`. No friction (green).
   - **`amber`** ⟺ `maxCapped > opening` **and** `maxCapped ≤ hardCap`. Allowed only with explicit confirmation.
   - **`blocked`** ⟺ `compareMoney(maxCapped, hardCap) > 0` — i.e. `maxCapped > 2× opening`. Rejected, no override.
2. **Boundaries are exact and deliberate.** `maxCapped == opening` is **`ok`**, not amber — the amber trigger is _strictly above_ Opening Balance (`monthly-ledger.md` §2: "to a value **above** `openingBalance`"; the domain spec's Case 2 "MaxCapped == Opening Balance" carries no friction). `maxCapped == hardCap` (exactly 2× opening) is **`amber`**, not blocked — the block is _strictly above_ 2× (`monthly-ledger.md` §2: "**above** 2× Opening Balance"). One cent either way flips the zone (rows 3, 5, 6).
3. **`hardCap` is always the 2× ceiling.** `hardCap = addMoney(opening, opening)`, returned in every zone so the UI can always render the ceiling. Doubling via `addMoney` is exact; no `multiplyMoney` ships (EF3.1 defines none — nothing in EF3 needs general multiplication, and doubling-by-addition is exact — §8).
4. **`savingsDraw` is the amber-only $Z.** `savingsDraw = subtractMoney(maxCapped, opening)` **iff** `zone === 'amber'`; `null` otherwise. It is the "you'll be drawing $Z from savings" figure the confirmation sheet needs (`monthly-ledger.md` §2). It is `null` for `ok` (there is no draw) and for `blocked` (the value is rejected — the UI shows a hard-cap message, not a draw).
5. **Order matters; the classifier is total.** `evaluateMaxCapped(opening, maxCapped)` — opening first. It returns a zone for _every_ `Money` pair and never throws.

### 4.2 The enforcement gate (`validateMaxCapped`)

1. **Composes the zone with `confirmed`.** `validateMaxCapped` classifies via `evaluateMaxCapped`, then:
   - `zone === 'ok'` → `{ ok: true }` — `confirmed` is **ignored** (green needs no confirmation).
   - `zone === 'amber'` → `{ ok: true }` iff `confirmed === true`; else `{ ok: false, reason: 'requires_confirmation' }`.
   - `zone === 'blocked'` → **always** `{ ok: false, reason: 'exceeds_hard_cap' }`, regardless of `confirmed`.
2. **`confirmed` lifts amber only — it can NEVER override a block.** This is the crux of the "no override" rule (`monthly-ledger.md` §2, RFC-022): a `confirmed: true` on a blocked value still rejects with `exceeds_hard_cap`. The gate makes an accidental overspend impossible and a deliberate one (within 2×) possible — exactly RFC-022's Informed Friction (rows 13–15).
3. **Returns a result; never throws.** A bad `maxCapped` is _user_ input — the caller (EF3.7 command / EF3.12 form) renders the rejection, it is not a programming error. This differs from EF3.1's codecs, which throw `CodecError` on malformed _DB_ values. Both variants carry `guardrail`, so the caller always has `savingsDraw` (to prompt) and `hardCap` (to explain the ceiling).
4. **Same gate for creation and edit.** `monthly-ledger.md` §4 states the maxCapped guardrails "enforced on edits apply here" at creation too — the rule is identical either way. EF3 exercises this gate at **creation** (EF3.7 command / EF3.12 form, story-map S6); the same function covers an ongoing-ledger `maxCapped` edit whenever that surface is built — no re-implementation. The gate is caller-agnostic; it takes no ledger and models no `ongoing`/`reconciling` lock (that mutability check is `isLedgerMutable` — EF3.2 — the command's job before it calls this).

### 4.3 Purity, non-negativity & the numbers/copy split

1. **Pure, no clock, no I/O.** Both functions are deterministic functions of their arguments. No `Date`, no env, no `fetch` — trivially unit-testable (same discipline as EF3.1–EF3.4).
2. **Non-negativity is not this function's job.** `Money` permits negatives by type; the DB CHECKs `opening_balance ≥ 0` / `max_capped ≥ 0` (EF1.1) and the create command enforce non-negativity. This classifier only _compares_ the two inputs and stays well-defined for any `Money` pair (a negative or zero opening still classifies deterministically — §5 edge rows). It does not re-police the sign.
3. **`openingBalance == 0` collapses the amber zone.** Then `hardCap == 0`, so any `maxCapped > 0` is `blocked` and `maxCapped ≤ 0` is `ok` — the amber band is empty. This is a correct, deterministic consequence of the 2× rule, not a special case; the non-zero-income concern belongs to the command/DB, not here (rows 8–9).
4. **Numbers only — no user-facing copy.** The functions return `zone` + the raw `Money` amounts (`hardCap`, `savingsDraw`). The confirmation-sheet wording ("Your spending ceiling ($X) now exceeds this month's income ($Y)…"), currency formatting, and locale live in the **web layer** (EF3.12) — same boundary as EF3.1 ("no display/locale formatting in the codec"). `$X` = the caller's `maxCapped`, `$Y` = the caller's `openingBalance`, `$Z` = `savingsDraw` — the domain supplies the figures; the UI composes the sentence.

---

## 5. Worked example — the RFC-022 / Jan 2027 anchor

Pure calls, only EF3.1 codecs + this ticket's functions. Opening Balance is the Jan 2027 anchor `7152.35` (EF3.1/EF3.2); the 2× hard cap is `14304.70`.

```ts
const opening = decodeMoney("7152.35"); // 715235 cents (EF3.1)

// ── Green — the real Jan 2027 ceiling sits comfortably under income ──────────
evaluateMaxCapped(opening, decodeMoney("6415.00"));
// => { zone: 'ok', hardCap: 14304.70, savingsDraw: null }
evaluateMaxCapped(opening, decodeMoney("7152.35")); // == opening → still green (Case 2)
// => { zone: 'ok', hardCap: 14304.70, savingsDraw: null }

// ── Amber — ceiling above income; explicit confirm required ──────────────────
evaluateMaxCapped(opening, decodeMoney("7500.00")); // RFC-022 scenario
// => { zone: 'amber', hardCap: 14304.70, savingsDraw: 347.65 }   // 7500.00 − 7152.35
evaluateMaxCapped(opening, decodeMoney("7152.36")); // one cent above opening
// => { zone: 'amber', hardCap: 14304.70, savingsDraw: 0.01 }
evaluateMaxCapped(opening, decodeMoney("14304.70")); // exactly 2× → top of amber, NOT blocked
// => { zone: 'amber', hardCap: 14304.70, savingsDraw: 7152.35 }

// ── Blocked — above 2× income; an input error, no override ───────────────────
evaluateMaxCapped(opening, decodeMoney("14304.71")); // one cent above 2×
// => { zone: 'blocked', hardCap: 14304.70, savingsDraw: null }
evaluateMaxCapped(opening, decodeMoney("71523.50")); // decimal-slip typo (10× the intended 7152.35)
// => { zone: 'blocked', hardCap: 14304.70, savingsDraw: null }

// ── The enforcement gate (EF3.7 / EF3.12) ────────────────────────────────────
validateMaxCapped({
  openingBalance: opening,
  maxCapped: decodeMoney("6415.00"),
  confirmed: false,
});
// => { ok: true, guardrail: { zone: 'ok', ... } }                    (green; confirmed ignored)

validateMaxCapped({
  openingBalance: opening,
  maxCapped: decodeMoney("7500.00"),
  confirmed: false,
});
// => { ok: false, reason: 'requires_confirmation', guardrail: { zone: 'amber', savingsDraw: 347.65, ... } }

validateMaxCapped({
  openingBalance: opening,
  maxCapped: decodeMoney("7500.00"),
  confirmed: true,
});
// => { ok: true, guardrail: { zone: 'amber', savingsDraw: 347.65, ... } }   (confirmed lifts amber)

validateMaxCapped({
  openingBalance: opening,
  maxCapped: decodeMoney("20000.00"),
  confirmed: true,
});
// => { ok: false, reason: 'exceeds_hard_cap', guardrail: { zone: 'blocked', ... } }
//    ↑ confirmed: true does NOT rescue a blocked value — the block is absolute.
```

---

## 6. Verification matrix (unit tests)

Encode as unit tests in `tests/unit/max-capped.test.ts` so `bun run check` enforces them. Pure functions — no DB, no clock; fixtures are just `decodeMoney` values. Money assertions compare via `encodeMoney`.

**`evaluateMaxCapped` — zones, `hardCap`, `savingsDraw`** (`opening` / `maxCapped`)

| #   | `opening` / `maxCapped` | `zone` / `savingsDraw` / `hardCap` | Why                                                             |
| --- | ----------------------- | ---------------------------------- | --------------------------------------------------------------- |
| 1   | `7152.35` / `6415.00`   | `ok` / `null` / `14304.70`         | real Jan 2027 ceiling under income (green)                      |
| 2   | `7152.35` / `7152.35`   | `ok` / `null` / `14304.70`         | `== opening` → green (Case 2, no friction)                      |
| 3   | `7152.35` / `7152.36`   | `amber` / `0.01` / `14304.70`      | one cent above opening → amber                                  |
| 4   | `7152.35` / `7500.00`   | `amber` / `347.65` / `14304.70`    | RFC-022 scenario; draw = `maxCapped − opening`                  |
| 5   | `7152.35` / `14304.70`  | `amber` / `7152.35` / `14304.70`   | exactly 2× → top of amber, **not** blocked                      |
| 6   | `7152.35` / `14304.71`  | `blocked` / `null` / `14304.70`    | one cent above 2× → blocked                                     |
| 7   | `7152.35` / `71523.50`  | `blocked` / `null` / `14304.70`    | decimal-slip typo (10×) → blocked (input-error guard)           |
| 8   | `0.00` / `0.00`         | `ok` / `null` / `0.00`             | zero opening, zero cap → green                                  |
| 9   | `0.00` / `0.01`         | `blocked` / `null` / `0.00`        | zero opening ⇒ 2×=0; any positive cap blocked; amber band empty |

**`validateMaxCapped` — the gate (`confirmed` interaction)** (`opening` / `maxCapped` / `confirmed`)

| #   | `opening` / `maxCapped` / `confirmed` | Result                                                               | Why                                                    |
| --- | ------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------ |
| 10  | `7152.35` / `6415.00` / `false`       | `{ ok: true, zone 'ok' }`                                            | green passes; `confirmed` irrelevant                   |
| 11  | `7152.35` / `7152.35` / `false`       | `{ ok: true, zone 'ok' }`                                            | `== opening` boundary → green                          |
| 12  | `7152.35` / `7500.00` / `false`       | `{ ok: false, 'requires_confirmation' }`                             | amber, not confirmed                                   |
| 13  | `7152.35` / `7500.00` / `true`        | `{ ok: true, zone 'amber' }`                                         | amber, confirmed → passes                              |
| 14  | `7152.35` / `14304.70` / `true`       | `{ ok: true, zone 'amber' }`                                         | exactly 2×, confirmed → passes                         |
| 15  | `7152.35` / `14304.71` / `true`       | `{ ok: false, 'exceeds_hard_cap' }`                                  | **blocked; `confirmed: true` does NOT override**       |
| 16  | `7152.35` / `20000.00` / `false`      | `{ ok: false, 'exceeds_hard_cap' }`                                  | blocked regardless of confirm                          |
| 17  | any row above                         | `.guardrail` matches `evaluateMaxCapped(opening, maxCapped)` exactly | gate carries the classifier's zone/hardCap/savingsDraw |

**Purity / boundary**

| #   | Action                                                               | Expected                                                                      |
| --- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 18  | `hardCap` for opening `7152.35`                                      | `"14304.70"` — computed via `addMoney(opening, opening)`, **not** float `* 2` |
| 19  | Result carries **no** message string — only `zone` + `Money` amounts | numbers-only (copy is EF3.12's — §4.3)                                        |
| 20  | `src/domain/max-capped.ts` imports only EF3.1's `Money` helpers      | no clock / env / `fetch` / `@supabase` / `@nafios/db`                         |

---

## 7. Acceptance criteria

- [ ] **AC1** — `src/domain/max-capped.ts` exists in `@nafios/finance`; the full public surface in §2 (`MaxCappedZone`, `MaxCappedGuardrail`, `evaluateMaxCapped`, `MaxCappedRejectionReason`, `MaxCappedValidation`, `validateMaxCapped`) is re-exported from `src/index.ts`; wired into `bun run check` (`typecheck` + `test`).
- [ ] **AC2** — `evaluateMaxCapped` classifies exactly per §4.1: `ok` ⟺ `maxCapped ≤ opening`; `amber` ⟺ `opening < maxCapped ≤ 2×opening`; `blocked` ⟺ `maxCapped > 2×opening`. The boundaries are correct — `== opening` is `ok`, `== 2×opening` is `amber` (rows 2, 5, 6).
- [ ] **AC3** — `hardCap` is `2 × opening` computed via `addMoney(opening, opening)` (exact, no float/`*`), present in every zone (rows 1–9, 18).
- [ ] **AC4** — `savingsDraw` is `subtractMoney(maxCapped, opening)` iff `zone === 'amber'`, and `null` for `ok` and `blocked` (rows 1–9).
- [ ] **AC5** — `validateMaxCapped` passes green (any `confirmed`), passes amber **only** when `confirmed === true` else rejects `requires_confirmation`, and **always** rejects blocked as `exceeds_hard_cap` (rows 10–16).
- [ ] **AC6** — **No override:** a `blocked` value with `confirmed: true` still returns `{ ok: false, reason: 'exceeds_hard_cap' }` (row 15). `confirmed` can lift amber and nothing else.
- [ ] **AC7** — Both variants of `MaxCappedValidation` carry `guardrail` equal to `evaluateMaxCapped(opening, maxCapped)` (row 17); the functions return results and **never throw** on any `Money` pair (user input, not a programming error — §4.2).
- [ ] **AC8** — Every row of the §6 matrix passes as a unit test, including the ±1¢ boundary flips (rows 3, 5, 6) and the zero-opening edge (rows 8–9); the result contains **no user-facing copy** (numbers only — §4.3); `bun run check` is green across the workspace.
- [ ] **AC9** — **Boundary stays pure:** `src/domain/max-capped.ts` imports only EF3.1's `Money` helpers (`compareMoney`, `addMoney`, `subtractMoney`); no `@supabase/supabase-js`, no `@nafios/db`, no `src/internal/`, no clock/env/`fetch`; the eslint import-boundary rule stays green.

---

## 8. Notes / decisions

1. **Guardrail rule owned here — the epic's cross-ticket decision.** `evaluateMaxCapped` / `validateMaxCapped` are the single home of the amber-`> Opening` / block-`> 2× Opening` rule. EF3.7 (command) enforces via `validateMaxCapped`; EF3.12 (form) drives its UI via `evaluateMaxCapped` and passes `confirmed` to the command. Neither re-types the boundary. If the thresholds ever change, they change here and both consumers follow — the same discipline as the COL rule (EF3.3) and the window math (EF3.4).
2. **Classifier + gate, deliberately two functions.** `evaluateMaxCapped` answers "what zone / what draw / what ceiling" — the creation form needs this **live as the user types**, before any confirm exists, to render the amber sheet and disable submit. `validateMaxCapped` answers "given the user's confirm, may this be written" — the command needs this at submit. Splitting them mirrors EF3.4's `isWithinCreationWindow` (predicate) + `resolveCreationState` (composed). The gate is a thin composition of the classifier + `confirmed`; the mild overlap is intentional.
3. **The `2×` ceiling is doubling-by-addition, not multiplication.** EF3.1 ships no `multiplyMoney` (nothing in EF3 divides or scales money — the `percentage_of_opening` config path is dropped from EF3). `addMoney(opening, opening)` is exact for the full `numeric(12,2)` range and needs no rounding policy. If a later config capability makes the multiplier configurable (it is fixed at `2` in EF3, like `leadDays` is fixed at `7` in EF3.4), it supplies the factor then; this function's contract is unchanged.
4. **Returns a result; does not throw.** A `maxCapped` above the ceiling is _user_ input the UI must surface gracefully — not a data-integrity error. So the gate returns a discriminated `{ ok }` union (the caller renders it), unlike EF3.1's codecs which throw `CodecError` on malformed DB values. Same reasoning as EF3.3's `applyStatusTransition` staying total.
5. **Numbers, not copy.** The confirmation-sheet sentence and currency formatting live in EF3.12 (web). The domain returns `zone` + `Money` figures (`savingsDraw` = $Z, `hardCap`, plus the caller's own `maxCapped`/`openingBalance` = $X/$Y). Keeping presentation out of the domain keeps this layer pure and single-currency-agnostic — EF3.1's stance.
6. **Same gate covers creation and (future) edit; mutability is the caller's check.** `monthly-ledger.md` §4 says the edit guardrails apply identically at creation. EF3 wires the gate into creation only (EF3.7/EF3.12, S6); an ongoing-ledger `maxCapped` edit reuses it verbatim when built. The gate takes no ledger and models no lock — `settled`/`reconciling` immutability is `isLedgerMutable` (EF3.2), checked by the command before it calls this.
7. **Tier 3 (the negative-ASM banner) is NOT here.** RFC-022 has three tiers: amber confirm (Tier 2) and the 2× hard block are _input-side_ rules — this ticket. The Tier 3 persistent negative-ASM banner is a _derived_ signal from a live ledger (`ASM < 0`), owned by the metrics engine's `isAsmNegative` (EF3.2) and rendered by EF3.13. This ticket catches the **root cause** at configuration time; `isAsmNegative` catches the **symptom** at read time. Do not compute ASM or a banner signal here.

_Provenance (not required reading): the amber-zone confirmation (`maxCapped > openingBalance`, "you'll be drawing $Z from savings", explicit confirm not dismiss) and the 2× hard block ("above 2× Opening Balance … absolute, no override") are from `monthly-ledger.md` §2 (MaxCapped edit guardrails) and §4 (creation reuses the edit guardrails), and from RFC-022 (resolved) Tiers 2 + hard block; the three structural cases of MaxCapped vs Opening Balance are from `finance-domain-spec.md` §7 / `monthly-ledger.md` §5; the Informed-Friction principle ("make accidental overspend impossible, deliberate overspend possible") and "no override" are from RFC-022; the split of Tier 3 (negative-ASM banner) to the metrics engine is from EF3.2 (§4.1 rule 5, `isAsmNegative`); the `Money` type and `addMoney`/`subtractMoney`/`compareMoney` helpers and the "no float, exact arithmetic" / "no display formatting" stances are from EF3.1; the Jan 2027 anchor (`openingBalance` 7152.35, `maxCapped` 6415.00) is from the EF3 epic and `monthly-ledger.md` §5._

---

## 9. Definition of Done (PR-ready)

This ticket is **one PR** that closes EF3.5. It is a leaf domain function depending only on EF3.1 (`Money`). Mergeable when all of the following hold — no follow-up, no stubs, no TODOs:

- [ ] `src/domain/max-capped.ts` and `tests/unit/max-capped.test.ts` are present; the §2 surface is re-exported from `src/index.ts`.
- [ ] **All §7 acceptance criteria (AC1–AC9) pass**, including the ±1¢ boundary flips (`== opening` → `ok`, `== 2×` → `amber`, `2×+0.01` → `blocked`), the amber `savingsDraw` figure, and the "no override" case (blocked + `confirmed: true` still rejects).
- [ ] **`bun run check` is green across the workspace** — `typecheck`, all §6 unit tests, and the eslint domain/data import-boundary rule (AC9). This is the merge gate.
- [ ] No surface beyond §2 — in particular **no ASM/COL computation or negative-ASM banner signal** (that is EF3.2's `isAsmNegative` / EF3.13), **no user-facing copy** (EF3.12), no `multiplyMoney`, no ledger-mutability check (EF3.2), no clock read, and no status transition (EF3.7).
- [ ] This ticket's Revision History is updated; the EF3.5 checkbox in `EF3.md` is ticked when merged.

---

## Revision History

| Version | Date       | Author            | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------- | ---------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | 2026-07-03 | NafiOS Foundation | Initial standalone task for the MaxCapped guardrail in `@nafios/finance`'s domain layer: `evaluateMaxCapped` (pure zone classifier → `ok`/`amber`/`blocked`, `hardCap` = 2×opening via `addMoney`, amber-only `savingsDraw` = `maxCapped − opening`) and `validateMaxCapped` (enforcement gate composing zone + explicit `confirmed` flag → `{ ok }` result; green passes, amber passes only when confirmed, blocked always rejects with **no override**). Pins RFC-022's Informed-Friction input-side rules (amber `> Opening` confirm, hard-block `> 2× Opening`) in one place consumed by the create command (EF3.7) and creation form (EF3.12, S6); boundaries fixed (`== opening` → ok, `== 2×` → amber); numbers-only (copy is EF3.12's); returns a result and never throws (user input, not a programming error). Scopes out the Tier-3 negative-ASM banner (EF3.2 `isAsmNegative` / EF3.13), `multiplyMoney`, ledger-mutability, and status transitions. Verification matrix (zones, ±1¢ boundaries, zero-opening edge, gate + `confirmed`, no-override) + AC1–AC9 + §9 Definition of Done (green `bun run check` as the merge gate); PR-able standalone as a leaf domain function on EF3.1. |

</content>
</invoke>
