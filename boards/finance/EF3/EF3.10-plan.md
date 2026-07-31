# EF3.10 — Implementation Plan

> Companion to [EF3.10.md](EF3.10.md). Scope: **FE-only finance home** — the
> left-column **display decision** (empty/fresh state vs. placeholder Ledger
> Detail Card) driven by an **injected/mocked ledger-state seam**, plus the
> date-driven ledger-creation CTAs. Still **no data integration and no BFF call**
> in this story — the real read that backs the seam is split out to **EF3.13**.
> CTAs are eventless (per the ticket's Out of Scope + Definition of Done).

## Readiness: ✅ ready, unblocked

Everything this story needs is already in place:

- **Two-column shell exists** — [`finance/index.tsx`](../../../apps/web/src/routes/_protected/_app/finance/index.tsx)
  renders the left content column + right `TEMPLATES` panel from the earlier
  skeleton commit. We slot into the **left** column.
- **Scenario logic already shipped (pure domain)** —
  [`resolveCreationState`](../../../packages/finance/src/domain/creation-window.ts) /
  `isWithinCreationWindow` in `@nafios/finance` do the Lead-Day math from
  `today` alone (default `leadDays = 7`, no clock — `today` is injected).
- **The seam is a pure prop** — the branch consumes `{ hasActiveLedger,
  isWithinLeadDay, currentMonth, nextMonth }`. `hasActiveLedger` is the only
  field that would need real data; in this story it is **injected/mocked**
  (default `false`). No fetch, no exported read surface needed.
- **UI kit has most primitives** — `Button` (variants + `iconLeft`/`iconRight`),
  `Card`, `Badge` (`secondary` → "Recommended"), lucide icons.
  **Gap:** no `Collapsible`/`Accordion` — added here (see Decisions).
- **Web test harness is real** — [`apps/web/tests/unit/`](../../../apps/web/tests/unit/)
  runs happy-dom + `@testing-library/react` (run with `cwd=apps/web`).

## Scope boundaries (read before coding)

**In scope**

- **Left-column display decision** — branch on the injected seam:
  `hasActiveLedger === true` → placeholder **Ledger Detail Card**;
  `hasActiveLedger === false` → the empty/fresh state. `active` ≡ a
  `status === 'ongoing'` ledger.
- The empty state's **date-driven CTA switch**: Scenario 1 (one CTA) vs
  Scenario 2 (two CTAs), from `isWithinLeadDay`.
- Presentational placeholders: **Ledger Detail Card** (shell only), Pending
  Reconciliation section, `View Settled Ledgers`, and the existing `TEMPLATES`
  panel.

**Out of scope (do NOT build here)**

- **The real read that backs the seam** — fetching the user's ledgers to resolve
  `hasActiveLedger` + Lead-Day. That is a real `@nafios/finance` read surface and
  is now its **own board ticket, [EF3.13](EF3.13.md)**. The domain function
  already takes `ledgers` as input — that is the seam; here `hasActiveLedger` is
  a **mocked flag** and the empty-state derivation passes `ledgers: []`.
- **Ledger Detail Card content** — render the placeholder shell only (no data,
  no metrics, no handlers). The populated card is a later ticket.
- **Roll-forward-gap state** (had ledgers, current month empty) — the persistent
  hub warning is a separate ticket, not this branch.
- CTA click handlers / navigation. All three CTAs are **eventless** but rendered
  enabled per design.

> **Naming trap:** `@nafios/finance` barrel comments mention _"EF3.10's read
> surface"_ — that is the **epic sub-issue** numbering, a different work item.
> On this board that read surface is **[EF3.13](EF3.13.md)** (the BE split from
> this ticket). Board FE/BE tickets (≥EF3.10) don't line up with epic
> sub-issues; go by the board title.

## Decisions

1. **Month-label formatter (`"2026-07"` → `"July 2026"`)** — **local helper in
   the web finance feature** (not the `@nafios/finance` domain). Smaller blast
   radius, no cross-package spec change.
2. **Pending Reconciliation collapsible** — **add a real `Collapsible` primitive
   to `@nafios/ui`** (spec-first + Storybook story + test) and consume it, rather
   than a one-off presentational header.
3. **The ledger-state seam** — the finance home consumes a single
   `LedgerHomeState` value: `{ hasActiveLedger, isWithinLeadDay, currentMonth,
   nextMonth }`. In this story it is **assembled locally**: `hasActiveLedger` is a
   **mocked flag** (default `false`; toggled in tests/preview to exercise the
   detail-card branch), and `isWithinLeadDay` + the months come from the pure
   `resolveCreationState({ today, leadDays: 7, ledgers: [] })`. **EF3.13 replaces
   the whole value** with its read surface's return — the field names are the
   contract between the two tickets, so keep them identical.
4. **The branch swaps the hero region only** — `hasActiveLedger` toggles the
   top/hero of the left column (empty-state hero ↔ detail-card placeholder). No
   design image exists for the active-ledger branch, so the detail card is just an
   **empty `Card` shell** standing in for the future ledger-card presentation.
   **The Pending Reconciliation accordion placeholder + `View Settled Ledgers`
   render below the hero in BOTH branches** (Scenario 4: "any user onboarded, or
   financial data status") — the accordion space is deliberately reserved even in
   the active-ledger branch because a future task fills it. Do not drop it when the
   detail card shows.

## Scenario mapping (from the AC + Figma)

**Display decision first:**

```
seam.hasActiveLedger?
  true  → <LedgerDetailCard/>     (placeholder shell — no data, no handlers)
  false → <LedgerStartCard/>      (empty/fresh hero, below)
```

For the empty state, compute once:
`state = resolveCreationState({ today, leadDays: 7, ledgers: [] })`
→ `inWindow = state.isWindowOpen`, `currentMonth`, `nextMonth = addMonths(currentMonth, 1)`.
Month/year labels are **computed, never hard-coded**.

**Scenario 1 — `inWindow === false`** (`today` outside the Lead-Day window) —
matches `images/EF3.10-image2.png`:

- Heading: `Start your first month`
- Body: `Each month lives in its own ledger. Open one for <currentMonth> to start tracking envelopes and cashflow`
- One primary CTA: `Open <currentMonth> <year> ledger` (ExternalLink icon)
- Caption (help icon): `<nextMonth> will become available in the recon period`

**Scenario 2 — `inWindow === true`** (`today` inside the Lead-Day window) —
matches `images/EF3.10-image1.png`:

- Heading: `Start your first month`
- Body: `<currentMonth> is nearly over, so we'd start you on <nextMonth> — but you can still open <currentMonth> if you want to track what's left.`
- Primary CTA: `Open <nextMonth> <year> ledger` + `Recommended` badge (ExternalLink icon)
- Secondary CTA: `Open <currentMonth> <year> Instead`
- Caption (help icon): `You're in the recon-period, ready for next coming month`

> Figma body copy reads "envelops" (typo); we render "envelopes".

## Work breakdown

### A. `@nafios/ui` — new `Collapsible` primitive (spec-first)

1. Add the spec entry in [`packages/ui/spec.md`](../../../packages/ui/spec.md)
   **before** implementing (Hard Rule: public API needs a spec first).
2. Add `collapsible.tsx` — try `bunx shadcn@latest add collapsible` first (kit
   convention); fallback to manual Radix copy. Add `@radix-ui/react-collapsible`
   dep if missing.
3. Add `collapsible.stories.tsx` + a unit test in `packages/ui/tests/unit/`
   (per-file 90% coverage gate).

### B. `apps/web` finance feature — new slice `apps/web/src/features/finance/`

4. `lib/derive-ledger-home-state.ts` — assembles the `LedgerHomeState` seam
   (Decision 3): `hasActiveLedger` injectable (mock, default `false`);
   `isWithinLeadDay` + `currentMonth`/`nextMonth` from `resolveCreationState`
   (`leadDays: 7`, `ledgers: []`, `today` injectable → defaults to local client
   date).
5. `lib/format-month.ts` — local `formatMonthLong(month)` → `"July 2026"`
   (Decision 1).
6. `components/ledger-start-card.tsx` — the empty-state hero; renders Scenario 1
   vs Scenario 2 from the seam; computed labels; eventless CTAs.
7. `components/ledger-detail-card.tsx` — **NEW** empty `Card` placeholder shown
   when `hasActiveLedger === true`; no content, no props wired, no handlers — a
   bare shell reserving the ledger-card presentation for EF3.13 / the
   ongoing-ledger view to fill later without moving the branch.
8. `components/pending-reconciliation-section.tsx` — uses the new kit
   `Collapsible`; `0 PENDING RECONCILIATION` header + `All caught up` empty
   state. Placeholder, no data.
9. `components/view-settled-ledgers-button.tsx` — full-width outline, chevron-right,
   no handler.
10. `components/finance-home.tsx` — the left column: branch the hero on
    `seam.hasActiveLedger` (`<LedgerDetailCard/>` vs `<LedgerStartCard/>`), then
    render `<PendingReconciliationSection/>` + `<ViewSettledLedgersButton/>` below
    in both branches (Decision 4).

### C. Route wiring

11. Update [`finance/index.tsx`](../../../apps/web/src/routes/_protected/_app/finance/index.tsx)
    to compose `<FinanceHome/>` into the left column (assemble the seam via B.4);
    keep the existing `TEMPLATES` panel on the right. Route stays thin (imports
    from the feature).

### D. Tests + gate

12. `apps/web/tests/unit/`:
    - **Display decision** — `hasActiveLedger: true` → Ledger Detail Card
      placeholder present, empty state + CTAs absent; `false` → empty state
      present, detail card absent.
    - Lead-Day boundary (within the empty state) — inside → 2 CTAs, outside → 1 CTA.
    - Both CTA layouts + the `Recommended` badge.
    - Computed labels, incl. a Dec→Jan year-rollover case.
    - Placeholder Pending Reconciliation section renders header + `All caught up`
      (in both branches, per Decision 4).
    - Update [`coverage-manifest.test.ts`](../../../apps/web/tests/coverage-manifest.test.ts).
13. `bun run check` green across the workspace (the merge gate).

## Build order

**A → B → C → D** — kit primitive first so the feature can consume it.

## Definition of Done (from the ticket)

- [ ] Finance Home renders the fresh/empty dashboard on entry (no active ledger, 0 pending).
- [ ] **Display decision**: `hasActiveLedger` (seam) branches the left-column hero — `false` → empty state, `true` → Ledger Detail Card placeholder. `active ≡ status === 'ongoing'`.
- [ ] Scenario 1 (outside Lead-Day): single primary CTA + caption — matches image2.
- [ ] Scenario 2 (inside Lead-Day): Recommended primary + secondary CTA + caption — matches image1.
- [ ] Empty-state scenario selection derived purely from date vs Lead-Day; labels computed; Lead-Day does not affect the left column when a ledger is active.
- [ ] Ledger Detail Card is an empty `Card` placeholder (shown only when `hasActiveLedger`); no content/data/handlers.
- [ ] `TEMPLATES` placeholder ("Design Spec WIP").
- [ ] Pending Reconciliation placeholder: `0 PENDING RECONCILIATION` + `All caught up` — renders below the hero in **both** branches (kept even when the detail card shows).
- [ ] `View Settled Ledgers` present, no handler.
- [ ] Both ledger CTAs eventless, display-only.
- [ ] Built from the shared UI kit; new `Collapsible` added to the kit + exported before use.
- [ ] Component tests cover the display decision + the Lead-Day boundary + both CTA layouts.
- [ ] `bun run check` green.
