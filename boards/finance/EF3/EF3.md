# EF3 — Monthly ledger

> - `M1`
> - `type:epic`
> - `module:finance`
> - `area:domain` · `area:data` · `area:web`
> - **Depends on:** EF1 — Finance Data Foundation · EF2 — Scaffold `@nafios/finance`
> - Target Completion: M1 (first month a real user can track)

## TL;DR

Deliver the **first end-to-end feature slice of the finance app**: a brand-new user with a completely empty account can **open a MonthlyLedger** and **track the month with their own ad-hoc envelopes**. This is the spine every later capability hangs off — the creation window that decides which month is openable, the create-ledger command (manual Opening Balance + Max Capped, `maxCapped` guardrails, the automatic previous-`ongoing` → `reconciling` transition), the **derived-metrics engine** computed to the cent, manual **envelope CRUD + status**, a seeded **default category set**, and the **finance web app shell** every later UI epic builds on.

This slice stops **before templates, reconciliation, and settlement**. A user cannot auto-generate recurring envelopes, pull from an adhoc library, work a `reconciling` ledger, or settle a month — those surfaces exist only as **non-functional placeholder UI** so the app looks complete rather than half-built. What ships is fully demoable: a fresh user opens a month, keys their income and ceiling, adds envelopes by hand, marks them paid/skipped, and watches COL, Health Margin, and ASM Contribution move live and correctly.

## Goal

A user with **zero data** — no ledgers, no templates, no envelopes — can start tracking their finances in one sitting: their workspace comes pre-loaded with a sensible default category set; they open the current month (or the next month during the creation window) through a form where they **manually enter Opening Balance and Max Capped**; they land in an `ongoing` ledger; they add ad-hoc envelopes (category, item, amount), edit and delete them, and mark each `pending` / `paid` / `skipped` / `carried-over`; and every metric recomputes live and to the cent. Opening a second month parks the first as `reconciling`. Guardrails (amber-zone confirm, 2× hard block) and warning states (negative ASM, roll-forward) are enforced. After EF3, adding templates (EF4+), reconciliation, or settlement (EF5+) requires only writing the feature — never re-architecting the ledger, the metrics engine, the envelope model, or the shell.

## Stack & approach

- Builds on **EF1** (the `monthly_ledger`, `envelope`, `category`, `account`, `person` tables + owner-isolation RLS) and **EF2** (the `@nafios/finance` package skeleton — `src/domain/` pure, `src/internal/` data — and the Supabase authed/service client spine). EF3 **consumes** that schema and connection spine; the only schema-adjacent thing it adds is the default-category seed (see below).
- **Domain-first within the slice.** Tasks land in dependency order: pure domain logic (codecs, metrics, envelope model, window resolver, guardrails) → data layer (repositories, commands, provisioning) → web (shell → creation flow → ledger view → envelope UI → placeholders). The pure engine is fully unit-tested against the Jan 2027 reference _before_ any UI depends on it.
- **`@nafios/finance` layering** (from EF2): domain types, the Money/Month codecs, the metrics engine, the envelope model, the window resolver, and the default-category catalog go in `src/domain/` (zero I/O). Repositories and commands go in `src/internal/` (the only place `@nafios/db` / `@supabase/supabase-js` appear). The eslint import-boundary rule stays green.
- **Money & Month codecs land here** — the first feature that needs them (deferred from EF2). They stay in `src/domain/` and encode finance's `numeric(12,2)` + first-of-month `DATE` conventions.
- **No config / no auto-defaults in EF3.** There is deliberately **no finance-settings layer** — `DefaultOpeningBalance`, `MaxCappedPolicy`, and `LedgerCreationWindow` CRUD are _not_ built. The user keys Opening Balance and Max Capped **manually on the creation form every time**, and `leadDays` is fixed at **7**. Config-seeded prefill is a later capability.
- **Default categories are seeded.** A manual envelope requires a `category` (DB-required FK), so a fresh user must have categories from the start. EF3 owns a **finance-owned provisioning API** the auth/onboarding layer calls to give each new user a default category set (idempotent, per-user) — no migration. The exact list is a provisional "nice default" — expected to be tuned during development.
- **Web app:** a new `apps/finance` TanStack Start app — the shell (icon sidebar, top bar, content area) plus the routes and data-loading this slice needs. This shell is **shared infrastructure** every later UI epic extends, not re-scaffolds.
- **Design references:** the concrete screen designs for the in-scope flows (creation form, ledger view, envelope editor) are attached to the GitHub epic. UI tickets reference those images for layout/visual detail — this epic keeps UI-flow prose light and defers to the attached screens.
- **RLS-first:** all reads/writes run as the request user via the authenticated client from EF2; every insert path sets ownership via `auth.uid()`.

## Scope / Deliverables

Fifteen tickets — pure domain engine, then data layer, then the web slice:

**Domain (`src/domain/`, pure, zero I/O):**

1. Money & Month codecs — `numeric(12,2)` + first-of-month `DATE` encode/decode (EF3.1).
2. MonthlyLedger domain type + status model + **derived-metrics engine** (COL, Health Margin, ASM Contribution, Outstanding, plus the negative-ASM signal), verified to the cent against Jan 2027 (EF3.2).
3. Envelope domain type + status enum (`pending`/`paid`/`skipped`/`carried-over`) + **COL-contribution rule** (only `pending`+`paid` count) + `paidAt` set/clear rule. Manual envelopes only (`templateId` null, `originalAmount` null); `carried-over` is an **inert status label** — no routing, no reason prompt, no locking (EF3.3).
4. Creation-window & openable-month resolver + roll-forward signal — pure function over `today` + `leadDays` (fixed 7) + existing ledgers (EF3.4).
5. MaxCapped guardrails — amber-zone confirm (> Opening) and 2× hard block, as pure validation (EF3.5).

**Data (`src/internal/`, no migration):**

6. Ledger repository — CRUD + `(user_id, month)` uniqueness + "the one ongoing" query (EF3.6).
7. Create-ledger command — **manual** Opening Balance + Max Capped inputs, guardrail enforcement, atomic previous-`ongoing` → `reconciling` (EF3.7).
8. Envelope repository + commands — create / edit / delete a manual envelope + set-status (with `paidAt` handling); scoped to a ledger (EF3.8).
9. Default-category catalog + **per-user provisioning** — an idempotent, finance-owned API the auth/onboarding layer calls to seed the canonical list for each new user (no migration) (EF3.9).
10. Ledger read/query surface + integration tests — fetch ongoing _with envelopes and computed metrics_, fetch by month, list (EF3.10).

**Web (`apps/finance`):**

11. Finance web app shell + routing + data-layer wiring (EF3.11).
12. New-ledger creation flow — manual-input form (Opening Balance, Max Capped), month-in-window selection, guardrail UI (EF3.12).
13. Ongoing-ledger view — hero card (month, balances, live metrics, status) + envelope list grouped by category + persistent banners (negative ASM, roll-forward) (EF3.13).
14. Manual envelope CRUD + status UI — add / edit / delete + status control (EF3.14).
15. Placeholder UI for deferred flows — non-functional entry points for templates (recurring + adhoc library / "add from template"), reconciliation, and settlement, so the app looks complete (EF3.15).

**Sub-issues:**

- [ ] EF3.1 Money & Month codecs
- [ ] EF3.2 MonthlyLedger type + derived-metrics engine (verified to the cent)
- [ ] EF3.3 Envelope type + status enum + COL-contribution & `paidAt` rules
- [ ] EF3.4 Creation-window & openable-month resolver + roll-forward signal
- [ ] EF3.5 MaxCapped guardrails (amber confirm, 2× hard block)
- [ ] EF3.6 Ledger repository (CRUD, uniqueness, ongoing query)
- [ ] EF3.7 Create-ledger command (manual inputs, prev→reconciling, atomic)
- [ ] EF3.8 Envelope repository + commands (CRUD + set-status)
- [ ] EF3.9 Default-category catalog + per-user provisioning API (no migration)
- [ ] EF3.10 Ledger read/query surface + integration tests
- [ ] EF3.11 Finance web app shell + routing + data layer
- [ ] EF3.12 New-ledger creation flow (manual-input form, guardrail UI)
- [ ] EF3.13 Ongoing-ledger view (hero + metrics + envelope list + banners)
- [ ] EF3.14 Manual envelope CRUD + status UI
- [ ] EF3.15 Placeholder UI for deferred flows (templates / reconciliation / settlement)

## Story map

The vertical increments this epic delivers. Each is independently demoable; the tasks above compose them. Screen designs for each are attached to the GitHub epic.

- **S1 — Start from a stocked workspace.** As a brand-new user with zero data, my finance workspace comes pre-loaded with a sensible default category set, so I can create envelopes immediately. → EF3.9, EF3.11
- **S2 — Open my first ledger from a blank form.** As a new user, I open the **current** month, **manually key** Opening Balance and Max Capped, and land in an `ongoing` ledger. → EF3.1, EF3.4, EF3.5, EF3.7, EF3.11, EF3.12
- **S3 — Prepare next month within the window.** During the final `leadDays` (7) days of the month, I can open the **next** month; my current ledger automatically becomes `reconciling`. → EF3.4, EF3.6, EF3.7, EF3.12
- **S4 — Track the month with my own envelopes.** I add ad-hoc envelopes (category, item, amount, optional remark), edit and delete them, and mark each `pending` / `paid` / `skipped` / `carried-over`; COL and metrics update live. → EF3.3, EF3.8, EF3.10, EF3.13, EF3.14
- **S5 — See correct live metrics and warnings.** The ledger shows COL, Health Margin, ASM Contribution, and Outstanding computed live and to the cent; a persistent negative-ASM banner appears when COL exceeds Opening Balance, and a roll-forward warning when a new month has begun with no ledger. → EF3.2, EF3.10, EF3.13
- **S6 — Be protected from input errors.** Setting Max Capped above Opening Balance requires an explicit confirm (amber zone); above 2× Opening Balance is hard-blocked with no override. → EF3.5, EF3.12
- **S7 — A UI that looks finished.** Template, reconciliation, and settlement entry points render as placeholders, so the ledger doesn't look half-designed while their real behavior is still deferred. → EF3.15

## Out of scope

Everything below is a **later capability**, added as its own vertical slice. EF3 makes sure each has a clear place to land — it does not build it.

- **Templates** — recurring auto-generation into a new ledger, the adhoc library + insert, "add from template", the sync prompt, `originalAmount`/variance awareness, and template lifecycle. In EF3 these appear **only as non-functional placeholder UI** (EF3.15). Every envelope EF3 creates is manual (`templateId` null, `originalAmount` null). → **EF4+**.
- **Carry-over mechanism** — `carried-over` exists in EF3 **only as a status label** the user can set (it drops the envelope out of COL, same as `skipped`). The routing to a template panel, the mandatory `carryOverReason` prompt, `carriedFromEnvelopeId` back-references, acted-on locking, and add/kill are **not built**. → later epic.
- **Reconciliation & settlement** — the `reconciling` working view, resolution nudges, the settlement gate, snapshot, and immutable lock. EF3 _creates_ a `reconciling` ledger as a side-effect of opening the next month, but the user cannot open, work, or settle it (placeholder only). → **EF5+**.
- **Finance settings / config defaults** — no `DefaultOpeningBalance`, `MaxCappedPolicy`, or `LedgerCreationWindow` CRUD, and no config-seeded prefill. Opening Balance and Max Capped are keyed manually on the creation form every time; `leadDays` is fixed at 7. → later epic.
- **Reference-data management UI** beyond the seeded category set — category rename/reorder/recolor, and account & person CRUD. Accounts and people are not seeded, so the optional `paymentSource` / `linkedPerson` pickers on the envelope form may be empty in EF3. → later epic.
- **Annual / history view, ExtraIncome, obligation-kind** — Phase 2.
- **Schema or migration changes** — EF3 consumes the EF1 schema and adds **no migration of its own**. Default-category provisioning (EF3.9) is a finance-owned TypeScript API that inserts into the existing EF1.2 `category` table — no new Postgres object. Any schema change is an EF1 concern.

## Success Criteria

- [ ] A user with **zero prior data** lands in a workspace with default categories present, opens the **current** month from a blank manual-input form (Opening Balance + Max Capped), and reaches an `ongoing` ledger; opening a **next** month within the creation window transitions the previous `ongoing` ledger to `reconciling` atomically.
- [ ] The openable-month resolver is a pure, fully unit-tested function: current month openable iff it has no ledger; next month openable **only** within the final `leadDays` (7) days; months with existing ledgers never offered; no far-future or back-fill.
- [ ] The derived-metrics engine reproduces the **Jan 2027 reference to the cent** — Opening 7,152.35 / COL 4,307.28 (summed from envelopes) / MaxCapped 6,415.00 → Health Margin 2,107.72, ASM Contribution 2,845.07 — and computes an envelope-free ledger as COL 0 / ASM = Opening.
- [ ] COL counts only `pending`+`paid` envelopes; marking an envelope `skipped` or `carried-over` removes it from COL and recomputes all metrics live. `paidAt` is set on transition to `paid` and cleared on transition away.
- [ ] Manual envelope create / edit / delete works against an `ongoing` ledger; a new user can create an envelope immediately because default categories are provisioned (idempotently, per user).
- [ ] MaxCapped guardrails enforced at the **domain layer** regardless of caller: amber-zone requires an explicit confirm flag; `> 2× Opening` is rejected with no override; both surfaced in the creation UI.
- [ ] Negative-ASM and roll-forward warning states are derived live and rendered as persistent, non-dismissible banners.
- [ ] The `(user_id, month)` uniqueness constraint and the "at most one `ongoing`" invariant both hold; no code path creates a ledger without explicit user action.
- [ ] Template, reconciliation, and settlement entry points are present as **non-functional placeholders** — the app looks complete, and none of them perform a real mutation.
- [ ] **`bun run check`** is green across the workspace including `apps/finance`; the eslint domain/data import-boundary stays green (metrics/codecs/resolver/envelope model are pure in `src/domain/`; Supabase touched only in `src/internal/`).

## Notes

- **Carry-over is a status, not a mechanism (this epic).** The user can set an envelope to `carried-over` and it behaves like any other terminal status (drops out of COL, revertible). None of the template-routing / mandatory-reason / acted-on-locking machinery is built — that lands with the reconciliation/template work. This keeps the status control complete-feeling without pulling in the carry-over subsystem.
- **No config by design.** EF3 deliberately drops the finance-settings layer the earlier draft assumed. Opening Balance and Max Capped are manual inputs on every creation; `leadDays` is a fixed 7. This removes config resolution from the create command entirely and de-risks the slice — config-seeded prefill returns as its own capability.
- **Default-category provisioning is per-user, not a static seed.** Because category rows are owner-scoped (`user_id NOT NULL` + `owner_all` RLS) and the user can rename/reorder/delete them (finance-domain-spec §3; RFC-008), the "seed" copies the canonical list into each user's own rows. **Settled in EF3.9:** it is a **finance-owned TypeScript API** (`provisionDefaultCategories(client, userId)`) the **auth/onboarding layer calls** for each new user as a trusted backend job (service client, `user_id` set explicitly per DB-design §8.2) — **not** a DB trigger, not a seed-on-first-load, and **not a migration** (EF3 adds none). The canonical list lives as a pure domain catalog (`src/domain/`); it is provisional and expected to be tuned during development.
- **Empty-ledger and populated-ledger both demo.** COL 0 / ASM = Opening (no envelopes) and the Jan 2027 populated reference are both acceptance anchors — the metrics engine must be right in both regimes before envelope UI depends on it.
- **Reconciling is created, not operated.** The create command _produces_ a `reconciling` ledger when the next month opens, but viewing/working/settling it is a later epic. EF3 only needs the previous ledger to leave `ongoing` correctly; the reconciling surface is a placeholder (EF3.15).
- **App-shell placement.** The `apps/finance` shell is shared infra for every later UI epic; it rides in here (the first UI-bearing slice) rather than as a separate horizontal epic.
- **Cross-ticket decision:** the first-of-month `DATE` handling for `month` (`CHECK (month = date_trunc('month', month))`) is owned by the Month codec (EF3.1) and relied on by the window resolver (EF3.4) and ledger repository (EF3.6). Keep the first-of-month invariant in one place (the codec).
- **Cross-ticket decision:** the COL-contribution rule (only `pending`+`paid` count) lives once in the Envelope domain model (EF3.3) and is consumed by the metrics engine (EF3.2); it is never re-implemented in the data or web layers.

## Revision History

| Version | Date       | Author            | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------- | ---------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.3     | 2026-07-03 | NafiOS Foundation | **Settled EF3.9 default-category provisioning → a finance-owned API called at onboarding; EF3 now adds NO migration.** Resolved the previously-open mechanism: provisioning is a finance-owned TypeScript API (`provisionDefaultCategories(client, userId)`) the auth/onboarding layer imports and calls per new user as a trusted backend job (service client, explicit `user_id` per DB-design §8.2), consuming the pure `src/domain/` catalog — **not** a DB trigger, seed-on-first-load, or migration. Dropped "+ one migration" from the Data-section header, Scope item 9, the sub-issue checklist, and the Out-of-scope schema line; updated the Stack & approach seed bullet and rewrote the provisioning Note. **NB:** EF3.6 §8, EF3.7 §4.2/§8, and EF3.8 still carry the superseded "one migration = EF3.9 seed" wording and need the same correction (EF3.7's no-RPC atomicity conclusion is unaffected). |
| 0.2     | 2026-07-02 | NafiOS Foundation | **Re-scoped from "open & view an empty ledger" to "get started & track with manual envelopes."** Folded manual envelope CRUD + full status workflow into EF3 (`carried-over` as an inert status label — no mechanism). **Dropped the finance-settings/config layer** — Opening Balance and Max Capped are now manual inputs on the creation form every time, `leadDays` fixed at 7 (removed config resolution from the create command). Added a **default-category seed / per-user provisioning** ticket (the one migration EF3 owns). Added a **placeholder-UI** ticket for deferred template / reconciliation / settlement flows so the app looks complete. Grew from 11 to 15 tickets (5 domain / 5 data / 5 web); story map extended to S1–S7. Design screens for in-scope flows are attached to the GitHub epic; UI-flow prose kept intentionally light. |
| 0.1     | 2026-07-01 | NafiOS Foundation | Initial epic draft: open & view a MonthlyLedger (empty ledger; envelopes/reconciliation/settlement/templates/config deferred). Superseded by 0.2's re-scope.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
