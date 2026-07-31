# EF3.13 — [BE] Finance Home ledger-state read surface (active-ledger + Lead-Day)

**Type** Feature (enabler)
**Epic:** EF3 — Monthly ledger

> **Board numbering note:** board FE/BE tickets (≥ EF3.10) are their own sequence and do **not** map 1:1 to the EF3 epic's canonical 15-ticket plan — read the board **title**, not the number. This ticket is the read surface split out of **EF3.10** ([FE] Fresh dashboard state), and overlaps the epic-canonical "Ledger read/query surface" deliverable.

### Summary

Expose a **Finance-Home-facing read surface** on `@nafios/finance` so the Home (EF3.10) can resolve, for the logged-in user, **(a)** whether they have an active (`ongoing`) ledger and **(b)** whether `today` falls within the Lead-Day window — the two inputs EF3.10 currently takes from an injected/mocked seam. This replaces that seam with a real, RLS-scoped read.

### User Story

> **As the** Finance Home (and later the ongoing-ledger view),
> **I want** a single public read that returns the user's ledger state (active-ledger flag + Lead-Day / openable-month info),
> **so that** the UI can decide between the empty/fresh state and the Ledger Detail Card from real data instead of an injected stub.

### Description / Context

The primitives already exist inside `@nafios/finance`; this ticket **composes and exposes** them — it does **not** re-architect the package or add a migration.

- **Data primitive (already built, EF3.6):** `createLedgerRepository(client)` — internal — provides `findOngoing()` (the "one ongoing" query, backed by the `uq_one_ongoing_ledger` partial unique index) and `list()` (all the user's ledgers, chronological, already shaped as `LedgerSummary[]` = `month + status`).
- **Pure resolver (already built, EF3.4):** `resolveCreationState({ today, leadDays, ledgers })` and `isWithinCreationWindow(today, leadDays)` in `src/domain/creation-window.ts` derive `isWindowOpen` (the Lead-Day boolean) and the openable current/next months — no clock, pure.
- **Persisted shape (already exported):** `LedgerHeader` is on the barrel; the repo/mapper stay internal (per package layering).

**What to build:** a public barrel export — a home-state read (e.g. `createLedgerQueries(client)` / a `getFinanceHomeState(client, today)` helper) that runs on the **authed browser client** (`createBrowserClient()`, RLS applies), calls `list()` (or `findOngoing()`), feeds the ledgers into `resolveCreationState`, and returns a small, UI-ready shape:

```
{
  hasActiveLedger: boolean;      // ∃ ledger with status === 'ongoing'
  isWithinLeadDay: boolean;      // === resolveCreationState(...).isWindowOpen
  openable: { current, next };   // months for the CTA labels (from the resolver)
}
```

`active` is defined as `status === 'ongoing'` only (`monthly-ledger.md` §3 — the single active working surface); `reconciling` / `settled` do not count. `leadDays` is fixed at **7** (no finance-settings layer in EF3). The **roll-forward-gap** signal (`rollForward.active`) is available from the resolver but is **not** consumed here — that banner is a separate ticket.

### Acceptance Criteria

```gherkin
SCENARIO 1: (no ledgers)
    Given the authenticated user has no ledgers
    When the Home read surface is called with a `today`
    Then hasActiveLedger is false
    And isWithinLeadDay reflects isWithinCreationWindow(today, 7)
    And openable.current is the current month, openable.next follows the Lead-Day rule

SCENARIO 2: (has an ongoing ledger)
    Given the user has a ledger with status 'ongoing'
    When the Home read surface is called
    Then hasActiveLedger is true

SCENARIO 3: (only non-ongoing ledgers)
    Given the user has ledgers but none with status 'ongoing' (e.g. reconciling / settled)
    When the Home read surface is called
    Then hasActiveLedger is false

SCENARIO 4: (RLS isolation)
    Given ledgers owned by a different user
    When the read runs as the current user (authed client)
    Then those ledgers are never returned (owner_all RLS scoping)
```

## Technical Notes

- **Layering:** the read surface is a **barrel export**; `createLedgerRepository` and the mapper **stay internal** (imported within the package, never re-exported) — same discipline as the EF3.7 command. Domain (`src/domain/`) stays pure; the read composes it in `src/internal/`.
- **Client:** runs as the user on the authed `FinanceClient` (`createBrowserClient()`); inserts/reads rely on `owner_all` RLS + `auth.uid()`. Never the service client on a request path.
- **`today` is caller-supplied** ("YYYY-MM-DD") and passed through to the pure resolver — the read surface itself reads no clock (keeps it testable and consistent with `creation-window.ts`).
- **No migration, no new table** — EF1 already ships `monthly_ledger` + owner RLS; EF3.6 ships the repo.
- Errors surface as `FinanceDataError` (already thrown by the repo) — the UI branches on `code` as elsewhere.

### Out of scope

- **The composed ongoing-ledger read WITH envelopes + computed metrics** (COL / Health Margin / ASM) — that fuller read powers the populated Ledger Detail Card / ongoing-ledger view, a separate ticket. This ticket returns only the Home **decision** state.
- **The FE branch / UI** — owned by EF3.10 (this ticket only replaces its injected seam).
- **Roll-forward warning banner** — the signal exists on the resolver but is not surfaced here.
- **Finance-settings / configurable `leadDays`** — fixed at 7 in EF3.

### Dependencies

- Blocked by: **EF3.6** (ledger repository — `findOngoing` / `list`) and **EF3.4** (creation-window resolver) — both already landed in `@nafios/finance`.
- Blocks / Relates to: **EF3.10** ([FE] Fresh dashboard state) — EF3.10 swaps its injected `hasActiveLedger` + `isWithinLeadDay` seam for this read once available.

### Definition of Done

_Functional_

- [ ] A public read is exported from the `@nafios/finance` barrel that, on the authed client, returns `{ hasActiveLedger, isWithinLeadDay, openable }` for the current user given a `today`.
- [ ] `hasActiveLedger` is true iff a `status === 'ongoing'` ledger exists (reconciling / settled do not count).
- [ ] `isWithinLeadDay` and `openable` are derived via the existing `resolveCreationState` / `isWithinCreationWindow` (pure), `leadDays = 7`.
- [ ] The internal repository + mapper remain unexported (package layering held; `bun run check` import-boundary rule green).

_Quality_

- [ ] Unit tests (mocked client) cover: no ledgers, an ongoing ledger, only non-ongoing ledgers, and the Lead-Day boundary (inside vs outside the window).
- [ ] Integration test (live-DB lane, `test:integration`, `skipIf` no Supabase env) covers RLS isolation and the read against a real `monthly_ledger` row — consistent with the EF3.6 matrix placement.
- [ ] Per-file coverage gate met for any new file (≥ 90%).
- [ ] BFF/read-surface contract documented on the `@nafios/finance` barrel (the returned shape is the contract EF3.10 consumes).
- [ ] `bun run check` is green across the workspace.
- [ ] Code merged; reviewed and approved by reporter.
