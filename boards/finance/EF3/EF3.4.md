# EF3.4 — Creation-window & openable-month resolver + roll-forward signal

> - `M1`
> - `type:feature`
> - `module:finance`
> - `area:domain`
> - `P0`
> - `size:S`
> - **Epic:** EF3 — Get started: open your first ledger & track it with manual envelopes

> **This ticket is self-contained.** Everything needed to build the **creation-window predicate**, the **openable-month resolver**, and the **roll-forward warning signal** is in this file. Stack: **plain TypeScript, pure, zero I/O.** It lives in `@nafios/finance`'s **domain layer** (`src/domain/`) — no Supabase, no `@nafios/db`, no `fetch`, and **no clock access** (`today` is caller-supplied). **No ORM / no Drizzle. No schema changes** (EF3 consumes the EF1 schema unchanged).
>
> **Depends on:**
> - **EF3.1** (Month codec) — identifies months with `Month`, and shifts/compares them with `addMonths` / `compareMonths`. This ticket relies on EF3.1's **first-of-month invariant** and never re-checks it.
> - **EF3.2** (`LedgerStatus`) for the **type only** — the resolver reads each existing ledger's `status` to detect a stale `ongoing` ledger for the roll-forward signal.
>
> **Consumed by:**
> - **EF3.7** (create-ledger command) — validates that the requested month is one of the resolver's openable months **before** committing; the command performs the previous-`ongoing` → `reconciling` transition, which this ticket **does not** model.
> - **EF3.12** (new-ledger creation flow) — the month picker offers exactly `openable.current` / `openable.next`; `isWindowOpen` drives the in-window nudge (story-map S3).
> - **EF3.11 / EF3.13** (web shell + ledger view) — render the persistent, non-dismissible roll-forward banner from `rollForward` (story-map S5).
>
> **Build-order & PR readiness.** A **leaf** domain function: it depends only on EF3.1 (`Month`) and EF3.2's `LedgerStatus` type, and nothing in the domain layer depends on it (its consumers are all in the data/web layers). It is independently PR-able the moment EF3.1 and EF3.2's `LedgerStatus` exist — stack it on or co-merge it with them; either way `bun run check` stays green (see §9). **Do not** re-implement Month arithmetic or the first-of-month check here — those are EF3.1's.
>
> **Assumes EF2 is done** (the `@nafios/finance` package shell — `src/domain/` + `src/internal/` layers, the eslint import-boundary rule, green `bun run check`).

---

## 1. What you're building

The **pure resolver** that answers three questions about "where is the user in the month, and what can they do about their ledger" — from `today`, `leadDays`, and the ledgers that already exist:

1. **Is the creation window open?** — `isWithinCreationWindow(today, leadDays)`: are we inside the final `leadDays` days of the current calendar month?
2. **Which months may be opened right now?** — the current calendar month (if it has no ledger) and/or the next calendar month (if the window is open and it has no ledger) — and **never any other month**.
3. **Should the roll-forward warning show?** — has a new month begun with no ledger for it while the user was already tracking?

Framework-agnostic, side-effect-free TypeScript in `src/domain/`.

**Why it exists — the problem it solves:**

Ledger creation is **bounded and never automatic** (`monthly-ledger.md` §3, §6): the system will not let a user open an arbitrary far-future month (`2028-03` today) or back-fill a random past month, and it never creates a ledger on their behalf. Instead it grants a narrow *permission* — open the current month, or (only in the last few days of the month) the next one — and, when the user lets a month turn over without acting, it escalates to a persistent warning rather than silently rolling anything forward. All three of those decisions are pure functions of `today` + `leadDays` + the existing ledgers. Scattering that date arithmetic across the create command (EF3.7), the creation form (EF3.12), and the hub banner (EF3.11/EF3.13) is how "openable" drifts out of sync between the picker and the command, or the window boundary lands a day off. This ticket pins all of it in **one** pure, fully-tested resolver so every surface agrees by construction.

It is also the **home of the roll-forward warning**. That warning is derived from `today` + existing ledgers, **not** from any single ledger's fields — which is exactly why EF3.2's metrics engine explicitly refused it (EF3.2 §8.6) and handed it here.

> **Cross-ticket decision (from the EF3 epic).** The first-of-month `DATE` handling for `month` is **owned by the Month codec (EF3.1)** and *consumed* here — this resolver builds and compares `Month` values via EF3.1 and never re-derives the first-of-month invariant. The **day-level creation-window math** (the day-of-month and days-in-month reasoning the window needs — below `Month` granularity) is **owned here**: it is the one place in the domain that reasons about days *within* a month. The **roll-forward warning** is owned here too (deferred from the metrics engine — EF3.2 §8.6, Notes 6).

---

## 2. Public API / contract

Exact TS signatures. These names are the contract every later ticket imports — keep them stable. Barrel-exported from `src/index.ts`; implementation lives in `src/domain/creation-window.ts`.

```ts
import type { Month } from './month';           // EF3.1
import type { LedgerStatus } from './monthly-ledger'; // EF3.2 (type-only seam)

// ─────────────────────────── Inputs ───────────────────────────

/**
 * The minimal view of an existing ledger the resolver needs: its month (to decide
 * which months are free) and its status (to spot a stale `ongoing` ledger for the
 * roll-forward signal). A full MonthlyLedger (EF3.2) structurally satisfies this,
 * so the repository (EF3.6/EF3.10) can pass its ledgers directly and test fixtures
 * stay minimal — same "accepts a minimal shape" discipline as computeLedgerMetrics.
 */
export interface LedgerSummary {
  readonly month: Month;         // EF3.1
  readonly status: LedgerStatus; // EF3.2
}

// ─────────────────────── Creation window ──────────────────────

/**
 * True iff `today` falls within the CREATION WINDOW — the final `leadDays` days of
 * its calendar month (monthly-ledger.md §3). This is the only period during which
 * the NEXT month may be opened. Pure day-math: window is open ⟺
 * (daysInMonth(today) − dayOf(today)) < clampedLeadDays.
 *
 * `today` is a caller-supplied "YYYY-MM-DD" string — the function reads no clock.
 * It is validated via EF3.1's month parsing; a malformed/impossible date throws
 * CodecError (a bad `today` is a programming error, not user input — §4.3).
 *
 * `leadDays` is clamped to the domain range 1–7 (fractional values floored first),
 * per monthly-ledger.md §3/§6. EF3 always passes the fixed 7 (no config layer);
 * clamping is defensive and future-proofs the config capability (EF-later).
 */
export function isWithinCreationWindow(today: string, leadDays: number): boolean;

// ─────────────────────── Openable months ──────────────────────

/**
 * Which months the user may open right now (monthly-ledger.md §3). At most two —
 * NEVER any other month (no far-future, no back-fill; a month that already has a
 * ledger is never offered).
 */
export interface OpenableMonths {
  /** The current calendar month (monthOf(today)), iff no ledger exists for it.
   *  Window-INDEPENDENT — the current month is always openable when free (a fresh
   *  start, or a gap after settling everything). null when it already has a ledger. */
  readonly current: Month | null;
  /** The next calendar month (addMonths(current, 1)), iff BOTH the window is open
   *  AND no ledger exists for it. null outside the window or when already taken. */
  readonly next: Month | null;
}

// ─────────────────────── Roll-forward signal ──────────────────

/**
 * The roll-forward warning signal (monthly-ledger.md §3 "Roll-forward warning").
 * Derived from `today` + existing ledgers only — NOT from any single ledger's own
 * fields, which is why it lives here and not in the metrics engine (EF3.2 §8.6).
 */
export interface RollForwardSignal {
  /** true ⟺ the current calendar month has NO ledger AND the user already has ≥1
   *  ledger (they were tracking). Drives the persistent, non-dismissible banner —
   *  same prominence tier as the negative-ASM banner. A brand-new user with zero
   *  ledgers gets `false`: they see the "open your first ledger" empty state (S2),
   *  not a warning (§4.2 rule 2). */
  readonly active: boolean;
  /** The current calendar month the banner urges the user to open (monthOf(today)).
   *  ALWAYS set (even when `active` is false) so the UI can name the month. */
  readonly month: Month;
  /** An `ongoing` ledger belonging to a month EARLIER than the current one, if any —
   *  the classic §3 "previous ledger stuck ongoing" case (an `ongoing` ledger may
   *  belong to an already-ended month). null when the gap follows a settled month or
   *  there is no earlier ongoing ledger. Informational only — does not gate `active`. */
  readonly staleOngoingMonth: Month | null;
}

// ─────────────────────── The resolver ─────────────────────────

/** Everything the finance hub / creation flow needs from one pure call. */
export interface CreationState {
  readonly currentMonth: Month;      // monthOf(today) — convenience
  readonly isWindowOpen: boolean;    // === isWithinCreationWindow(today, leadDays)
  readonly openable: OpenableMonths;
  readonly rollForward: RollForwardSignal;
}

/**
 * THE creation-state resolver. Pure: same inputs → same outputs, no I/O, no clock.
 * Composes the window predicate, the openable-month rules, and the roll-forward
 * signal over `today` + `leadDays` + the existing ledgers.
 */
export function resolveCreationState(input: {
  readonly today: string;                      // caller-supplied "YYYY-MM-DD"; no clock read
  readonly leadDays: number;                   // EF3 passes 7; clamped to 1–7 (fractional floored)
  readonly ledgers: readonly LedgerSummary[];  // all of the user's existing ledgers, any status/order
}): CreationState;
```

---

## 3. Package placement, layer & exports

Pure **domain code** — lands in `@nafios/finance`'s domain layer (the layer that must never import Supabase, `@nafios/db`, or `src/internal/` — enforced by the EF2 eslint import-boundary rule).

```
packages/finance/
├── src/
│   ├── index.ts              # barrel: re-exports the §2 surface (alongside EF3.1 / EF3.2 / EF3.3)
│   ├── domain/
│   │   ├── month.ts          # Month, monthOf, addMonths, compareMonths (EF3.1) — consumed here
│   │   ├── monthly-ledger.ts # LedgerStatus (EF3.2) — the type-only seam
│   │   └── creation-window.ts# LedgerSummary, isWithinCreationWindow, OpenableMonths,
│   │                         #   RollForwardSignal, CreationState, resolveCreationState  ← this ticket
│   └── internal/             # (EF3.7 create command validates against this resolver — later)
└── tests/
    └── unit/
        └── creation-window.test.ts  # the §6 matrix
```

- **Zero I/O, zero new dependencies, no clock.** No `@supabase/supabase-js`, no `@nafios/db`, no `Date.now()` / argless `new Date()` / `fetch` / env access. `today` arrives as a string from the caller and stays a string — this is what lets the whole resolver be a pure, fully-testable function of `today` (EF3.1 §4.2 rule 3).
- **Day-level math is internal to this file.** `daysInMonth(year, month)` (incl. the leap-year rule) and the day-of-month parse are private helpers here — EF3.1's `Month` deliberately has no day component, so day-within-month reasoning is owned by this ticket, not the codec.
- **Month identity/arithmetic is EF3.1's.** Build months via `monthOf` / `addMonths`, compare via `compareMonths`; never hand-roll `"YYYY-MM"` string math and never re-check first-of-month here.
- **Barrel is the only surface.** Everything in §2 is re-exported from `src/index.ts`; the data and web layers import from `@nafios/finance`, never a deep path.
- Files kebab-case; `typecheck` + `test` keys (from EF2.1) keep these wired into the root `bun run check`.

---

## 4. Behavior & rules

### 4.1 The creation window (`isWithinCreationWindow`) & openable months

1. **Window = the final `leadDays` days of the current month.** Open ⟺ `daysInMonth(today) − dayOf(today) < clampedLeadDays` — i.e. the days-remaining-in-month is strictly fewer than `leadDays`. For `leadDays = 7`: a 31-day month opens the window on the **25th** (days 25–31), a 30-day month on the **24th**, a 28-day Feb on the **22nd**, a 29-day (leap) Feb on the **23rd**. The last day of the month is always in-window; the 1st never is (for `leadDays ≤ 7`). This mirrors `monthly-ledger.md` §3 "the final `leadDays` days."
2. **`leadDays` is clamped to 1–7 (fractional floored).** `clampedLeadDays = clamp(⌊leadDays⌋, 1, 7)`, per `monthly-ledger.md` §3/§6 ("clamped to the range 1–7, default 7"). EF3 always passes `7`; the clamp is defensive so a bad caller can neither widen the window past a week nor disable it. The clamp lives here (a domain rule), not in a config layer (there is none in EF3).
3. **Current month — always openable when free, window-independent.** `openable.current = monthOf(today)` iff no existing ledger has that month; else `null`. This covers the fresh start and the "settled everything, returned to a gap" case (`monthly-ledger.md` §3).
4. **Next month — openable only in-window and only when free.** `openable.next = addMonths(monthOf(today), 1)` iff **both** `isWindowOpen` **and** no existing ledger has that month; else `null`. The year rolls correctly via `addMonths` (`2026-12` + window → next `2027-01`).
5. **No other month is ever openable.** `openable` only ever contains the current and/or next month — by construction, never a far-future or back-filled month. A month that already has a ledger is dropped (rules 3–4), matching the DB `(user_id, month)` uniqueness constraint (EF1.1) — "months with existing ledgers never offered."
6. **Openable ≠ the transition.** This resolver reports *permission* only. Opening the next month is what transitions the previous `ongoing` ledger to `reconciling` — that atomic side-effect is the **create-ledger command's** job (EF3.7), not this function's. During the window the current ledger stays `ongoing` (`monthly-ledger.md` §3).
7. **`isWindowOpen` vs `openable.next`.** `isWindowOpen` answers "is the window open" (drives the S3 in-window nudge even if the next month happens to already have a ledger); `openable.next` is the narrower "can I actually open the next month" (window open **and** free). Both are exposed deliberately — they answer different UI questions.

### 4.2 The roll-forward warning (`rollForward`)

1. **`active` ⟺ current month has no ledger AND the user already has ≥1 ledger.** When a new month has begun and the user — who was already tracking — has not opened its ledger, the persistent, non-dismissible roll-forward banner fires (`monthly-ledger.md` §3, same prominence tier as the negative-ASM banner). Equivalently: `active === (openable.current !== null && ledgers.length > 0)`.
2. **A brand-new user (zero ledgers) is NOT roll-forward.** With no prior ledger there is nothing to "roll forward from" — the current month having no ledger is the *first-run* state, surfaced as the "open your first ledger" empty-state CTA (story-map S2), not a warning. So `ledgers.length === 0 ⇒ active = false`. This is the deliberate line between S2 (fresh start) and S5 (roll-forward) — see Notes 3.
3. **`month` is always the current calendar month.** `rollForward.month = monthOf(today)`, set whether or not `active`, so the banner/empty-state can always name the month ("July has started but has no ledger…").
4. **`staleOngoingMonth` is the §3 "previous ledger stuck ongoing" case — informational.** It is the month of an `ongoing` ledger strictly earlier than the current month, if one exists (by the "one `ongoing` ledger" invariant there is at most one; if several are present — a broken invariant not expected in practice — the earliest is returned, deterministically). It is `null` when the current-month gap follows a **settled** month, or when the only `ongoing` ledger is the current/future month. It does **not** gate `active` (a settled-month gap still warns) — it is extra context for the UI, not the trigger.
5. **No transition, no generation.** Consistent with `monthly-ledger.md` §3: the resolver never mutates and never "rolls forward" anything — a stale `ongoing` ledger stays `ongoing` until the user manually creates the next one (EF3.7). This function only *reports* the state that should be warned about.

### 4.3 Purity, validation & determinism

1. **No clock — `today` is caller-supplied.** The resolver never calls `Date.now()` / `new Date()`. Callers (the hub loader, EF3.7) pass `today` as a `"YYYY-MM-DD"` string. This is what makes every window boundary and roll-forward case a deterministic unit test (same discipline as EF3.1's `monthOf`).
2. **`today` is validated via EF3.1.** The resolver derives `currentMonth` through EF3.1's month parsing, so a non-ISO or impossible `today` (`"2026-13-01"`, `"2026-02-30"`, `""`) throws `CodecError` — a malformed `today` is a programming error, not user input, so throwing is correct (EF3.1 §4.1 rule 3). The day-of-month used by the window is parsed from that already-validated string.
3. **Order-independent, status-aware.** `ledgers` may arrive in any order and with any statuses; the result is independent of ordering. Only `status === 'ongoing'` matters — and only for `staleOngoingMonth`; the openable computation looks at months alone (a month with a ledger of *any* status is taken, per the uniqueness constraint).

---

## 5. Worked example — the four scenarios that map to the story map

Pure calls, only EF3.1 codecs + this ticket's functions. `leadDays = 7` (EF3's fixed value) unless noted.

```ts
const jun = decodeMonth('2026-06-01'); // "2026-06"  (EF3.1)
const jul = decodeMonth('2026-07-01'); // "2026-07"
const aug = decodeMonth('2026-08-01'); // "2026-08"

// ── S2 · Fresh start, mid-month (window closed) ──────────────────────────────
resolveCreationState({ today: '2026-07-15', leadDays: 7, ledgers: [] });
// => currentMonth: "2026-07",
//    isWindowOpen: false,
//    openable: { current: "2026-07", next: null },       // current openable; window shut
//    rollForward: { active: false, month: "2026-07", staleOngoingMonth: null }  // 0 ledgers ⇒ no warning

// ── S3 · Prepare next month inside the window ────────────────────────────────
resolveCreationState({ today: '2026-07-28', leadDays: 7,
  ledgers: [{ month: jul, status: 'ongoing' }] });
// => currentMonth: "2026-07",
//    isWindowOpen: true,                                  // 31 − 28 = 3 < 7
//    openable: { current: null, next: "2026-08" },        // July taken; August openable
//    rollForward: { active: false, month: "2026-07", staleOngoingMonth: null }

// ── S5 · New month began, previous ledger stuck ongoing ──────────────────────
resolveCreationState({ today: '2026-07-03', leadDays: 7,
  ledgers: [{ month: jun, status: 'ongoing' }] });
// => currentMonth: "2026-07",
//    isWindowOpen: false,                                 // early in the month
//    openable: { current: "2026-07", next: null },        // July free ⇒ openable
//    rollForward: { active: true, month: "2026-07", staleOngoingMonth: "2026-06" }  // ← persistent banner

// ── Gap after settling everything (no ongoing, still warns) ──────────────────
resolveCreationState({ today: '2026-07-03', leadDays: 7,
  ledgers: [{ month: jun, status: 'settled' }] });
// => rollForward: { active: true, month: "2026-07", staleOngoingMonth: null }      // ≥1 ledger, July empty

// ── Year boundary — window rolls Dec → next Jan ──────────────────────────────
resolveCreationState({ today: '2026-12-28', leadDays: 7, ledgers: [] });
// => isWindowOpen: true, openable: { current: "2026-12", next: "2027-01" }         // addMonths rolls the year

// ── Window predicate, standalone ─────────────────────────────────────────────
isWithinCreationWindow('2026-07-25', 7); // => true   (first window day of a 31-day month)
isWithinCreationWindow('2026-07-24', 7); // => false
isWithinCreationWindow('2026-06-24', 7); // => true   (30-day month → window opens on the 24th)
isWithinCreationWindow('2026-02-22', 7); // => true   (28-day Feb)
isWithinCreationWindow('2028-02-23', 7); // => true   (leap Feb, 29 days)
isWithinCreationWindow('2026-07-01', 40);// => false  (leadDays clamped to 7 — day 1 not in final 7)
```

---

## 6. Verification matrix (unit tests)

Encode as unit tests in `tests/unit/creation-window.test.ts` so `bun run check` enforces them. Pure functions — no DB, no clock; fixtures are just `decodeMonth` values + status literals. `leadDays = 7` unless the row says otherwise.

**`isWithinCreationWindow` — the window boundary**

| #  | `today`, `leadDays` | Expected | Why |
|----|---------------------|----------|-----|
| 1  | `2026-07-25`, 7 | `true`  | first window day of a 31-day month (31−25=6 < 7) |
| 2  | `2026-07-24`, 7 | `false` | day before the window (31−24=7, not < 7) |
| 3  | `2026-07-31`, 7 | `true`  | last day is always in-window |
| 4  | `2026-07-01`, 7 | `false` | day 1 never in-window (leadDays ≤ 7) |
| 5  | `2026-06-24`, 7 / `2026-06-23`, 7 | `true` / `false` | 30-day month → window opens on the 24th |
| 6  | `2026-02-22`, 7 / `2026-02-21`, 7 | `true` / `false` | 28-day Feb (non-leap 2026) |
| 7  | `2028-02-23`, 7 / `2028-02-22`, 7 | `true` / `false` | 29-day Feb (leap 2028) |
| 8  | `2026-07-31`, 1 / `2026-07-30`, 1 | `true` / `false` | `leadDays = 1` → only the last day |
| 9  | `2026-07-01`, 40 | `false` | clamp to 7 (day 1 not in final 7) |
| 10 | `2026-07-31`, 0 | `true` | clamp to 1 → last day only |

**`resolveCreationState` — openable months**

| #  | `today` / `ledgers` | `openable` | Why |
|----|---------------------|------------|-----|
| 11 | `2026-07-15` / `[]` | `{ current: "2026-07", next: null }` | fresh, window shut |
| 12 | `2026-07-28` / `[]` | `{ current: "2026-07", next: "2026-08" }` | fresh, in-window → both openable |
| 13 | `2026-07-28` / `[jul:ongoing]` | `{ current: null, next: "2026-08" }` | July taken; August openable |
| 14 | `2026-07-28` / `[jul:ongoing, aug:ongoing]` | `{ current: null, next: null }` | both taken — never offered |
| 15 | `2026-07-03` / `[jun:ongoing]` | `{ current: "2026-07", next: null }` | July free; window shut |
| 16 | `2026-12-28` / `[]` | `{ current: "2026-12", next: "2027-01" }` | year rolls via `addMonths` |
| 17 | `2026-07-15` / `[jul:settled]` | `{ current: null, next: null }` | settled July still occupies the month |

**`resolveCreationState` — roll-forward signal**

| #  | `today` / `ledgers` | `rollForward` (`active` / `month` / `staleOngoingMonth`) | Why |
|----|---------------------|---------------------------------------------------------|-----|
| 18 | `2026-07-15` / `[]` | `false` / `2026-07` / `null` | fresh user — S2 empty state, not a warning |
| 19 | `2026-07-03` / `[jun:ongoing]` | `true` / `2026-07` / `2026-06` | S5 — previous ledger stuck ongoing |
| 20 | `2026-07-03` / `[jun:settled]` | `true` / `2026-07` / `null` | settled-month gap still warns; no stale ongoing |
| 21 | `2026-07-15` / `[jul:ongoing]` | `false` / `2026-07` / `null` | current month has a ledger — no warning |
| 22 | `2026-07-28` / `[jul:ongoing]` | `false` / `2026-07` / `null` | S3 in-window — current ledger present, not stale |

**`isWindowOpen` + purity/validation**

| #  | Action | Expected |
|----|--------|----------|
| 23 | `resolveCreationState({today:'2026-07-28', leadDays:7, ledgers:[]}).isWindowOpen` | `true` (=== `isWithinCreationWindow('2026-07-28', 7)`) |
| 24 | Reorder `ledgers` in any row above | identical result (order-independent) |
| 25 | `today` = `2026-13-01`, `2026-02-30`, `''` | ❌ `CodecError` (validated via EF3.1) |

---

## 7. Acceptance criteria

- [ ] **AC1** — `src/domain/creation-window.ts` exists in `@nafios/finance`; the full public surface in §2 (`LedgerSummary`, `isWithinCreationWindow`, `OpenableMonths`, `RollForwardSignal`, `CreationState`, `resolveCreationState`) is re-exported from `src/index.ts`; wired into `bun run check` (`typecheck` + `test`).
- [ ] **AC2** — `isWithinCreationWindow` is open ⟺ days-remaining-in-month `< clamp(⌊leadDays⌋, 1, 7)`: for `leadDays 7` the window opens on the 25th (31-day), 24th (30-day), 22nd (28-day Feb), 23rd (leap Feb); the last day is always in-window and day 1 never is (rows 1–7).
- [ ] **AC3** — `leadDays` is clamped to the domain range **1–7** (fractional floored); EF3 passes the fixed `7` and no config layer is read (rows 8–10).
- [ ] **AC4** — `openable.current` is `monthOf(today)` iff no existing ledger occupies it (window-independent); `openable.next` is the next month iff **both** the window is open **and** it is free; **no other month is ever returned** and a taken month (any status) is never offered (rows 11–17).
- [ ] **AC5** — `rollForward.active` is `true` iff the current month has no ledger **and** `ledgers.length > 0`; a zero-ledger fresh user is `false` (S2, not S5); `rollForward.month` is always `monthOf(today)` (rows 18–21).
- [ ] **AC6** — `rollForward.staleOngoingMonth` is the earliest `ongoing` ledger strictly before the current month (or `null`), is `null` after a settled-month gap, and never gates `active` (rows 19–20).
- [ ] **AC7** — The resolver reads **no clock**, validates `today` via EF3.1 (malformed/impossible dates throw `CodecError`), and is independent of `ledgers` ordering (rows 24–25); it performs **no** status transition or envelope generation (that is EF3.7).
- [ ] **AC8** — Every row of the §6 matrix passes as a unit test, including the Dec→Jan year-boundary roll (row 16) and the leap-Feb window (row 7); `bun run check` is green across the workspace.
- [ ] **AC9** — **Boundary stays pure:** `src/domain/creation-window.ts` imports only EF3.1 (`Month`, `monthOf`, `addMonths`, `compareMonths`) and EF3.2's `LedgerStatus` type; no `@supabase/supabase-js`, no `@nafios/db`, no `src/internal/`, no clock/env/`fetch`; the eslint import-boundary rule stays green.

---

## 8. Notes / decisions

1. **Day-level math is owned here; month identity is EF3.1's.** `Month` deliberately has no day component (EF3.1 §4.2), so day-of-month and `daysInMonth` (with the leap rule: divisible by 4, except centuries not divisible by 400) live in this file — it is the single place the domain reasons about days *within* a month. Everything at month granularity (build, shift, compare) goes through EF3.1; this file never hand-rolls `"YYYY-MM"` string math and never re-checks first-of-month.
2. **Clamp lives in the domain, `leadDays` is passed in.** `monthly-ledger.md` attributes the 1–7 clamp to the `LedgerCreationWindow` config setting, but EF3 has **no config layer** (epic: `leadDays` fixed at 7). Rather than push the clamp onto a caller that doesn't exist yet, the resolver clamps defensively — the window can never be wider than a week or narrower than a day regardless of input. When config lands (EF-later) it simply supplies the value; this function's contract is unchanged.
3. **The S2-vs-S5 line: fresh start is not roll-forward.** A brand-new user (zero ledgers) with no current-month ledger is the *first-run* empty state ("open your first ledger" CTA — S2), not the persistent roll-forward warning (S5). Gating `active` on `ledgers.length > 0` draws that line in the domain so the hub doesn't have to. The broader trigger — "current month empty **and** you were tracking" — deliberately covers **both** the stuck-`ongoing` case (§3 point 1) **and** the settled-month gap (§3's "settled everything and later returns to a gap"); `staleOngoingMonth` distinguishes the two for tone without changing whether the banner shows. This reading is slightly broader than §3's enumerated example (which describes only the stuck-`ongoing` case); flagged here as the deliberate interpretation.
4. **Roll-forward is not a ledger metric — it lives here by design.** EF3.2's metrics engine explicitly refused this warning because it is derived from `today` + the *set* of ledgers, not from a single ledger's fields (EF3.2 §8.6, Notes 6). This ticket is its home. The negative-ASM banner (a single-ledger signal) stays in EF3.2; the two banners share a prominence tier but not a source.
5. **Reports permission, never performs the transition.** The previous-`ongoing` → `reconciling` transition and template/envelope generation happen in the create-ledger command (EF3.7) at the moment the next ledger is committed. This resolver only says *which* months may be opened and *whether* to warn — it is side-effect-free (`monthly-ledger.md` §3: "the window only grants permission… the current ledger transitions at the exact moment the next ledger is created").
6. **One combined resolver + one standalone predicate.** `resolveCreationState` bundles window + openable + roll-forward so the hub gets everything in a single pure call; `isWithinCreationWindow` is also exported standalone because the in-window nudge (S3) and EF3.7's next-month gate can ask that one question without assembling a ledger list. The mild overlap (`state.isWindowOpen === isWithinCreationWindow(...)`) is intentional (§4.1 rule 7).
7. **Minimal input shape, like the metrics engine.** `resolveCreationState` accepts `LedgerSummary[]` (just `month` + `status`), which a full `MonthlyLedger[]` satisfies structurally — the repository (EF3.6/EF3.10) passes its ledgers straight in, and tests use one-line fixtures. Same discipline as EF3.2's `computeLedgerMetrics` accepting a minimal ledger shape.

*Provenance (not required reading): the bounded creation window, the "current always / next only in-window / no other month" rule, the roll-forward warning (persistent, non-dismissible, same tier as the negative-ASM banner), the no-auto-creation stance, and the "an `ongoing` ledger may belong to an already-ended month" observation are from `monthly-ledger.md` §3 (Creation window & roll-forward) and §6 (invariants); the `leadDays` 1–7 clamp / default 7 is from `monthly-ledger.md` §3/§6 and the EF3 epic (fixed at 7, no config); the `(user_id, month)` uniqueness constraint is from EF1.1; the `Month`/`monthOf`/`addMonths`/`compareMonths` codec and its first-of-month invariant are from EF3.1; `LedgerStatus` is from EF3.2; the decision to home the roll-forward warning here (not in the metrics engine) is from EF3.2 §8.6 / Notes 6 and the EF3 epic story map (S5).*

---

## 9. Definition of Done (PR-ready)

This ticket is **one PR** that closes EF3.4. It is a leaf domain function depending only on EF3.1 (`Month`) and EF3.2's `LedgerStatus` type. Mergeable when all of the following hold — no follow-up, no stubs, no TODOs:

- [ ] `src/domain/creation-window.ts` and `tests/unit/creation-window.test.ts` are present; the §2 surface is re-exported from `src/index.ts`.
- [ ] **All §7 acceptance criteria (AC1–AC9) pass**, including every window boundary (31/30/28/29-day months), the Dec→Jan year roll, and the roll-forward `active`/`staleOngoingMonth` rows.
- [ ] **`bun run check` is green across the workspace** — `typecheck`, all §6 unit tests, and the eslint domain/data import-boundary rule (AC9). This is the merge gate.
- [ ] No surface beyond §2 — in particular **no status transition** (EF3.7), **no envelope generation** (EF3.7), **no clock read**, no config resolution, and no re-implementation of Month arithmetic or the first-of-month check (all EF3.1's).
- [ ] This ticket's Revision History is updated; the EF3.4 checkbox in `EF3.md` is ticked when merged.

---

## Revision History

| Version | Date       | Author            | Changes |
| ------- | ---------- | ----------------- | ------- |
| 0.1     | 2026-07-03 | NafiOS Foundation | Initial standalone task for the pure creation-window / openable-month resolver + roll-forward signal in `@nafios/finance`'s domain layer: `isWithinCreationWindow` (final-`leadDays`-days predicate, `leadDays` clamped 1–7, fixed 7 in EF3), `resolveCreationState` → `openable` (current always-when-free / next only in-window / never any other month) + `isWindowOpen` + `rollForward` (persistent-warning signal, active ⟺ current-month empty AND user was tracking, with `staleOngoingMonth` context). Owns the day-level window math (leap-year `daysInMonth`); consumes EF3.1's `Month`/`monthOf`/`addMonths`/`compareMonths` and never re-checks first-of-month; reads no clock (`today` caller-supplied, validated via EF3.1 → `CodecError` on malformed input). Homes the roll-forward warning here (deferred from the metrics engine — EF3.2 §8.6). Draws the S2 fresh-start vs S5 roll-forward line in the domain; reports permission only — the prev-`ongoing`→`reconciling` transition and envelope generation stay in EF3.7. Verification matrix (window boundaries incl. year roll + leap Feb, openable months, roll-forward) + AC1–AC9 + §9 Definition of Done (green `bun run check` as the merge gate); PR-able standalone as a leaf domain function on EF3.1 + EF3.2. |
