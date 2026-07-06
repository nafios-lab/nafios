# NafiOS Finance Spec

> 📌 **Status:** Draft · **Version:** 0.22 · **Last Updated:** 2026-06-01 · **Owner:** Team NafiOS Foundation

This is a **living document**. All changes must be recorded in the Revision History at the bottom. Any deviation from this spec in implementation must update this spec first.

---

## 1. Purpose

NafiOS Finance is a **monthly-ledger-first personal cashflow operating system** for a single user managing their own household finances. It replaces the manual workflow of maintaining one Google Sheet tab per month — duplicating, editing, recalculating, marking items paid — with an automated, queryable, PA-integrated system that preserves the user's existing mental model: categorized envelopes of cash prepared each month, a Max Capped COL guardrail, and a residual savings sink (ASM Fund).

It is **not** a budgeting app, net-worth tracker, or financial advisor. It assumes the user already knows their numbers and wants leverage, not guidance.

## 2. Scope

### In scope (MVP)

- Monthly Ledger as the primary unit of work
- Recurring envelope templates that auto-populate future ledgers
- Category-based envelope grouping (Debt, Subscriptions, Life, etc.)
- Per-envelope status workflow (`pending` / `paid` / `skipped` / `carried-over`)
- Per-envelope remarks (the operational knowledge layer)
- Source-of-funds attribution (Trust, DBS, OCBC, Cash, etc.)
- Derived metrics: Opening Balance, COL, Max Capped, Health Margin, ASM Contribution
- Family-linked envelopes (Wifey, Mama, Abah, Arissa, Awish as first-class entities)
- Web app with full CRUD + a daily-action dashboard
- Annual view across 12 ledgers

### Out of scope (MVP — may revisit in Phase 2+)

- Household / joint accounts / sharing with spouse
- Multi-currency
- Investment performance tracking
- Category-level budget envelopes (we operate at per-line envelope level)
- Native mobile app (PWA may come for free; native is later)
- Loan repayment planner, financing planner _(sister modules, separate specs)_
- Income stream modeling beyond fixed monthly Opening Balance
- Extra income / bonuses _(handled by a separate ExtraIncome primitive)_ — see [Section 6](#6-future-considerations-phase-2)

## 3. Mental Model

The user does not budget. The user **runs a monthly cashflow contract with themselves**:

> _Opening Balance pays a priority-ordered list of envelopes. Whatever survives flows to the savings sink (ASM). Discipline is measured by how far below Max Capped the total stays._

### Envelope as the universal primitive

Every line item is an **Envelope** — a pocket of cash set aside for a specific purpose this month. The Cost of Living (COL) is the sum of all envelope amounts. Whatever remains after all pockets are deducted from Opening Balance automatically flows to ASM.

Categories (Debt, Subscriptions, Taxes, Bills, Set-Asides, Advisories, Insurances & Investments, Life) **group** envelopes by what they fund. They are organizational labels — they impose no priority order, no payment sequence, and no budget limits.

This is **per-line-item envelope budgeting**, not traditional per-category envelope budgeting. The discipline lives in the line, not in a category cap.

### Categories (default set)

1. Debt
2. Subscriptions
3. Taxes
4. Bills
5. Set-Asides _(previously "Liabilities" in the legacy sheet)_ — see [Section 7 Glossary](#7-glossary)
6. Advisories
7. Insurances & Investments
8. Life

Categories are **user-defined labels**. The user can rename, reorder, add, or remove categories. The list above is the seeded default set based on the user's existing sheet. The numbering is a display default, not a payment priority.

### Rationale & rejected alternatives

This system is **per-line-item envelope budgeting**, deliberately chosen over two more conventional alternatives.

**Rejected — Category-budget model (YNAB-style).** Assign a budget to each category ("Debt: $X, Groceries: $Y") and track spending against the bucket. Rejected because it forces the user to first decide a category total, then split it across line items — fighting their existing workflow, which starts from specific commitments ("DBS Reno Loan: $458") and lets COL emerge from their sum. The user does not think in category buckets; they think in obligations. Forcing them through a category layer adds work without information.

**Rejected — Per-category envelope-budget.** Cash assigned to category envelopes; spending draws down each envelope until empty. Rejected because it loses granularity at the line-item level. Marking "Groceries envelope: paid" hides whether each underlying item was actually handled. The user's existing sheet tracks every line individually, on purpose — that visibility is the whole product.

**Chosen — Monthly-ledger with per-line envelopes.** Each obligation is its own envelope. Categories group envelopes but impose no ordering or caps. COL is the sum of all envelopes. Discipline is enforced at the COL level via the MaxCappedPolicy, not at the category level — matching how the user actually self-governs.

**Structural consequence:** this system has no "category budget" concept and never will. If a future requirement seems to need one, the right move is a new sister module (e.g., a Budget module — see [Section 6.3](#63-sister-modules)), not a retrofit of this one.

## 4. Core Entities

### MonthlyLedger

The **primary unit of work**. One per calendar month. Owns all envelopes and derived metrics for that month. Full specification in [`monthly-ledger.md`](monthly-ledger.md).

- `month` — e.g., `2026-01` (unique — one ledger per financial month)
- `openingBalance` — decimal, seeded from config at creation. Editable while `ongoing` (adjustments require explicit action and are logged); locked in `reconciling` and `settled`.
- `maxCapped` — decimal, the Max Capped COL ceiling for this month. Copied from config at creation, owned by the ledger thereafter. Editable while `ongoing`; locked in `reconciling` and `settled`.
- `status` — `ongoing` / `reconciling` / `settled`
- `envelopes[]`
- `derivedMetrics` — computed, not stored
- `createdAt` — timestamp (set at creation, immutable)
- `settledAt` — timestamp, nullable

### Envelope

A single line item — a pocket of cash earmarked for a specific purpose this month.

- `category` — Category ref
- `item` — string (e.g., "Netflix", "DBS Reno Loan")
- `amount` — decimal (the money set aside in this pocket). Editable while ledger is `ongoing` or `reconciling`, regardless of envelope status. Locked at `settled`.
- `originalAmount` — decimal, system-managed, nullable. **Template-linked envelopes only** (`templateId` is not null): snapshot of `amount` at envelope creation time (copied from template's `defaultAmount`). Set once, never modified. `null` for manually created envelopes. Enables variance awareness (`amount − originalAmount`) without reintroducing planned/actual dual-tracking. Applies to both `recurring` and `adhoc` template types.
- `status` — `pending` / `paid` / `skipped` / `carried-over`
- `paidAt` — timestamp, nullable
- `paymentSource` — Account ref, nullable
- `remark` — string (the "6th every month", "Standby for GIRO" layer)
- `linkedPerson` — Person ref, nullable
- `sortOrder` — integer (display position within category; inherited from template, ad-hoc envelopes appended at end)
- `templateId` — Template ref, nullable (null = manually created, not from any template). System checks the linked template's `type` for behavioral rules (sync prompt fires for `recurring` only).
- `carriedFromEnvelopeId` — Envelope ref, nullable. Back-reference to the source envelope this was carried over from. Presence signals carried-over origin (UI shows "dirty" visual indicator). Null for fresh envelopes.
- `carryOverReason` — string, nullable. Mandatory reason provided by the user when carrying over (minimum 10 characters). Editable at any time but can never be emptied or set below the minimum length. Travels with the item through the staging panel. Null for non-carried-over envelopes.
- `obligationKind` — _reserved for Phase 2_ — see [Section 6.1](#61-obligation-kind-second-classification-axis)

### Template

A reusable definition that creates Envelopes. Comes in two types: **`recurring`** (standing instruction — auto-generates into every new ledger) and **`adhoc`** (reusable blueprint — user manually inserts from a library). Full specification in [`template.md`](template.md).

**Shared fields (both types):**
- `type` — `recurring` | `adhoc` (immutable after creation)
- `category`, `item`, `sortOrder`, `defaultAmount`, `defaultRemark`, `defaultPaymentSource`, `defaultLinkedPerson`

**Recurring-only:**
- `nextDueMonth` — the next month this template should generate an envelope
- `endMonth` — the last month this template should generate an envelope (`null` = indefinite)
- `occurrencesRemaining` — number of payments remaining (data point on entity; derivation is an implementation decision)
- `status` — `active` / `pending_reconciliation` / `completed` / `terminated` (lifecycle state — see [`template.md`](template.md), Section 3.1)

**Adhoc-only:**
- `archived` — boolean (hide from active library without deleting; defaults to `false`)
- `lastUsedMonth` — the most recent ledger month this template was inserted into (system-managed)
- `usageCount` — number of times used to create an envelope (system-managed)

### Category

A user-defined label for grouping envelopes. Categories are purely organizational — they carry no priority or payment-sequencing semantics.

- `name` — display label (e.g., "Debt", "Subscriptions", "Life")
- `displayOrder` — integer, controls visual ordering on the dashboard (user-reorderable)
- `color` — optional, for visual distinction
- Defaults seeded from the user's existing sheet (see [Section 3](#3-mental-model))

Within a category, envelopes are ordered by `sortOrder` — an integer inherited from the source Template at generation/insertion time. Manually created envelopes are appended at the end of their category. This ordering is for **display purposes only** and does not imply payment priority.

### Account

A source of funds. Label only — no balance tracking at MVP.

- `name` — Trust, DBS, OCBC, Cash, etc.
- `type` — `bank` / `cash` / `other`

### Person

Family / dependents linked to envelopes.

- `name`, `relationship` — `spouse` / `parent` / `child` / `other`
- Enables queries like _"total annual outflow tied to Arissa"_

### DefaultOpeningBalance (config/settings)

User-configurable default for the Opening Balance seeded into new ledgers. Lives in user config/settings — **not** a per-ledger runtime entity.

- `amount` — decimal (the user's standard monthly income)

On ledger creation, the system copies this value into the ledger's `openingBalance` field. After creation, config changes do not affect existing ledgers. The ledger owns its `openingBalance` value — see [`monthly-ledger.md`](monthly-ledger.md), Section 2.

### MaxCappedPolicy (config/settings)

User-configurable defaults for the Max Capped COL ceiling. Lives in user config/settings — **not** a per-ledger runtime entity.

- `mode` — `hard_amount` | `percentage_of_opening`
- `value` — decimal (interpreted by mode)
- `behavior` — `warn_only` | `block_add` (MVP ships `warn_only`)

On ledger creation, the system resolves this policy to a concrete decimal and copies it into the ledger's own `maxCapped` field. After creation, config changes do not affect existing ledgers. The ledger owns its `maxCapped` value — see [`monthly-ledger.md`](monthly-ledger.md), Section 2.

### LedgerCreationWindow (config/settings)

User-configurable setting that governs *when* a new ledger may be opened. Lives in user config/settings — **not** a per-ledger runtime entity.

- `leadDays` — integer, **clamped to the range 1–7, default 7**. The number of days before a month starts during which its ledger becomes openable (the creation window).

Unlike `DefaultOpeningBalance` and `MaxCappedPolicy`, this value is **not** copied onto the ledger — it is read live to decide whether the next month is openable and when the roll-forward warning escalates. The next calendar month is openable only during the final `leadDays` days of the current month; the current calendar month is always openable if it has no ledger. The system never auto-creates a ledger. See [`monthly-ledger.md`](monthly-ledger.md), Section 3 (Creation window & roll-forward).

## 5. Invariants

These MUST always hold; the system enforces them.

- `COL = Σ(envelope.amount for all envelopes where status is pending or paid)`
- `Health Margin = MaxCapped − COL` _(headroom under self-imposed ceiling — a discipline gauge)_
- `ASM Contribution = Opening Balance − COL` _(literal residual to savings — real money). When negative, a persistent non-dismissible banner is shown — see [`monthly-ledger.md`](monthly-ledger.md), Section 5._
- **MaxCapped hard ceiling:** `maxCapped` cannot exceed `2 × openingBalance` (blocks input errors). Edits that raise `maxCapped` above `openingBalance` require explicit user confirmation (amber-zone guardrail) — see [`monthly-ledger.md`](monthly-ledger.md), Section 2.
- Once a ledger is `settled`, envelopes are read-only. There is no reopen — settled is final.
- Every Envelope belongs to exactly one Category.
- **Opening Balance is fixed for the month.** Adjustments require explicit action and are logged.
- Bonuses, windfalls, and non-salary income do NOT change Opening Balance — they're tracked separately via `ExtraIncome` (Phase 2 — see [Section 6.2](#62-extraincome-primitive)).
- **One ledger per financial month.** The system enforces a uniqueness constraint on the `month` field. Duplicate ledgers for the same month cannot exist.
- **At most one `ongoing` ledger at any time.** Creating a new ledger automatically transitions the previous `ongoing` ledger to `reconciling`.
- **Bounded ledger creation.** Only the current calendar month (always, if no ledger exists) or the next calendar month (during the creation window — the final `leadDays` days of the current month, `leadDays` clamped 1–7, default 7) may be opened. No far-future or arbitrary back-filled months.
- **No auto-creation.** The system never creates a ledger on the user's behalf — creation always requires explicit user action and confirmation of Opening Balance / Max Capped via the creation form (config defaults only prefill). If a new month begins with no ledger, the previous `ongoing` ledger stays `ongoing` and the system shows a persistent, non-dismissible warning urging the user to open the new month — see [`monthly-ledger.md`](monthly-ledger.md), Section 3 (Roll-forward warning).

> **Note:** Ledger status lifecycle, workflows, derived metrics, and carry-over behavior are fully specified in [`monthly-ledger.md`](monthly-ledger.md).

## 6. Future Considerations (Phase 2+)

These are explicitly NOT in MVP but are flagged here so they're not forgotten when we get there.

### 6.1 Obligation Kind (second classification axis)

Add a semantic classification to envelopes orthogonal to Category:

- `debt_repayment`, `recurring_service`, `tax_installment`, `utility`, `set_aside`, `family_support`, `insurance_premium`, `discretionary`

Enables queries like _"total annual family_support outflow"_ or _"all tax_installment envelopes this year"_. The field is **reserved on the Envelope entity (nullable) for forward compatibility** so we don't have to migrate later.

### 6.2 ExtraIncome Primitive

Bonuses, freelance income, gifts, refunds — tracked per occurrence, NOT mixed into Opening Balance. UI surfaces an "Extras" feed with directive prompts: route to ASM, debt paydown, or hold.

Will be authored as a separate spec doc when MVP stabilizes.

### 6.3 Sister Modules

- **Loan Repayment Planner** — projection layer reading the same envelope data
- **Financing Planner** — multi-month / multi-year planning view
- **Budget Module** — only if user ever adopts category-level budgeting (not currently their model)

### 6.4 Household / Joint Mode

Sharing ledgers with spouse. Permission model TBD.

### 6.5 NafiOS PA Integration

Cross-module hooks: due-date reminders surfaced via Calendar, receipt attachments via Document/Drive, financial follow-ups created in SmartTodo.

## 7. Glossary

| Term                     | Definition                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **Envelope**             | A pocket of cash earmarked for a specific purpose this month. The universal primitive in this system.                   |
| **COL (Cost of Living)** | Sum of all envelope `amount` values where status is `pending` or `paid` for the month. Excludes `skipped` and `carried-over` envelopes. |
| **Max Capped**           | User-set ceiling on COL. The discipline mechanism.                                                                      |
| **Health Margin**        | `MaxCapped − COL`. Headroom under the ceiling. Measures discipline, not money on hand.                                  |
| **ASM Fund**             | _Actual Safe Margin Balance account._ User's emergency / savings sink.                                                  |
| **ASM Contribution**     | `Opening Balance − COL`. The monthly amount that flows to ASM.                                                          |
| **Category**             | User-defined label for grouping envelopes by what they fund. Organizational only — no priority or payment-sequencing semantics. |
| **Set-Asides**           | Envelopes pre-funding known near-future spend (groceries, school fees), not external debts. Renamed from "Liabilities". |
| **Carry-Over**           | Marking an unpaid envelope with a mandatory reason. **Template-linked envelopes** route to the parent template's carry-over panel — the user manages outstanding obligations from the template (add to ongoing ledger, or kill). **Manually created envelopes** treat `carried-over` as a terminal ledger status — no routing. See [`monthly-ledger.md`](monthly-ledger.md), Carry-Over Mechanics, and [`template.md`](template.md), Section 6.6. |
| **Ongoing**              | Ledger status. The single active working ledger the user operates in day-to-day.                                        |
| **Reconciling**          | Ledger status. A previous month's ledger parked for finalization — reviewing actuals, marking envelopes as paid/skipped/carried-over. |
| **Settled**              | Ledger status. Locked and immutable historical record. Final state.                                                     |
| **GIRO**                 | Singapore inter-bank direct debit. Used for IRAS tax installments and many recurring bills.                             |

---

## References

- Source workflow: User's "2026 FINANCE" Google Sheet (legacy system being replaced)
- Companion API spec: `specs/api/finance-api.spec.md` — _pending authorship_
- Architecture context: **AI-Ready Monorepo for NafiOS** (Doc Hubs)
- **ADR policy note:** Spec-internal reasoning (model choice, formula derivation) lives inline — [Section 3](#3-mental-model) for model choice, [`monthly-ledger.md`](monthly-ledger.md) for derived metrics. The `adr/` directory is reserved for _cross-cutting_ decisions that span specs — stack choices (Bun, Drizzle, TanStack Start), deployment patterns, auth strategy, etc. See Revision 0.2 below.

---

## Revision History

| Version | Date       | Author            | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------- | ---------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.22    | 2026-06-01 | NafiOS Foundation | **No auto-creation.** Removed the auto-open safety net. The system never creates a ledger headlessly — creation always requires explicit user confirmation of Opening Balance / Max Capped via a creation form (config defaults only prefill). When a new month begins with no ledger, the previous ledger stays `ongoing` and a persistent roll-forward warning urges the user to open it. Replaced the auto-open clause in the bounded-creation invariant with a standalone no-auto-creation invariant; updated `LedgerCreationWindow` description. Full behavior in `monthly-ledger.md` Section 3. |
| 0.21    | 2026-06-01 | NafiOS Foundation | **LedgerCreationWindow config + bounded creation invariant.** Added `LedgerCreationWindow` config entity (`leadDays`, clamped 1–7, default 7) governing when the next month is openable. Added bounded-creation + auto-open invariant. Full behavior in `monthly-ledger.md` Section 3. |
| 0.20    | 2026-05-28 | NafiOS Foundation | **Negative ASM Contribution guardrails.** Added maxCapped hard ceiling (2× Opening Balance) and amber-zone confirmation to invariants. Cross-referenced negative ASM banner behavior from `monthly-ledger.md`. Resolves RFC-022. |
| 0.19    | 2026-05-28 | NafiOS Foundation | **Terminate replaces force-close.** Added `terminated` to recurring template status enum. Termination = soft-delete to archive with mandatory reason. Resolves RFC-020. |
| 0.18    | 2026-05-27 | NafiOS Foundation | **Template-centric carry-over + stale `paused` fix.** Updated Carry-Over glossary entry to reflect template-centric model (template-linked carry-overs route to parent template's panel; manual envelopes are terminal on ledger). Fixed recurring template status enum — removed stale `paused` status (already removed in `template.md` v1.4). |
| 0.17    | 2026-05-25 | NafiOS Foundation | **Recurring template status lifecycle.** Replaced `active` boolean with `status` enum (`active` / `paused` / `pending_reconciliation` / `completed`). Resolves RFC-015. |
| 0.16    | 2026-05-25 | NafiOS Foundation | **Cross-spec alignment pass.** Fixed `openingBalance` field description — now states editability and lockability rules matching ledger spec (was misleadingly described as "fixed at month start"). Updated header version to match revision history. |
| 0.15    | 2026-05-25 | NafiOS Foundation | **Cross-spec review fixes.** Added `DefaultOpeningBalance` config entity (was referenced in ledger spec but never defined). Filed RFC-014 (nextDueMonth advancement), RFC-015 (occurrencesRemaining derivation), RFC-016 (carry-over target resolution). |
| 0.14    | 2026-05-25 | NafiOS Foundation | **Unified Template entity.** Merged RecurringTemplate into a single Template entity with `type: recurring \| adhoc`. Adhoc templates are reusable blueprints the user manually inserts from a library (no auto-generation, no sync prompt). `templateId` on Envelope now references the unified Template — system checks `template.type` for behavioral branching. Replaced `recurring-template.md` with `template.md`. Resolves RFC-013. |
| 0.13    | 2026-05-25 | NafiOS Foundation | **RecurringTemplate: no reactivation + generate into ongoing ledger.** Completed templates cannot be reopened — user creates a new template instead (resolves RFC-010). Templates now auto-generate an envelope into the current ongoing ledger at creation time when `nextDueMonth` matches. See `recurring-template.md` v0.7–0.8. |
| 0.12    | 2026-05-25 | NafiOS Foundation | **Added `createdAt` to MonthlyLedger.** Timestamp set at creation, immutable. Resolves RFC-006. |
| 0.11    | 2026-05-25 | NafiOS Foundation | **Removed `notes` from MonthlyLedger.** Ledger-level free-text journal removed — all annotation lives per-envelope via `remark`. Resolves RFC-005. |
| 0.10    | 2026-05-25 | NafiOS Foundation | **Cross-spec alignment review.** Added `maxCapped` to MonthlyLedger field list (was referenced but not listed). Added `sortOrder` to RecurringTemplate field list (was in entity spec but missing from domain summary). Updated COL formula to explicitly include only `pending` and `paid` envelopes — `carried-over` envelopes are now excluded (money was not spent, should not count toward cost of living). Updated COL glossary entry to match. |
| 0.9     | 2026-05-24 | NafiOS Foundation | **Carry-over fields on Envelope.** Added `carriedFromEnvelopeId` (back-reference to source envelope, signals dirty origin) and `carryOverReason` (mandatory reason from user). Updated Carry-Over glossary entry to reflect two-phase staging panel flow. Resolves RFC-004. |
| 0.8     | 2026-05-24 | NafiOS Foundation | **Envelope amount editability + originalAmount.** Clarified that `amount` is editable while ledger is `ongoing` or `reconciling`, regardless of envelope status. Added `originalAmount` field — system-managed snapshot at creation time for variance awareness. Resolves RFC-011. |
| 0.7     | 2026-05-24 | NafiOS Foundation | **MaxCappedPolicy → config/settings.** Redefined MaxCappedPolicy as a config-level default rather than a runtime entity. On ledger creation, system resolves the policy to a concrete decimal and copies it into the ledger's `maxCapped` field. Ledger owns the value after creation — config changes don't propagate. Resolves RFC-003. |
| 0.6     | 2026-05-24 | NafiOS Foundation | **PriorityTier → Category.** Renamed PriorityTier to Category and redefined as a user-defined grouping label with no priority or payment-sequencing semantics. Categories are now fully user-editable (`name`, `displayOrder`, `color`). Removed "top-down" payment ordering language throughout. Added `sortOrder` field to Envelope for intra-category display ordering (inherited from RecurringTemplate). Resolves RFC-001 (intra-tier ordering) and RFC-008 (Set-Asides naming — moot now that categories are user-defined). |
| 0.5     | 2026-05-24 | NafiOS Foundation | **Extracted MonthlyLedger spec.** Moved ledger status lifecycle, lifecycle workflows, derived metrics (including worked examples and Health Margin vs ASM Contribution analysis), invariants, and carry-over behavior into [`monthly-ledger.md`](monthly-ledger.md). Core spec retains entity summary with field listing and link. Moved open questions to [`rfcs/`](rfcs/) — specs should state behavior, not track decision logs. Renumbered sections (Future Considerations → 6, Glossary → 7). Updated all internal cross-references. |
| 0.4     | 2026-05-24 | NafiOS Foundation | **Ledger status lifecycle redesign.** Replaced `draft / active / closed` with `ongoing / reconciling / settled`. Ledger creation is user-initiated (no auto-trigger on the 1st) — user typically prepares 1–2 days before month start due to GIRO timing. Creating a new ledger auto-transitions the previous to `reconciling`. One ledger per financial month (system-enforced). One `ongoing` ledger at any time. No `draft` status — ledgers are live from creation. Added Section 5.1 with full lifecycle definition. Rewrote Section 6 lifecycle workflows. Resolves review item #3 (roll-forward race condition) and #5 (draft→active transition).                                          |
| 0.3     | 2026-05-24 | NafiOS Foundation | **Simplified envelope model.** Replaced `plannedAmount` / `actualAmount` with single `amount` field. Envelopes are pockets of money set aside, not forecasts. COL now excludes `skipped` envelopes. Removed `COL (actual)` metric (no longer needed). ASM Contribution is purely `Opening Balance - COL` with no planned/actual ambiguity. Fixed "DSB" typo to "DBS". Resolves review items #1, #2, #4.                                                                                                                                                                                                                                                                                           |
| 0.2     | 2026-05-24 | NafiOS Foundation | **Structural consolidation, no decision change.** Folded prospective ADR-0001 (monthly-ledger model choice) into [Section 3](#3-mental-model) as "Rationale & rejected alternatives." Folded prospective ADR-0002 (derived-metrics formulas) into [Section 7](#7-derived-metrics) as "Why two metrics — Health Margin vs ASM Contribution," including the three-case structural relationship between MaxCapped and Opening Balance. Removed pending-authorship ADR references. Established policy: spec-internal reasoning lives in the spec itself; `adr/` is reserved for cross-cutting decisions (stack, framework, deployment) — not for reasoning that already belongs inside a single spec. |
| 0.1     | 2026-05-23 | NafiOS Foundation | Initial draft. Locked mental model (Envelope as universal primitive), core entities, derived-metric formulas (Health Margin vs ASM Contribution clarified), and worked example against the Jan 2027 reference ledger. Carry-over behavior deferred (now in `monthly-ledger.md`). Obligation Kind reserved for Phase 2 ([Section 6.1](#61-obligation-kind-second-classification-axis)).                                                                                                                                                                                                                                                                                                |
