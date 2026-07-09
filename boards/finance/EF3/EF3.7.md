# EF3.7 — Create-ledger command (manual inputs, prev→reconciling, atomic)

> - `M1`
> - `type:feature`
> - `module:finance`
> - `area:data`
> - `P0`
> - `size:M`
> - **Epic:** EF3 — Get started: open your first ledger & track it with manual envelopes

> **This ticket is self-contained.** Everything needed to build the **create-ledger command** — the single write path that opens a `MonthlyLedger`, enforcing the guardrail (EF3.5) and the creation-window rule (EF3.4) **before** it writes, and performing the previous-`ongoing` → `reconciling` transition + the new-ledger insert as one **all-or-nothing** operation — is in this file. Stack: **Supabase JS SDK** via EF2.2's authed `FinanceClient`, composed over the EF3.6 repository primitives. It lives in `@nafios/finance`'s **data layer** (`src/internal/`) — the only layer where Supabase / `@nafios/db` may appear; it imports the pure domain rules from `src/domain/` and calls the repository. **No ORM / no Drizzle. No schema changes, and — the central design decision of this ticket — no new migration** (see §4.2 / §8.1): the atomic transition is achieved with ordered writes + compensation, backstopped by EF1.1's `uq_one_ongoing_ledger` partial unique index. EF3 owns exactly one migration (the EF3.9 category seed).
>
> **This is the FIRST command in the finance module** — the first `src/internal/` unit that _composes_ domain rules with repository writes rather than being a pure leaf or a thin data primitive. It establishes the **command pattern** (validate-in-domain → orchestrate repository writes → return a result union / throw on DB failure) that EF3.8 (envelope commands) mirrors.
>
> **Depends on:**
>
> - **EF3.6** (ledger repository) — composes `list` (feeds the EF3.4 resolver), `findOngoing` (finds the ledger to park), `updateStatus` (parks it `ongoing → reconciling`), and `insert` (writes the new ledger). Reuses EF3.6's typed `FinanceDataError` (the `23505`-by-constraint split — `duplicate_month` vs `ongoing_exists`) and its integration-test harness (two seeded users, local Supabase).
> - **EF3.5** (MaxCapped guardrail) — calls `validateMaxCapped({ openingBalance, maxCapped, confirmed })` **before committing** and refuses to write on `ok: false`. This is what makes the guardrail hold "regardless of caller" (epic Success Criteria) — the UI restriction (EF3.12) is not the enforcement point; this command is.
> - **EF3.4** (creation-window resolver) — calls `resolveCreationState({ today, leadDays: 7, ledgers })` and rejects the write unless the requested `month` is one of the resolver's openable months (`openable.current` / `openable.next`). Same "enforce server-side regardless of caller" discipline as the guardrail.
> - **EF3.2** (`MonthlyLedger` type + status model) — produces a ledger of the EF3.2 shape (as an EF3.6 `LedgerHeader`); the transition it performs is the `ongoing → reconciling` one EF3.2 models but deliberately does **not** execute (EF3.2 §4.2 rule 5 hands transitions to the command). Type-only for `LedgerStatus` / `isLedgerMutable`; the metrics engine is **not** called here (that is EF3.10 on read).
> - **EF3.1** (Money & Month codecs) — `openingBalance` / `maxCapped` are `Money`, `month` is `Month`; the command never touches a raw `numeric`/`DATE` string (the EF3.6 mapper owns encode/decode) and compares months via `compareMonths`. No float math anywhere.
> - **EF2.2** (connection spine) — the command factory takes a caller-supplied **authed** `FinanceClient`, so every read/write runs as the request user under RLS; inserts never set `user_id` (the DB default `auth.uid()` fills it — EF2.2 AC4).
>
> **Consumed by:**
>
> - **EF3.12** (new-ledger creation flow) — the manual-input form calls `createLedger` on submit and renders the result: a guardrail rejection drives the amber confirmation sheet / hard-cap message (using the returned `guardrail`), a `month_not_openable` result refreshes the picker, and a success navigates to the new `ongoing` ledger (story-map S2 / S3 / S6). It is the **only** UI path that creates a ledger — satisfying the epic invariant "no code path creates a ledger without explicit user action."
>
> **Build-order & PR readiness.** The **first `src/internal/` command**, sitting on top of the whole EF3 create stack. It depends on EF3.6 (repository), EF3.5 + EF3.4 + EF3.2 (domain rules/types), EF3.1 (codecs), and EF2.2 (authed client) — so it is PR-able once those are merged. Like EF3.6 its tests are **integration tests against a local Supabase** (two seeded users); `bun run check` runs them (§9). It adds **no migration** (§4.2) — the create stack is complete with EF1.1's schema + constraints.
>
> **Assumes EF2 is done** (the `@nafios/finance` package shell — `src/domain/` + `src/internal/` layers, the eslint import-boundary rule, the authed/service client factories, green `bun run check`).

---

## 1. What you're building

The **create-ledger command** — the one code path that opens a `MonthlyLedger`. A single factory-returned function that:

1. **`createLedgerCommands(client)`** — a factory returning `LedgerCommands` bound to an authed `FinanceClient` (EF2.2), internally constructing the EF3.6 repository over the same client.
2. **`createLedger(input)`** — the command. It takes the **manual** creation inputs (target `month`, `openingBalance`, `maxCapped`, the user's `confirmed` amber-acknowledgement, and `today`), validates them against the domain rules **before any write**, then performs the previous-`ongoing` → `reconciling` transition and the new-ledger insert as an **all-or-nothing** operation, returning the created `LedgerHeader` or a typed rejection.

Framework-thin TypeScript in `src/internal/`. It contributes **no new business rule** — the guardrail is EF3.5's, the openable-month math is EF3.4's, the data primitives are EF3.6's. Its whole job is **composition + ordering + atomicity**: enforce the pure rules server-side, then sequence the two writes so the "at most one `ongoing`" invariant is never violated and the observable outcome is all-or-nothing.

**Why it exists — the problem it solves:**

Opening a month is the one write in EF3 that touches **two** ledger rows at once. When a user opens the next month (S3) or opens the current month while a previous one is stuck `ongoing` (S5), the old `ongoing` ledger must move to `reconciling` **and** the new ledger must be inserted — and EF1.1's `uq_one_ongoing_ledger` partial unique index forbids two `ongoing` rows from coexisting for a moment. So the writes are **ordered by necessity** (park first, or the insert fails), and they must be **all-or-nothing** (park the old month but fail to open the new one, and the user is left with no working month). The Supabase JS SDK exposes no multi-statement transaction, so getting this right is genuinely the command's design problem — not the repository's (EF3.6 supplies the primitives and takes no position on the transaction; EF3.6 §8.3). At the same time, three pure rules must be enforced **regardless of caller** — the maxCapped guardrail (EF3.5), the openable-month window (EF3.4), and input non-negativity — because the creation form (EF3.12) restricting its inputs is a UX affordance, not a security boundary. This ticket pins all of that in **one** command: the single, server-authoritative, atomic write path that every "open a month" action funnels through, so the invariants hold no matter who calls it and the two-row transition can never leave a half-open month.

> **Cross-ticket decision (from the EF3 epic / EF3.6 §8.3).** The **atomic previous-`ongoing` → `reconciling` transition** is owned **here** (EF3.7), not in the repository. EF3.6 supplies `findOngoing` + `updateStatus` + `insert` and classifies `ongoing_exists` if the ordering is ever violated; **this** command decides the ordering, the compensation, and the "no new migration" mechanism (§4.2). Likewise the guardrail rule (EF3.5) and the openable-month rule (EF3.4) each live once in their domain function and are **consumed** here — this command re-implements neither; it enforces both.

---

## 2. Public API / contract

Exact TS signatures. These names are the contract EF3.12 imports — keep them stable. `createLedgerCommands`, `CreateLedgerInput`, `CreateLedgerResult`, and `CreateLedgerRejectionReason` are the **app-facing write surface** and are **barrel-exported** from `src/index.ts` (parallel to EF3.10's app-facing read surface). The underlying `createLedgerRepository` stays **internal** (EF3.6 §2) — the command is the public write API, the repository is its private primitive.

```ts
import type { Money, Month } from "../../domain/money"; // EF3.1 (Month from ../../domain/month)
import type { LedgerHeader } from "../repositories/ledger-repository"; // EF3.6
import type { MaxCappedGuardrail } from "../../domain/max-capped"; // EF3.5
import type { FinanceClient } from "../client"; // EF2.2

// ───────────────────────── Command input ─────────────────────────

/**
 * The MANUAL inputs a user supplies to open a ledger. There is no config prefill in
 * EF3 (no finance-settings layer) — openingBalance and maxCapped are keyed by the user
 * on the creation form every time, and leadDays is fixed at 7 (not passed in).
 */
export interface CreateLedgerInput {
  /** The month to open. MUST be one of EF3.4's openable months (current, or next in-window);
   *  any other month is rejected 'month_not_openable' (no far-future, no back-fill). */
  readonly month: Month; // EF3.1
  readonly openingBalance: Money; // EF3.1 — manual; must be ≥ 0
  readonly maxCapped: Money; // EF3.1 — manual; must be ≥ 0 and pass the EF3.5 guardrail
  /** The user's explicit amber-zone acknowledgement (EF3.5). Lifts the amber gate only;
   *  never overrides a blocked (> 2× opening) value. */
  readonly confirmed: boolean;
  /** Caller-supplied "YYYY-MM-DD" (the web loader has it — EF3.4 discipline: no clock in
   *  the command's decision path). Validated via EF3.1; a malformed value throws CodecError. */
  readonly today: string;
}

// ───────────────────────── Rejection (deterministic input failure) ─────────────────────────

/** Why createLedger refused BEFORE any write — a deterministic input/context failure the UI
 *  renders, not a DB error. (DB/query failures throw FinanceDataError instead — §4.3.) */
export type CreateLedgerRejectionReason =
  | "month_not_openable" // month ∉ EF3.4 openable set: far-future, back-fill, or already has a ledger
  | "negative_amount" // openingBalance or maxCapped < 0 (EF3.5 does not police sign; DB ck_balances_nonneg backstops)
  | "requires_confirmation" // EF3.5 amber zone, confirmed === false
  | "exceeds_hard_cap"; // EF3.5 blocked zone (> 2× opening) — NO override

// ───────────────────────── Result ─────────────────────────

/**
 * The command's result. A deterministic pre-write rejection is `{ ok: false }` (the caller
 * renders it — same channel as EF3.5's validation result). `guardrail` is present iff the
 * reason is a guardrail one (so the amber sheet has `savingsDraw` / the block message has
 * `hardCap`), null otherwise. On success, `parkedLedgerId` is the id of the ledger moved to
 * `reconciling` (S3/S5), or null when nothing was parked (fresh start — S2).
 */
export type CreateLedgerResult =
  | {
      readonly ok: true;
      readonly ledger: LedgerHeader;
      readonly parkedLedgerId: string | null;
    }
  | {
      readonly ok: false;
      readonly reason: CreateLedgerRejectionReason;
      readonly guardrail: MaxCappedGuardrail | null;
    };

// ───────────────────────── The command ─────────────────────────

export interface LedgerCommands {
  /**
   * Open a MonthlyLedger. Enforces (in this precedence — §4.1) input non-negativity, the
   * EF3.5 maxCapped guardrail, and the EF3.4 openable-month rule; on any failure returns
   * `{ ok: false }` and performs NO write. On success it parks the current `ongoing` ledger
   * (if any) to `reconciling` and inserts the new `ongoing` ledger as one all-or-nothing
   * operation (§4.2), returning the created LedgerHeader.
   *
   * Throws FinanceDataError (EF3.6) for a genuine DB/query failure — including the rare
   * lost race where the month was validated free but got taken before the insert; the parked
   * ledger is compensated (reverted to `ongoing`) before the throw (§4.2 / §4.3). Throws
   * CodecError if `today` is malformed (a programming error, not user input).
   */
  createLedger(input: CreateLedgerInput): Promise<CreateLedgerResult>;
}

/** Construct the ledger command surface bound to an authed FinanceClient (EF2.2). It builds
 *  the EF3.6 repository over the same client; every read/write runs as that user under RLS. */
export function createLedgerCommands(client: FinanceClient): LedgerCommands;
```

---

## 3. Package placement, layer & exports

**Data-layer code** — lands in `@nafios/finance`'s `src/internal/` (the only layer that may import `@supabase/supabase-js` / `@nafios/db` and the repository; it may import `src/domain/`). This is the boundary the EF2 eslint rule enforces.

```
packages/finance/
├── src/
│   ├── index.ts                                  # barrel: + createLedgerCommands, CreateLedgerInput,
│   │                                             #   CreateLedgerResult, CreateLedgerRejectionReason (app-facing write surface)
│   ├── domain/
│   │   ├── creation-window.ts                    # resolveCreationState (EF3.4) — consumed here
│   │   ├── max-capped.ts                         # validateMaxCapped, MaxCappedGuardrail (EF3.5) — consumed here
│   │   └── monthly-ledger.ts                     # LedgerStatus, isLedgerMutable (EF3.2) — type-only seam
│   └── internal/
│       ├── client.ts                             # FinanceClient (EF2.2)
│       ├── errors.ts                             # FinanceDataError (EF3.6) — thrown through on DB failure
│       ├── repositories/ledger-repository.ts     # createLedgerRepository (EF3.6) — composed here (stays internal)
│       └── commands/
│           └── create-ledger.ts                  # createLedgerCommands / createLedger  ← this ticket
└── tests/
    └── integration/
        └── create-ledger.test.ts                 # the §6 matrix (reuses EF3.6's two-user harness)  ← this ticket
```

- **Composes domain + data; adds no rule.** The command imports the pure rules (`validateMaxCapped`, `resolveCreationState`) from `src/domain/` and the primitives (`createLedgerRepository`) from `src/internal/`. It never re-derives the guardrail thresholds, the window math, or the money/month encode/decode (all owned upstream).
- **Authed, RLS-scoped.** Every read (`list`, `findOngoing`) and write (`updateStatus`, `insert`) runs on the caller's authed `FinanceClient`; inserts never set `user_id`. The command adds no `WHERE user_id = …` — it relies on the `owner_all` policy exactly as the repository does.
- **`leadDays` is a fixed `7`.** No config layer in EF3 — the command passes the literal `7` to `resolveCreationState`. (When a config capability lands, it supplies the value; this command's contract is unchanged — same stance as EF3.4/EF3.5.)
- **Barrel exports the write surface only.** `createLedgerCommands` + the input/result/reason types (EF3.12 imports these). The repository, the mapper, and `mapPostgrestError` stay internal (EF3.6 §3); the raw `SupabaseClient` and `@nafios/db` row types are never re-exported.
- Files kebab-case; `typecheck` + `test` keys (from EF2.1) keep this wired into the root `bun run check`.

---

## 4. Behavior & rules

### 4.1 Pre-write validation — all deterministic, all before any mutation

The command runs three checks, **all before touching the database**, and returns `{ ok: false }` on the first that fails (no write happens). Precedence — it only matters when more than one would fail:

1. **Non-negativity (pure).** If `openingBalance < 0` or `maxCapped < 0`, reject `negative_amount`, `guardrail: null`. EF3.5 deliberately does not police the sign (EF3.5 §4.3 rule 2), so the command does — cleaner than letting a negative slip to the DB `ck_balances_nonneg` and surface as a raw `check_violation`. (Sign is tested via EF3.1's `compareMoney` against `ZERO_MONEY` — no raw-number comparison.)
2. **MaxCapped guardrail (pure — EF3.5).** Call `validateMaxCapped({ openingBalance, maxCapped, confirmed })`. On `{ ok: false, reason }` return `{ ok: false, reason, guardrail }` verbatim — the reason is exactly EF3.5's `requires_confirmation` (amber, not confirmed) or `exceeds_hard_cap` (blocked, no override), and the `guardrail` (with `savingsDraw` / `hardCap`) travels so EF3.12 can render the sheet/message. The command does **not** re-derive the zones.
3. **Openable-month (needs one read — EF3.4).** Fetch the caller's ledgers via `repo.list()` (a `LedgerHeader[]`, which structurally satisfies EF3.4's `LedgerSummary[]`), compute `resolveCreationState({ today: input.today, leadDays: 7, ledgers })`, and require `input.month` to equal `openable.current` or `openable.next` (compared via `compareMonths(...) === 0`). Otherwise reject `month_not_openable`, `guardrail: null`. This rejects far-future months, back-fill, and — because a taken month is never offered — any month that already has a ledger.

Checks 1–2 are pure and run first (no I/O); check 3 makes the single `list()` read. Enforcing the guardrail and the window **here**, not just in the form, is the crux: the command is the server-authoritative gate, so the invariants hold "regardless of caller" (epic Success Criteria; same reasoning EF3.5 §1 and EF3.4 §1 give for centralizing the rule).

### 4.2 The atomic previous-`ongoing` → `reconciling` transition (the crux)

Once validation passes, the command opens the month. There are two shapes:

- **No parking needed (S2 — fresh start / clean gap).** `repo.findOngoing()` returns `null` (a brand-new user, or a user who settled everything). The command does a **single** `repo.insert({ month, openingBalance, maxCapped, status: 'ongoing' })` and returns `{ ok: true, ledger, parkedLedgerId: null }`. One write — trivially atomic.
- **Park-then-insert (S3 next month, or S5 opening the current month while a previous one is stuck `ongoing`).** `repo.findOngoing()` returns an `ongoing` ledger (necessarily for a **different, earlier** month — the month being opened was validated free). The command:
  1. `repo.updateStatus(ongoing.id, 'reconciling')` — **park first**;
  2. `repo.insert({ month, …, status: 'ongoing' })` — then insert the new `ongoing`;
  3. returns `{ ok: true, ledger, parkedLedgerId: ongoing.id }`.

**Why park-first is mandatory, not a choice.** EF1.1's `uq_one_ongoing_ledger` partial unique index permits **at most one** `ongoing` ledger per user. Insert the new `ongoing` before parking the old one and the insert fails with `ongoing_exists` (EF3.6's 23505 split). So the old ledger _must_ leave `ongoing` first. That same index is the **hard backstop**: it makes "two `ongoing` ledgers" impossible at the database level regardless of any ordering bug — the invariant is enforced by the schema, not by hope.

**Compensation makes the outcome all-or-nothing.** If step 2's insert throws for any reason (a lost `duplicate_month` race, an unexpected error), the command **compensates**: `repo.updateStatus(ongoing.id, 'ongoing')` to revert the park, then re-throws the original `FinanceDataError`. So the observable end state is either _"new ledger open + old parked"_ (success) or _"nothing changed — old still `ongoing`"_ (compensated failure). The user is never left with a parked previous month and no working month.

**No RPC, no new migration — the central design decision.** The Supabase JS SDK exposes no multi-statement transaction, so strict single-transaction atomicity would require a Postgres RPC — which is a migration. EF3's scope is firm: **one** migration total (the EF3.9 category seed), and EF3.6 already committed EF3.7 to achieving this "without a new migration" (EF3.6 §8.3). So the command uses **ordered writes + compensation, backstopped by the partial unique index** — no RPC, no migration. What "atomic" means here, precisely: (a) the core invariant "at most one `ongoing`" holds **unconditionally** (the DB index guarantees it); (b) under normal operation the outcome is all-or-nothing (compensation reverts a failed insert). The one non-atomic window is a **process crash between the park and the insert**, which leaves the previous month `reconciling` and the target month with no ledger. This is **self-healing on retry**: the target month is still free, so the user re-opens it — `findOngoing()` now returns `null` (the old one is already `reconciling`), the insert succeeds with `parkedLedgerId: null`, and the end state (new month open, previous parked) is exactly the intended one. Even a _failed compensation_ converges to the correct state the same way. If strict single-transaction atomicity is ever required, it becomes a Postgres RPC (an EF-later migration) with **no change to `createLedger`'s contract** (§8.1).

**Mutability is structurally satisfied — no explicit check needed.** EF3.6 §4.3 attributes the mutability check to "EF3.7's job," but the only ledger this command ever transitions is the one `findOngoing()` returns, which is by definition `ongoing` (hence `isLedgerMutable === true`); and it only ever _inserts_ new `ongoing` ledgers. It never touches a `settled` or `reconciling` ledger. So `isLedgerMutable` (EF3.2) is trivially true on every write path — the command needs no explicit gate. The explicit mutability check matters for the **edit** surfaces (EF3.8 envelope CRUD / EF3.14), not for creation (§8.4).

### 4.3 Three failure channels — result vs throw vs codec

Consistent with EF3.6 §8.4's three-channel model, the command keeps input errors, DB failures, and data-integrity faults distinct:

1. **Deterministic input/context failure → `{ ok: false }` result.** `negative_amount`, `requires_confirmation`, `exceeds_hard_cap`, `month_not_openable`. These are _user_ input the UI renders — no exception, no write. Same channel as EF3.5's `validateMaxCapped` result.
2. **DB/query failure → thrown `FinanceDataError` (EF3.6).** A genuine query failure surfaces as EF3.6's typed error. The notable case is the **TOCTOU race**: `input.month` validated free at §4.1 step 3, but a concurrent request created it before this command's insert. The insert throws `FinanceDataError('duplicate_month')`; the command **compensates first** (reverts any park), then re-throws. It is not a result-rejection because it is not a deterministic input error — it's a lost race the UI catches and recovers from by re-fetching state. (`ongoing_exists` should not occur given park-first ordering; if it ever did, it also surfaces as the thrown `FinanceDataError` after compensation — the index caught an ordering bug, exactly as EF3.6 §8.3 intends.)
3. **Malformed value → `CodecError` (EF3.1).** A malformed `today` (`"2026-13-01"`, `""`) throws `CodecError` from EF3.4's validation — a programming error (the app supplies `today`), not user input, so throwing is correct (EF3.4 §4.3 rule 2).

### 4.4 Purity of scope, RLS, and no schema changes

1. **No metrics, no envelopes, no templates.** The command produces a `LedgerHeader`; it never calls `computeLedgerMetrics` (that is EF3.10 on read) and never touches the `envelope` table. **No template/envelope auto-generation** happens on create — every envelope in EF3 is added manually afterward (EF3.8/EF3.14); recurring auto-generation into a new ledger is EF4+. A freshly created ledger has zero envelopes (COL 0 / ASM = Opening — the empty-ledger anchor, EF3.2).
2. **Creates `reconciling`, never operates it.** Parking the previous ledger _produces_ a `reconciling` ledger as a side-effect; the command does not open, work, or settle it (that surface is EF5+; EF3 shows a placeholder — EF3.15). It only needs the previous ledger to leave `ongoing` correctly.
3. **Never inserts a settled ledger.** The command only ever inserts `status: 'ongoing'`; `reconciling` arises only via the park (`updateStatus`), and `settled` is never written here (settlement, which must also set `settled_at` per `ck_settled_at`, is EF5+). This matches EF3.6's `NewLedger.status` restricting to non-settled.
4. **No migration.** The command reads/writes the EF1.1 schema unchanged and adds **no** Postgres function or migration (§4.2). EF3's only schema-adjacent item is the EF3.9 category seed.

---

## 5. Worked example — the four create paths through the command

Using EF3.1 codecs + this ticket's factory, on an authed client for user A. Amounts are the Jan 2027 anchor (opening `7152.35`, maxCapped `6415.00`). `today` values are illustrative.

```ts
const cmd = createLedgerCommands(authedClientForUserA);

// ── S2 · Fresh start — open the current month, no ongoing to park ─────────────
const r1 = await cmd.createLedger({
  month: decodeMonth("2027-01-01"),
  openingBalance: decodeMoney("7152.35"),
  maxCapped: decodeMoney("6415.00"),
  confirmed: false, // green zone — confirmed irrelevant
  today: "2027-01-05",
});
// => { ok: true, ledger: { month: "2027-01", status: "ongoing", ... }, parkedLedgerId: null }
//    single insert; the ledger opens with zero envelopes → COL 0 / ASM = Opening (EF3.2)

// ── S3 · In-window — open the NEXT month; the current ongoing is parked ───────
const r2 = await cmd.createLedger({
  month: decodeMonth("2027-02-01"),
  openingBalance: decodeMoney("7000.00"),
  maxCapped: decodeMoney("6000.00"),
  confirmed: false,
  today: "2027-01-28", // 31 − 28 = 3 < 7 → window open (EF3.4)
});
// => { ok: true, ledger: { month: "2027-02", status: "ongoing", ... }, parkedLedgerId: <Jan id> }
//    park Jan (ongoing → reconciling), then insert Feb (ongoing). All-or-nothing.
(await repo.findOngoing())?.month; // => "2027-02"   (only one ongoing — the new month)

// ── S6 · Amber guardrail, not confirmed → rejected, NO write ──────────────────
const r3 = await cmd.createLedger({
  month: decodeMonth("2027-03-01"),
  openingBalance: decodeMoney("7152.35"),
  maxCapped: decodeMoney("7500.00"), // > opening → amber (EF3.5)
  confirmed: false,
  today: "2027-02-26",
});
// => { ok: false, reason: "requires_confirmation",
//      guardrail: { zone: "amber", savingsDraw: 347.65, hardCap: 14304.70 } }
//    nothing written; EF3.12 shows the amber confirmation sheet, then resubmits with confirmed: true

// ── S6 · Blocked (> 2× opening) — confirmed does NOT override ──────────────────
const r4 = await cmd.createLedger({
  month: decodeMonth("2027-03-01"),
  openingBalance: decodeMoney("7152.35"),
  maxCapped: decodeMoney("20000.00"), // > 2× → blocked (EF3.5)
  confirmed: true, // ignored — the block is absolute
  today: "2027-02-26",
});
// => { ok: false, reason: "exceeds_hard_cap", guardrail: { zone: "blocked", hardCap: 14304.70, ... } }

// ── Not openable — a far-future / back-fill month is refused server-side ───────
const r5 = await cmd.createLedger({
  month: decodeMonth("2027-09-01"), // neither current nor next-in-window
  openingBalance: decodeMoney("7152.35"),
  maxCapped: decodeMoney("6415.00"),
  confirmed: false,
  today: "2027-02-10",
});
// => { ok: false, reason: "month_not_openable", guardrail: null }   (enforced regardless of caller)

// ── Lost race — month validated free, taken before insert → throws after compensation ─
try {
  await cmd.createLedger({
    month: takenConcurrently,
    /* … */ confirmed: false,
    today,
  });
} catch (e) {
  (e as FinanceDataError).code; // => "duplicate_month"
  // any parked ledger was reverted to `ongoing` BEFORE this throw — state unchanged
}
```

---

## 6. Verification matrix (integration tests)

Encode as **SDK-driven integration tests** in `tests/integration/create-ledger.test.ts`, run against a local Supabase (`supabase db reset`) with **two seeded users A and B** — **reusing EF3.6's harness** (authed clients for A/B; the service-role client only to seed/force rows; per-test cleanup or fresh reset so the matrix is idempotent). Money/Month assertions compare via `encodeMoney` / `encodeMonth`. "No write" rows assert the DB is unchanged (no new row, no status flip).

**Happy paths — open a month**

| #   | Setup / Action                                                                                | Expected                                                                                                        |
| --- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | No ledgers; `createLedger(2027-01, 7152.35/6415.00, confirmed:false, today 2027-01-05)`       | `{ ok:true, parkedLedgerId:null }`; one `ongoing` ledger for `2027-01`; `settledAt` null; zero envelopes        |
| 2   | Ongoing `2027-01`; open next `2027-02` in-window (`today 2027-01-28`)                         | `{ ok:true, parkedLedgerId:<Jan id> }`; `2027-01` now `reconciling`; `findOngoing()` → `2027-02` (the only one) |
| 3   | Ongoing `2026-12` (stuck, previous month); open current `2027-01` (`today 2027-01-03`, S5)    | `{ ok:true, parkedLedgerId:<Dec id> }`; `2026-12` → `reconciling`; `2027-01` `ongoing`                          |
| 4   | After row 2, re-read the created `2027-02` and re-encode `openingBalance`/`maxCapped`/`month` | `"7000.00"` / `"6000.00"` / `"2027-02-01"` — exact round-trip via the EF3.6 mapper                              |

**Pre-write rejections — result union, no write**

| #   | Setup / Action                                                                     | Expected                                                                                               |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 5   | Open current month, `openingBalance -1.00`                                         | `{ ok:false, reason:'negative_amount', guardrail:null }`; **no ledger created**                        |
| 6   | Open current month, amber `maxCapped 7500.00 > opening 7152.35`, `confirmed:false` | `{ ok:false, reason:'requires_confirmation', guardrail.zone:'amber', savingsDraw '347.65' }`; no write |
| 7   | Same as row 6 but `confirmed:true`                                                 | `{ ok:true }`; ledger created with `maxCapped 7500.00`                                                 |
| 8   | Open current month, blocked `maxCapped 20000.00 > 2×`, `confirmed:true`            | `{ ok:false, reason:'exceeds_hard_cap', guardrail.zone:'blocked' }`; **no write** (no override)        |
| 9   | Open `2027-09` (far-future, not in openable set), `today 2027-02-10`               | `{ ok:false, reason:'month_not_openable', guardrail:null }`; no write                                  |
| 10  | Open a past/back-fill month with no ledger (e.g. `2026-11`), `today 2027-02-10`    | `{ ok:false, reason:'month_not_openable' }`; no write                                                  |
| 11  | Open the current month when it already has a ledger (any status)                   | `{ ok:false, reason:'month_not_openable' }` (taken month never offered by EF3.4); no write             |
| 12  | Open next month **outside** the window (`today 2027-01-10`, window shut)           | `{ ok:false, reason:'month_not_openable' }` (`openable.next` is null outside the window)               |

**Atomicity — park/insert & compensation**

| #   | Setup / Action                                                                                                     | Expected                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| 13  | Ongoing `2027-01`; **service client pre-creates** a `2027-02` ledger; then A opens `2027-02` in-window (lost race) | throws `FinanceDataError('duplicate_month')`; **and** `2027-01` is still `ongoing` (park was compensated/reverted) |
| 14  | Row 2 success, then assert the invariant                                                                           | exactly one `ongoing` ledger for A at all times; `uq_one_ongoing_ledger` never violated                            |
| 15  | Successful park-then-insert (row 2)                                                                                | the parked ledger keeps its `openingBalance`/`maxCapped`/`month`; only `status` changed to `reconciling`           |

**RLS / caller isolation**

| #   | Setup / Action                                                       | Expected                                                                              |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 16  | User B has an `ongoing` ledger; user A opens a month via the command | A's insert never sets `user_id` (DB default = A); B's ledger untouched (RLS-scoped)   |
| 17  | Malformed `today` (`'2027-13-01'` / `''`)                            | throws `CodecError` (EF3.4 validation) — not a result rejection, not FinanceDataError |

---

## 7. Acceptance criteria

- [ ] **AC1** — `src/internal/commands/create-ledger.ts` exists in `@nafios/finance`; `createLedgerCommands`, `CreateLedgerInput`, `CreateLedgerResult`, and `CreateLedgerRejectionReason` are re-exported from `src/index.ts` (the app-facing write surface); the EF3.6 repository stays internal; wired into `bun run check` (`typecheck` + `test`).
- [ ] **AC2** — All three pre-write checks are enforced **in the command, before any write**, and each failure returns `{ ok: false }` with **no DB mutation**: `negative_amount` (opening/maxCapped < 0), the EF3.5 guardrail (`requires_confirmation` / `exceeds_hard_cap`, carrying `guardrail`), and `month_not_openable` (EF3.4 openable set) (rows 5–12).
- [ ] **AC3** — The guardrail and window rules are **not re-implemented**: the command calls `validateMaxCapped` (EF3.5) and `resolveCreationState` (EF3.4, `leadDays` fixed `7`) and returns their verdicts; blocked + `confirmed:true` still rejects `exceeds_hard_cap` (no override — row 8).
- [ ] **AC4** — Opening a month with **no** `ongoing` ledger is a single insert returning `parkedLedgerId:null` (row 1); opening while an `ongoing` ledger exists **parks it first** (`ongoing → reconciling`) then inserts the new `ongoing`, returning `parkedLedgerId:<parked id>` (rows 2–3); the new ledger opens with zero envelopes.
- [ ] **AC5** — The transition is **all-or-nothing under normal operation**: if the insert fails, the parked ledger is **compensated** (reverted to `ongoing`) before the error is re-thrown, so a lost `duplicate_month` race leaves the previous ledger `ongoing` (row 13). The "at most one `ongoing`" invariant holds throughout (rows 14–15).
- [ ] **AC6** — Failure channels are correct (EF3.6 §8.4): deterministic input/context failures return `{ ok:false }` (rows 5–12); genuine DB failures (incl. the lost race) throw `FinanceDataError` after compensation (row 13); a malformed `today` throws `CodecError` (row 17).
- [ ] **AC7** — **No migration, no RPC** is added; the atomic transition uses ordered writes + compensation backstopped by `uq_one_ongoing_ledger`; the command inserts only `status:'ongoing'`, never a `settled` ledger, and calls **no** `computeLedgerMetrics` and touches **no** `envelope` table (§4.4).
- [ ] **AC8** — Every row of the §6 matrix passes as an integration test against a local Supabase with two seeded users, reusing EF3.6's harness; the harness is idempotent across runs; `bun run check` is green across the workspace.
- [ ] **AC9** — **Boundary stays clean:** the command imports EF3.4/EF3.5 domain functions, EF3.2 types, EF3.6's repository + `FinanceDataError`, and EF2.2's `FinanceClient` only; `@supabase/supabase-js` / `@nafios/db` appear **only** in `src/internal/`; no `src/domain/` file imports this command; the eslint import-boundary rule stays green; **no migration** is added.

---

## 8. Notes / decisions

1. **The atomicity mechanism — ordered writes + compensation, no migration (the central call).** The SDK has no multi-statement transaction, so true single-transaction atomicity needs a Postgres RPC — a migration. EF3's scope caps migrations at one (the EF3.9 seed) and EF3.6 §8.3 already bound EF3.7 to "without a new migration." So the command parks-then-inserts with compensation, and leans on EF1.1's `uq_one_ongoing_ledger` partial unique index as the **hard** invariant guard. This is a deliberate trade: the "at most one `ongoing`" invariant is DB-guaranteed unconditionally; the "all-or-nothing" property holds under normal operation via compensation; the sole gap — a process crash between the two writes — is **self-healing on retry** (the target month stays free; re-opening it finds `findOngoing()` null and inserts cleanly, converging to the intended end state — new month open, previous parked). Even a failed compensation converges the same way. If a future requirement demands strict single-transaction atomicity, promote the transition to a Postgres RPC (an EF-later migration) — `createLedger`'s signature and result contract are unchanged, so no consumer (EF3.12) is affected.
2. **Park-first is forced by the schema, not chosen.** `uq_one_ongoing_ledger` forbids two `ongoing` rows, so the new `ongoing` insert _cannot_ land while the old ledger is still `ongoing` — the park must precede the insert. This is why the repository (EF3.6) can't own the transition (it has no policy on ordering) and why the ordering lives here. The same index turns any ordering bug into a caught `ongoing_exists` rather than a silent double-open (EF3.6 §8.3).
3. **Enforce the guardrail AND the window server-side — the form is not the boundary.** EF3.12 restricts the picker to openable months and drives the amber sheet live, but that is UX. The command re-runs `validateMaxCapped` and `resolveCreationState` so the rules hold "regardless of caller" — a scripted/replayed request with a far-future month or an unconfirmed amber value is refused here. This mirrors EF3.5 §1 ("holds regardless of caller") and EF3.4 §1 ("every surface agrees by construction") — the domain rule is the single source; both the form and the command consume it, and the command is authoritative.
4. **Mutability is a no-op for creation — the EF3.6 forward-reference resolved.** EF3.6 §4.3 says the mutability check is "EF3.7's job," but the create command only ever transitions the `ongoing` ledger `findOngoing()` returns (always mutable) and only inserts new `ongoing` ledgers — it never writes a `settled`/`reconciling` row. So `isLedgerMutable` (EF3.2) is structurally true on every path; no explicit gate is needed here. The gate has teeth on the **edit** surfaces (EF3.8 envelope CRUD gates on `isLedgerMutable` of the parent ledger; EF3.14 UI), not on creation.
5. **Non-negativity lives in the command, by design.** EF3.5 explicitly does not police the sign of `maxCapped`/`opening` (it stays well-defined for any `Money` pair — EF3.5 §4.3 rule 2), leaving it to "the DB CHECKs and the create command." The command takes the create-side half: a clean `negative_amount` rejection before any write, so the DB `ck_balances_nonneg` is only ever a backstop, never the user-facing error. Compared against `ZERO_MONEY` via EF3.1's `compareMoney` — no raw-number math.
6. **`today` is passed in, not read from a clock — even in the data layer.** The command could read `new Date()` (it's I/O-layer code), but taking `today` from the caller keeps the decision path deterministic and testable and matches EF3.4's discipline (the web loader already has `today` for the picker). A malformed `today` is a programming error → `CodecError`, distinct from a user rejection (§4.3).
7. **This is the command pattern EF3.8 mirrors.** Validate against the pure domain rules → orchestrate repository writes → return a `{ ok }` result for user-input rejections, throw `FinanceDataError` for DB failures. EF3.8 (envelope create/edit/delete + set-status) reuses this shape (and gates on `isLedgerMutable`); it does not re-derive the channels. Getting the composition + atomicity right here is why this ticket is `size:M` while the pure-domain leaves (EF3.4/EF3.5) are `size:S`.
8. **No auto-generation on create.** Opening a ledger creates an **empty** month — no template envelopes, no adhoc-library pulls, no carry-over routing. Recurring auto-generation into a new ledger is EF4+; in EF3 every envelope is added manually afterward (EF3.8/EF3.14). The freshly created ledger is the empty-ledger metrics anchor (COL 0 / ASM = Opening — EF3.2), which EF3.10 computes on read.

_Provenance (not required reading): the "atomic previous-`ongoing` → `reconciling`" requirement and "no code path creates a ledger without explicit user action" are from the EF3 epic (Scope item 7, Success Criteria); the transition-ownership + "ordered writes with compensation or a DB RPC, without a new migration" is from EF3.6 §8.3 and §2 (`findOngoing`/`updateStatus`/`insert` supplied for exactly this) and the `23505`-by-constraint split (`duplicate_month`/`ongoing_exists`); the guardrail gate `validateMaxCapped` (amber confirm / 2× block, no override) and "enforced regardless of caller" are from EF3.5 (§2, §1); the openable-month rule (`resolveCreationState`, current-when-free / next-only-in-window / never any other month, `leadDays` fixed 7) is from EF3.4 (§2, §4.1); `LedgerStatus`/`isLedgerMutable`/"models status, does not transition it"/empty-ledger anchor are from EF3.2 (§2, §4.2 rule 5); the `Money`/`Month` codecs and no-float discipline are from EF3.1; the `uq_one_ongoing_ledger` / `uq_ledger_user_month` / `ck_balances_nonneg` constraints, the `owner_all` RLS policy, and the `user_id` default `auth.uid()` insert path are from EF1.1 and EF2.2; the Jan 2027 anchor is from the EF3 epic and `monthly-ledger.md` §5._

---

## 9. Definition of Done (PR-ready)

This ticket is **one PR** that closes EF3.7. It is the first `src/internal/` command, depending on EF3.6 (repository), EF3.4 + EF3.5 + EF3.2 (domain), EF3.1 (codecs), and EF2.2 (client). Mergeable when all of the following hold — no follow-up, no stubs, no TODOs:

- [ ] `src/internal/commands/create-ledger.ts` and `tests/integration/create-ledger.test.ts` are present; the §2 barrel surface (`createLedgerCommands`, `CreateLedgerInput`, `CreateLedgerResult`, `CreateLedgerRejectionReason`) is re-exported from `src/index.ts`; the EF3.6 repository stays internal.
- [ ] **All §7 acceptance criteria (AC1–AC9) pass**, including the three pre-write rejections with no write, the park-then-insert with compensation on a lost race, the "at most one `ongoing`" invariant, and the guardrail no-override case.
- [ ] **`bun run check` is green across the workspace** — `typecheck`, all §6 integration tests against a local Supabase with two seeded users (reusing EF3.6's harness), and the eslint domain/data import-boundary rule (AC9). This is the merge gate.
- [ ] No surface beyond §2 — in particular **no** `computeLedgerMetrics` call, **no** envelope/template access or auto-generation, **no** settled-ledger insert, **no** guardrail/window rule re-implementation, and **no migration / no RPC**. Those are EF3.10 / EF3.8 / EF4+ / EF3.5 / EF3.4 / EF1.
- [ ] The command never touches a raw money/date string (encode/decode is EF3.6's mapper); it enforces the guardrail and window server-side and funnels DB errors through EF3.6's `FinanceDataError`.
- [ ] This ticket's Revision History is updated; the EF3.7 checkbox in `EF3.md` is ticked when merged.

---

## Revision History

| Version | Date       | Author            | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------- | ---------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.2     | 2026-07-08 | Hanafi Yakub      | **Implemented.** `src/internal/commands/create-ledger.ts` (`createLedgerCommands(client)` → `createLedger(input)`): pre-write checks in the §4.1 precedence — non-negativity (via `compareMoney` vs `ZERO_MONEY`), the EF3.5 `validateMaxCapped` guardrail (returned verbatim, `guardrail` travels), then the EF3.4 `resolveCreationState` openable-month rule (`leadDays` fixed 7) after the single `repo.list()` read — each rejection returning `{ ok:false }` with no write; the atomic open via `findOngoing` → park-first (`updateStatus` → `reconciling`) → `insert`, with **compensation** (revert the park to `ongoing`, swallow a failed revert, re-throw the ORIGINAL error) on insert failure. Composes the EF3.6 repository (`ledger.repo.ts`) over the same authed client; adds NO rule, NO RPC, NO migration. Barrel re-exports `createLedgerCommands` + `CreateLedgerInput` / `CreateLedgerResult` / `CreateLedgerRejectionReason` (+ `LedgerCommands`); the repository stays internal. **Deviation from §9 (deliberate, same as EF3.6):** the §6 live matrix lives at repo-root `tests/integration/create-ledger.test.ts` in the **non-gating** `bun run test:integration` lane (`skipIf` no DB) — NOT in `bun run check` (no live Supabase in CI; per [ADR-0020](../../../adr/0020-test-coverage-scoping-and-gate.md) loading live cross-package clients into the finance coverage run would trip the per-file 90% gate). Unlike EF3.6 it needs **no** import-boundary exception — it drives the PUBLIC, barrel-exported command (row 13's lost-race is driven deterministically via a client Proxy that injects the concurrent conflicting row between the openable read and the insert). The per-file gate is met by the mocked unit test `tests/unit/create-ledger.test.ts` (create-ledger.ts 100% lines/funcs). `typecheck` + `test:coverage` + `lint` + `format` + `verify` all green; the live matrix awaits an operator `supabase db reset` + `bun run test:integration`. **NB (epic v0.3):** the §4.2/§8 "EF3's only migration is the EF3.9 seed" wording is superseded — EF3 adds NO migration; the no-RPC atomicity conclusion is unaffected. |
| 0.1     | 2026-07-03 | NafiOS Foundation | Initial standalone task for the **create-ledger command** in `@nafios/finance`'s data layer (`src/internal/commands/`) — the FIRST finance command and the single write path that opens a `MonthlyLedger`. `createLedgerCommands(client)` → `createLedger(input)`: enforces (before any write) input non-negativity, the EF3.5 maxCapped guardrail (`validateMaxCapped` — amber confirm / 2× block, no override), and the EF3.4 openable-month rule (`resolveCreationState`, `leadDays` fixed 7) — all "regardless of caller"; returns a `{ ok }` result for deterministic input rejections and throws EF3.6's `FinanceDataError` for DB failures / `CodecError` for a malformed `today`. Performs the **atomic previous-`ongoing` → `reconciling` transition** via ordered writes (park-then-insert) + compensation, backstopped by EF1.1's `uq_one_ongoing_ledger` — **no RPC, no new migration** (the central design decision; EF3's only migration is the EF3.9 seed). Resolves EF3.6 §8.3's deferred atomicity + the mutability forward-reference (no-op for creation). Scopes OUT metrics (EF3.10), envelopes/templates/auto-generation (EF3.8/EF4+), settled inserts (EF5+), and any migration. Verification matrix (happy paths, pre-write rejections with no write, park/insert + compensation on a lost race, RLS isolation) + AC1–AC9 + §9 Definition of Done (green `bun run check` incl. local-Supabase integration tests as the merge gate); PR-able on EF3.6 + EF3.4 + EF3.5 + EF3.2 + EF3.1 + EF2.2. |

</content>
</invoke>
