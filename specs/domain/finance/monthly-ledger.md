# MonthlyLedger Spec

> **Status:** Draft · **Parent Spec:** `finance-domain-spec.md` (Section 4, Core Entities) · **Last Updated:** 2026-06-01

---

## 1. What is a MonthlyLedger?

A MonthlyLedger is the **primary unit of work** in the finance system. It represents one calendar month of cashflow — all the envelopes the user needs to fund, the opening balance they start with, and the derived metrics that tell them how the month is going.

The user does not interact with envelopes in isolation. They interact with a ledger — a single, scrollable surface where every pocket of cash for the month is visible, organized by category, and actionable.

### One ledger per financial month

The system enforces a **uniqueness constraint on `month`**. Duplicate ledgers for the same month cannot exist. At most **one ledger is `ongoing`** at any point in time — this is the user's active working surface.

---

## 2. Entity Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `month` | date (first-of-month) | Yes | The calendar month this ledger covers, identified as `YYYY-MM` (e.g., `2026-01`) but physically stored as a first-of-month `DATE` (e.g., `2026-01-01`) — see note below. Unique per user. |
| `openingBalance` | decimal | Yes | The total income the user has to allocate. Seeded from config at creation, owned by the ledger thereafter. Editable while `ongoing` (adjustments require explicit action and are logged); locked in `reconciling` and `settled`. |
| `maxCapped` | decimal | Yes | The Max Capped COL ceiling for this month. Copied from config at creation, owned by the ledger thereafter. Editable while `ongoing`; locked in `reconciling` and `settled`. Locked in `reconciling` so the ceiling reflects the discipline contract the user set for that month — reconciliation adjusts reality (envelope amounts) to match what happened, not the target. |
| `status` | enum | Yes | `ongoing` / `reconciling` / `settled` — see [Section 3](#3-status-lifecycle). |
| `envelopes[]` | Envelope[] | — | All envelopes (line items) for this month. |
| `derivedMetrics` | computed | — | Computed on read, not stored — see [Section 5](#5-derived-metrics). |
| `createdAt` | timestamp | Yes | Set when the ledger is created (enters `ongoing`). Immutable. |
| `settledAt` | timestamp | No | Set when the ledger transitions to `settled`. Null otherwise. |

> **Note — `month` is stored as a first-of-month `DATE`, not a `YYYY-MM` string.** Conceptually a ledger is identified by its month (`2026-06`), but the storage layer pins it to the first day of that month (`2026-06-01`). The year is therefore always part of the stored value: `2026-06-01` (Jun 2026) and `2027-06-01` (Jun 2027) are distinct, so the `(user_id, month)` uniqueness constraint treats them as separate ledgers — there is no separate `year` field, and no collision between the same month in different years. A `DATE` is preferred over a `YYYY-MM` string because it gives native interval math (`month + interval '1 month'`), guaranteed chronological ordering, index-friendly range queries, and direct interop with `date_trunc('month', …)` used elsewhere in the schema. The day component is fixed at `01` and carries no meaning; the schema enforces this with `CHECK (month = date_trunc('month', month))`.

### Opening Balance & Max Capped — config-seeded, ledger-owned

Both `openingBalance` and `maxCapped` follow the same pattern:

- **On ledger creation**, the system copies the current default from user config/settings into the ledger.
- **After creation**, the ledger owns the value. Config changes do not propagate to existing ledgers.
- **Editability**: both fields are editable while the ledger is `ongoing`. Locked in `reconciling` and `settled`.

Opening Balance adjustments require explicit action and are logged. Bonuses, windfalls, and non-salary income do NOT change Opening Balance — they're tracked separately via `ExtraIncome` (Phase 2).

For `maxCapped`, if the config policy mode is `percentage_of_opening`, the system resolves it to a concrete decimal at creation time. The ledger stores the resolved number, not the formula. Updating `maxCapped` on an `ongoing` ledger triggers a confirmation dialog since Health Margin recomputes.

#### MaxCapped edit guardrails

- **Amber zone — exceeds Opening Balance:** When the user edits `maxCapped` to a value **above `openingBalance`**, the system presents a **blocking confirmation sheet**: *"Your spending ceiling ($X) now exceeds this month's income ($Y). You'll be drawing $Z from savings. Continue?"* The user must explicitly confirm — not just dismiss. This catches the root cause of potential negative ASM Contribution at the point of configuration change, not after the fact.
- **Hard block — extreme threshold:** The system **blocks** `maxCapped` from being set above **2× Opening Balance**. This catches input errors (typos, decimal mistakes), not intentional decisions. The block is absolute — no override.

---

## 3. Status Lifecycle

A MonthlyLedger has exactly three statuses:

```
ongoing → reconciling → settled
```

### `ongoing`

The user's single active working ledger. All day-to-day operations happen here — allocating envelopes, marking payments, adjusting amounts. The system guarantees that **at most one ledger is `ongoing` at any point in time**. This is the ledger the user sees front and center.

### `reconciling`

A previous month's ledger that has been parked for finalization. A ledger enters this state **automatically** when the user creates a new ledger — the act of creating a new `ongoing` ledger transitions the previous one to `reconciling`.

In this state the user can:
- Review and adjust final amounts
- Mark remaining envelopes as `paid`, `skipped`, or `carried-over`
- Make carry-over decisions — mark envelopes as `carried-over` (template-linked items route to their parent template's carry-over panel; manual envelopes remain in the ledger as a terminal status)
- Reconcile the opening balance of the `ongoing` ledger against this month's actual closing figures

A `reconciling` ledger lives in a **separate view** — out of the main workflow but always accessible. There is no deadline to complete reconciliation; it waits for the user.

### `settled`

Locked and immutable. A historical record of what happened that month. No edits are permitted. Once settled, the ledger serves as the source of truth for that month's financial activity.

The transition from `reconciling` → `settled` is **user-initiated**. The user explicitly settles the month when they are satisfied that all items are accounted for.

### Transition rules

| From | To | Trigger |
|---|---|---|
| `ongoing` | `reconciling` | User creates the next ledger — automatic side-effect of creation (no auto-open; the system never creates a ledger on its own) |
| `reconciling` | `settled` | User explicitly settles the month |

No other transitions are permitted. There is no backward movement (`settled` → anything). There is no `draft` status — the moment a ledger is created, money is real and the ledger is `ongoing`.

### Creation window & roll-forward

The user prepares the next month's ledger **before** the month starts — often on the 30th or 31st — because financial obligations (bank GIRO deductions, auto-debits) begin executing on the 1st. The system supports this with a bounded **creation window** plus an escalating prompt when that window lapses, rather than allowing a ledger for any month at any time. This prevents far-future ledgers (e.g., opening 2028-03 today) and month-after-month spam, both of which would pollute the system with stray `reconciling` ledgers.

**No auto-creation.** The system **never** creates a ledger on the user's behalf. Ledger creation always requires explicit user action, because creation captures inputs only a human can confirm — the month's Opening Balance and Max Capped (config defaults merely *prefill* the creation form; see [New ledger creation](#new-ledger-creation-user-initiated-within-the-window)). Since creation cannot run headlessly, there is no auto-open on the 1st. Instead, when a new month begins without a ledger, the system escalates from a soft window nudge to a persistent warning (see [Roll-forward warning](#roll-forward-warning) below).

**Which month is openable.**

- The **current calendar month** is always openable if no ledger exists for it. This covers a fresh start and the case where the user settled everything and later returns to a gap.
- The **next calendar month** becomes openable only during the **creation window** — the final `leadDays` days of the current month. Outside this window, the next month cannot be opened and the "New Ledger" action is unavailable.
- **No other month is openable.** The system never offers a far-future month or back-fills an arbitrary past month. A month that already has a ledger is blocked by the uniqueness constraint regardless.

`leadDays` is a user-configurable setting (`LedgerCreationWindow`, seeded like other config defaults) **clamped to the range 1–7, default 7**. It gives the user breathing room to finish the current month before opening the next.

**During the window, the current ledger stays `ongoing`.** The window only grants *permission* to open the next month. The current ledger transitions to `reconciling` at the exact moment the next ledger is created — not when the window opens. So a user can sit inside the window with the current month still `ongoing` and fully editable.

**Opening the next month never requires the current month to be clean.** Finishing the current month's pending envelopes before opening the next is the encouraged happy path — the system nudges toward it during the window — but it is **not enforced**. A user may open the next ledger with pending envelopes still outstanding; the current ledger simply moves to `reconciling` with those pendings intact (reconciliation has no deadline).

#### Roll-forward warning

If the user ignores the creation window and the new month begins with no ledger for it, the system does **not** act on their behalf. Instead:

1. The previous month's ledger **remains `ongoing`** — it does not transition automatically. (It moves to `reconciling` only when the user manually creates the next ledger.) An `ongoing` ledger may therefore belong to a month that has already ended.
2. **No envelopes are generated and no metrics roll forward** until the user opens the new month's ledger.
3. The system surfaces a **persistent, non-dismissible warning** on the finance hub urging the user to open the ledger now — e.g., *"July has started but has no ledger. Open it now to keep tracking this month's cashflow."* This is the same prominence tier as the negative ASM banner ([Section 5](#5-derived-metrics)): no dismiss button, and it remains until the user creates the ledger.

This trades the convenience of auto-creation for correctness: a ledger only ever exists with an Opening Balance and Max Capped the user has explicitly confirmed. The warning escalates the earlier window nudge — gentle while the user still has time, prominent once the month has turned over.

---

## 4. Lifecycle Workflows

### New ledger creation (user-initiated, within the window)

The user creates the next month's ledger during the **creation window** — the final `leadDays` days of the current month (see [Creation window & roll-forward](#creation-window--roll-forward)). Outside the window the action is unavailable; the current calendar month can always be opened if it has no ledger yet.

The user opens the new month through a **creation form** that captures the month's Opening Balance and Max Capped before the ledger is committed:

- If config defaults exist (`DefaultOpeningBalance`, `MaxCappedPolicy`), the form fields are **prefilled** with them. The user may accept or amend.
- If no defaults exist yet, the fields are **blank**. The user keys values in, and may optionally save them as defaults for future months (a non-obstructive opt-in — defaults are a convenience layer, never required).
- The same `maxCapped` guardrails enforced on edits apply here: amber-zone confirmation when Max Capped exceeds Opening Balance, hard block above 2× Opening Balance (see [Section 2](#2-entity-fields)).

On confirm, the system:

- Creates the new MonthlyLedger with `status = ongoing`, using the **confirmed** Opening Balance and Max Capped (the ledger owns these values thereafter — config changes never propagate)
- If a previous `ongoing` ledger exists, it automatically transitions to `reconciling`
- Copies all recurring Templates with `status = active` as new Envelopes with `status = pending`
- Pre-fills remarks from templates
- Envelopes are fresh — no carry-over items are auto-inserted. Template-linked carry-overs live on their parent templates; the user pulls them in when ready (see [Carry-Over Mechanics](#carry-over-mechanics) below)

If the user never acts within the window, **no ledger is created automatically.** When the new month begins without a ledger, the previous month's ledger stays `ongoing` and the system shows a persistent warning urging the user to open the new month immediately. See [Roll-forward warning](#roll-forward-warning).

#### System nudges during the window

While the creation window is open, the system surfaces a non-blocking nudge encouraging the user to resolve the current month's `pending` envelopes and open the next ledger. This keeps the happy path — close out, then roll forward — front of mind. The nudge never blocks: opening the next ledger with pendings still outstanding is permitted (they ride along into `reconciling`).

### During the month

- User opens the `ongoing` ledger, adjusts envelope amounts as needed, and marks envelopes paid as they go
- **Envelope status is free-form** while the ledger is `ongoing` or `reconciling` — any status can change to any other status. No state machine. The system handles side effects on every change (see [Envelope Status Transitions](#envelope-status-transitions) below). Statuses are locked only when the ledger reaches `settled`.
- **Envelope amounts are editable regardless of envelope status** (`pending`, `paid`, `skipped`, `carried-over`) while the ledger is `ongoing`. Bills change, charges surprise — the user must be able to correct the pocket to match reality at any time. Amounts are locked only when the ledger reaches `settled`.
- Each change updates COL, Health Margin, and ASM Contribution live
- _(Future — Finance Analytics)_ Envelope amount changes relative to prior months are captured as variance events for analytics. No in-ledger alerts or prompts — the user updates amounts freely. Threshold definitions and surfacing belong to the Finance Analytics module (Finance Product team scope). See resolved RFC-007.

#### Amendment awareness (template-linked envelopes)

For envelopes created from a Template (recurring or adhoc), the system tracks drift. For recurring templates, it also enforces decision-making via the sync prompt:

- **`originalAmount`** — set at envelope creation from the template's `defaultAmount`. Immutable. When `amount ≠ originalAmount`, the UI shows an inline variance indicator (e.g., `↑ +$35.00` or `↓ −$12.00`). Applies to both `recurring` and `adhoc` template types — any template-linked envelope gets variance awareness. Manually created envelopes (no `templateId`) have no `originalAmount` (null) and no variance display.

- **Template sync prompt** — when the user changes a template-linked envelope's `amount` to a value different from the template's current `defaultAmount`, the system presents a **blocking prompt**:
  - **"Update template"** → updates the template's `defaultAmount` to the new amount. Future ledgers use the new number.
  - **"This month only"** → leaves the template unchanged. Only this envelope is affected.
  - The prompt is **not dismissible** — the user must choose. This prevents months of stale template defaults from silent drift.
  - The prompt does not fire for manually created envelopes (no `templateId`), for adhoc-template-linked envelopes (`template.type == 'adhoc'`), when the amount is changed back to match the template's `defaultAmount`, or when the linked template has been deleted (orphaned `templateId` — no template to compare against or update).

### Reconciliation (previous month)

While working in the current `ongoing` ledger, the user can visit the `reconciling` ledger at any time to finalize the previous month:

- **Envelope amounts remain editable** in `reconciling` — the user may discover actuals that differ from what was set aside. Same rule as `ongoing`: any envelope status, any amount change, until the ledger is `settled`. The template sync prompt also fires during reconciliation.
- Review unpaid envelopes — **user must manually resolve each one**: mark as `paid`, `skipped`, or `carried-over`
- When marking an envelope as `carried-over`, a **blocking prompt** requires the user to provide a `carryOverReason` (mandatory, not dismissible — same UX pattern as the template sync prompt). If the envelope is template-linked, the carry-over is routed to the parent template's carry-over panel (see [Carry-Over Mechanics](#carry-over-mechanics) below). If manually created (no `templateId`), the envelope simply stays in the ledger with `carried-over` status — no routing occurs.
- Reconcile: compare the previous month's actual closing balance against the current `ongoing` ledger's opening balance and flag any delta for the user to adjust
- No deadline — the `reconciling` ledger waits until the user is ready
- **System nudge:** The system surfaces reminders that unresolved `pending` envelopes in a `reconciling` ledger block accurate recurring template tracking — `occurrencesRemaining` only updates when an envelope is marked `paid` (see [`template.md`](template.md), Section 3). Until the user resolves each envelope, the template's fulfillment count is incomplete. Templates that have reached `endMonth` cannot transition to their terminal state while linked envelopes remain unresolved. The data remains correct — the system simply waits — but the user should be urged to complete reconciliation.

### Carry-Over Mechanics

Carry-over behavior differs based on whether the envelope is **template-linked** or **manually created**.

- **Template-linked envelopes** (`templateId` is not null): carry-over routes to the parent template's carry-over panel. The template owns the obligation lifecycle — the user manages outstanding carry-overs from the template, not the ledger.
- **Manually created envelopes** (`templateId` is null): `carried-over` is a terminal status on the ledger. The envelope stays in place. No routing, no staging panel, no further system action. The ledger records the user's decision and moves on.

#### Marking carry-over (source ledger)

When the user marks an envelope as `carried-over`:

1. A **blocking prompt** requires a `carryOverReason` (mandatory, not dismissible, minimum 10 characters).
2. The envelope's status is set to `carried-over` in the source ledger.
3. **If template-linked:** the carry-over entry is routed to the parent template's carry-over panel (see [`template.md`](template.md), Section 6.6). The template now tracks this as an outstanding obligation.
4. **If manually created:** nothing else happens. The envelope remains in the ledger with `carried-over` status. The user has made their decision — the system records it.

The `carryOverReason` is **editable at any time** — the user can refine or update the reason as context changes. However, it can never be emptied or set below the 10-character minimum. Once set, the field must always contain a valid reason.

#### Adding carry-overs to a ledger (template-linked only)

Adding a carry-over from a template's panel **requires an ongoing ledger**. If no ongoing ledger exists, the action is blocked — the system tells the user: "No ongoing ledger — create one first." The carry-over stays on the template's panel until a ledger is available.

When the user adds a carry-over from a template's panel into an ongoing ledger, a new envelope is created:

| Field | Value | Notes |
|---|---|---|
| `status` | `pending` | Fresh start — needs to be dealt with this month. |
| `amount` | Copied from source | Freely editable — the envelope is independent after creation. |
| `carriedFromEnvelopeId` | Source envelope's ID | Back-reference for display ("carried from Jun"). Signals dirty origin. |
| `carryOverReason` | User's mandatory reason | Copied from the carry-over action. Editable at any time (minimum 10 characters, cannot be emptied). Always visible. |
| `templateId` | Kept from source | Retains `templateId`. When paid, it counts toward the template's fulfillment. |
| `originalAmount` | Kept from source | Variance tracking continues naturally. |

#### Visual distinction

Envelopes added from carry-over are visually distinct from fresh envelopes — badge, styling, or indicator — so the user can tell them apart. For example, if both "DBS Reno Loan $458 (carried from Jun)" and "DBS Reno Loan $458 (fresh)" exist in the same ledger, the carried-over one is clearly marked as such. This "dirty" visual state motivates discipline and discourages habitual carry-over.

The `carriedFromEnvelopeId` field on the envelope signals carried-over origin. Any envelope with this field set is displayed with the dirty indicator.

#### Carry-over and recurring templates

- `carried-over` does NOT count as `paid`. The template's `occurrencesRemaining` is unaffected — only `paid` decrements (see [`template.md`](template.md), Section 3).
- The carried-over envelope **retains its `templateId`**. If the same recurring template generates a fresh envelope in the target month AND a carry-over is added from the template's panel, the user sees two separate envelopes — both with the same `templateId`. This correctly represents two obligations (e.g., May's deferred loan payment + June's scheduled payment).
- Outstanding carry-overs are visible on the template's carry-over panel. The system shows the truth.
- If a template reaches `endMonth` while carry-over envelopes are still outstanding, the template enters `pending_reconciliation` status — it stops generating but does not close until the user resolves all outstanding COs (see [`template.md`](template.md), Section 3.1).

#### What the new ledger does NOT know

A new ledger starts clean. It contains only fresh envelopes — auto-generated from recurring templates and manually inserted by the user (from adhoc templates or ad-hoc creation). The ledger has **no carry-over staging panel** and no awareness of outstanding carry-overs from previous months.

To see and act on carry-overs, the user goes to the relevant template's carry-over panel. From there, they can selectively add carry-overs to any ongoing ledger. The template is the home for outstanding obligations — not the ledger.

#### Multiple reconciling ledgers

Multiple `reconciling` ledgers may accumulate if the user does not settle them. This is the user's choice — the system does not force discipline, it surfaces truth. Carry-overs marked in any reconciling ledger route to their parent template's panel immediately.

### Envelope Status Transitions

Envelope status is **free-form** — any status can change to any other status while the ledger is `ongoing` or `reconciling`. No state machine. The system recalculates all derived values (COL, template fulfillment) on every change and handles side effects per transition.

| Ledger status | Allowed transitions |
|---|---|
| `ongoing` | Any → Any |
| `reconciling` | Any → Any (unless the envelope's carry-over has been acted on — see [Acted-on locking](#acted-on-locking) below) |
| `settled` | None (locked) |

#### Side-effect rules

| Transition | Side effects |
|---|---|
| `paid` → anything else | Clear `paidAt` to null. Template fulfillment (`occurrencesRemaining`) recalculates. COL recalculates. |
| anything → `paid` | Set `paidAt` to current timestamp. Template fulfillment recalculates. |
| `carried-over` → anything else (template-linked) | Remove the entry from the template's carry-over panel. **Blocked** if the carry-over has already been acted on (added to a ledger or killed). |
| `carried-over` → anything else (manually created) | Simply revert status. No side effects. |
| anything → `carried-over` (template-linked) | Blocking `carryOverReason` prompt. Entry routed to template's carry-over panel. |
| anything → `carried-over` (manually created) | Blocking `carryOverReason` prompt. Terminal status on the ledger. |
| `skipped` → `pending` or `paid` | Envelope re-enters COL calculation. If changing to `paid`, `paidAt` is set. |

#### `paidAt` behavior

`paidAt` always reflects the most recent payment action:
- Set to current timestamp when status changes to `paid`
- Cleared to null when status changes away from `paid`
- If the envelope goes `paid` → `pending` → `paid`, `paidAt` gets a fresh timestamp on the second payment

#### Acted-on locking

The envelope status and the template's carry-over panel are **always in sync**. When a template-linked envelope is marked `carried-over`:

- **Carry-over NOT yet acted on** (still in the template's panel): the user can freely revert the envelope to any other status. The panel entry is removed on revert.
- **Carry-over already acted on** (added to another ledger or killed at the template): the envelope's status is **locked** as `carried-over`. The user cannot revert it — the downstream action has already occurred. The envelope is visually disabled for status changes.

This applies in both `ongoing` and `reconciling` ledgers. During reconciliation, the system only surfaces envelopes that need a decision — envelopes whose carry-overs have been acted on are done and visually indicate no further action is needed.

### Template Termination Side-Effects on Ledgers

When a recurring template is **terminated** (see [`template.md`](template.md), Section 6), the system removes all unresolved envelopes linked to that template from `reconciling` ledgers. Specifically:

- Envelopes with `templateId` matching the terminated template and `status != paid` in any `reconciling` ledger are **removed from the ledger**.
- Envelopes already `paid` are untouched — they are historical records.
- Envelopes in `ongoing` ledgers are untouched — the user manages them manually (they become orphaned `templateId` references, same as any deleted template).
- Envelopes in `settled` ledgers are untouched — settled is immutable.

This ensures the terminated template leaves no unresolved obligations lingering in reconciliation. The termination is a clean cut.

### Settlement

The transition from `reconciling` → `settled` is user-initiated and protected by a **strict gate** — the system blocks settlement until all pre-conditions are met. There is no override or force-settle. The `reconciling` state has no deadline, so the user has unlimited time to get the ledger into a settleable state.

#### Settlement pre-conditions

| # | Rule | What it means |
|---|---|---|
| 1 | **No `pending` envelopes remain** | Every envelope must have a terminal status (`paid`, `skipped`, or `carried-over`). The user must make an explicit decision on every line item. |

`carried-over` is a **resolved status** from the ledger's perspective — the user has made a decision (defer this obligation). Template-linked carry-overs are already routed to their parent template's panel; manually created carry-overs are terminal in the ledger. Either way, the ledger is ready to close.

The system does **not** enforce: minimum `paid` count, mass-skip detection, financial reconciliation checks, calendar timing constraints, or $0 amount validation. The system shows truth — the user decides. If every envelope is `skipped`, the metrics (COL = 0, ASM Contribution = Opening Balance) reflect that honestly.

#### On settlement

- System sets `settledAt` timestamp
- System snapshots final derived metrics (COL, Health Margin, ASM Contribution, envelope counts by status) as a **settlement summary** — a frozen record for historical reference
- Ledger transitions to `settled` — locked and immutable from this point forward
- Template tracking is clean: `paid` envelopes decrement `occurrencesRemaining`, `skipped` and `carried-over` do not. No ambiguity because no `pending` envelopes exist at settlement time. Outstanding carry-overs are the template's responsibility — the ledger has done its job.

---

## 5. Derived Metrics

Computed live on every read of a MonthlyLedger.

| Metric               | Formula                                      | Meaning                                   |
| -------------------- | -------------------------------------------- | ----------------------------------------- |
| **COL**              | Σ(envelope.amount) where status is `pending` or `paid` | Total set-aside pockets for the month     |
| **Health Margin**    | MaxCapped − COL                              | Room under the ceiling (discipline gauge). Negative = over self-imposed ceiling. |
| **ASM Contribution** | Opening Balance − COL                        | Residual flow to savings (real money)     |
| **Outstanding**      | count + sum of `pending` envelopes           | What's left to handle this month          |
| **Amendments**       | count + net delta of envelopes where `amount ≠ originalAmount` | How much reality diverged from template defaults (template-linked envelopes only) |

### Negative ASM Contribution handling

When `ASM Contribution < 0` (COL exceeds Opening Balance — the user is committing more than their income), the system applies **informed friction**:

- **ASM Contribution number displays in red** — standard negative formatting.
- **Persistent, non-dismissible banner** on the ledger: *"You've committed $X more than this month's income."* The banner remains until COL drops below Opening Balance. No dismiss button — the system shows truth persistently.

This is more prominent than a simple red number because negative ASM is a more severe signal than negative Health Margin — Health Margin measures discipline against a self-imposed ceiling; negative ASM means real money is being overspent. The amber-zone confirmation on `maxCapped` edits (see [Section 2](#2-entity-fields)) catches the root cause; the red-zone banner catches the symptom.

The system does **not** block envelope additions when ASM Contribution is negative. Legitimate overspend scenarios exist (emergency repairs, one-time large purchases from savings). The system shows truth — the user decides.

### Worked example — User's Jan 2027 ledger

- Opening Balance: **$7,152.35**
- COL: **$4,307.28**
- Max Capped: **$6,415.00**
- Health Margin: $6,415.00 − $4,307.28 = **$2,107.72** ✓
- ASM Contribution: $7,152.35 − $4,307.28 = **$2,845.07** ✓

These match the reference Google Sheet exactly. Any implementation that produces different numbers for the same inputs is wrong by definition.

### Why two metrics — Health Margin vs ASM Contribution

These two formulas look superficially similar but answer different questions, and conflating them was the most consequential error in the v0.1 drafting process (they were originally written with their meanings swapped). Both must exist as distinct metrics.

**Health Margin = MaxCapped − COL** is a _discipline gauge_. It measures how much room remains under the ceiling the user set for themselves this month. It can be negative (over the ceiling, triggering warnings). It says nothing about cash on hand — MaxCapped is a self-imposed rule, not a cash quantity. The user can lower MaxCapped to tighten discipline without their actual income changing.

**ASM Contribution = Opening Balance − COL** is _real money_. It is the residual cash after planned envelopes — the amount that flows to the ASM Fund at month close. This is a literal accounting figure; it is what gets transferred.

**Structural relationship — three cases.** Three relationships are possible between MaxCapped and Opening Balance, each meaning something different to the user:

1. **MaxCapped < Opening Balance** _(current user setup)_ — structural savings floor exists. ASM Contribution > Health Margin. The gap between Opening Balance and MaxCapped is **guaranteed** to reach ASM regardless of envelope-level management within the cap.
2. **MaxCapped == Opening Balance** — no structural floor. Both metrics equal. Discipline is purely behavioral; nothing forces money to ASM beyond what's left over.
3. **MaxCapped > Opening Balance** — user is permitting themselves to spend more than income. Health Margin > ASM Contribution. The system should warn loudly here; this configuration breaks the discipline contract.

A single metric cannot represent all three states. Keeping them split makes the _structural-vs-actual_ distinction visible at every read of a ledger.

**Worked verification against the Jan 2027 example above:**

- Opening Balance $7,152.35, MaxCapped $6,415.00, COL $4,307.28
- Case 1 applies (MaxCapped < Opening Balance, by $737.07)
- ASM Contribution ($2,845.07) − Health Margin ($2,107.72) = $737.07 ✓
- That $737.07 is the structural savings floor — money that reaches ASM no matter how the user manages envelopes within the cap.

---

## 6. Invariants

These MUST always hold; the system enforces them.

- `COL = Σ(envelope.amount for all envelopes where status is pending or paid)`
- `Health Margin = MaxCapped − COL` _(headroom under self-imposed ceiling — a discipline gauge)_
- `ASM Contribution = Opening Balance − COL` _(literal residual to savings — real money)_
- Once a ledger is `settled`, envelopes are read-only. There is no reopen — settled is final.
- **Opening Balance is fixed for the month.** Adjustments require explicit action and are logged.
- **One ledger per financial month.** The system enforces a uniqueness constraint on the `month` field.
- **One `ongoing` ledger at any time.** Creating a new ledger automatically transitions the previous `ongoing` ledger to `reconciling`.
- **Bounded creation.** Only the current calendar month (always) or the next calendar month (during the creation window — the final `leadDays` days of the current month) may be opened. No far-future or arbitrary back-filled months. `leadDays` is configurable, clamped to 1–7, default 7.
- **No auto-creation.** The system never creates a ledger automatically. Ledger creation always requires explicit user action and confirmation of Opening Balance / Max Capped. If a new month begins with no ledger, the previous `ongoing` ledger stays `ongoing` (it may belong to an already-ended month) and the system shows a persistent, non-dismissible warning urging the user to open the new month. Creating the next ledger is what transitions the previous `ongoing` ledger to `reconciling`.

---

## 7. Relationship to Other Entities

```
MonthlyLedger
    │
    │  owns
    ▼
Envelope[] (one per line item)
    │
    │  may link back to
    ▼
Template (via templateId — recurring or adhoc)
```

- **MonthlyLedger → Envelope:** One-to-many. A ledger owns all its envelopes.
- **MonthlyLedger → DefaultOpeningBalance:** Config seeds the `openingBalance` value at creation; the ledger owns it thereafter. No runtime dependency on config.
- **MonthlyLedger → MaxCappedPolicy:** Config seeds the `maxCapped` value at creation; the ledger owns it thereafter. No runtime dependency on config.
- **MonthlyLedger → LedgerCreationWindow:** Config supplies `leadDays` (clamped 1–7, default 7), which governs when the next month's ledger may be opened (the creation window) and when the roll-forward warning escalates. A live setting read at creation time — not copied onto the ledger.
- **MonthlyLedger uniqueness:** One ledger per `month`. System-enforced.
- **MonthlyLedger `ongoing` constraint:** At most one `ongoing` ledger at any time. Creating a new one auto-transitions the previous.

---

## Revision History

| Version | Date       | Author            | Changes |
| ------- | ---------- | ----------------- | ------- |
| 0.23    | 2026-06-27 | NafiOS Foundation | **Clarified `month` storage representation.** Documented that `month` is identified conceptually as `YYYY-MM` but physically stored as a first-of-month `DATE` (e.g., `2026-06-01`). Year is always part of the stored value, so the same month in different years (Jun 2026 vs Jun 2027) are distinct under the `(user_id, month)` uniqueness constraint — no separate `year` field, no collision. Recorded rationale for `DATE` over `YYYY-MM` string (interval math, ordering, range queries, `date_trunc` interop) and the `CHECK (month = date_trunc('month', month))` invariant. Aligns spec with `finance-schema.dbml`. |
| 0.22    | 2026-06-01 | NafiOS Foundation | **No auto-creation + roll-forward warning + creation form.** Removed the auto-open safety net entirely — the system never creates a ledger headlessly. Rationale: creation now captures the month's Opening Balance and Max Capped via a creation form (config defaults only *prefill*; user confirms or amends; maxCapped guardrails reused), which requires a human in the loop. When a new month begins with no ledger, the previous ledger stays `ongoing` and a persistent, non-dismissible roll-forward warning urges the user to open the new month (same prominence tier as the negative ASM banner). Renamed §3 subsection "Creation window & auto-open" → "Creation window & roll-forward"; updated transition table, §4 creation workflow, invariants, and relationship section. |
| 0.21    | 2026-06-01 | NafiOS Foundation | **Ledger creation window & auto-open.** Replaced "Why no auto-creation on the 1st" with a bounded creation model: the next month is openable only during the final `leadDays` days of the current month (configurable, clamped 1–7, default 7); the current month is always openable if it has no ledger; no far-future or back-filled months. Added auto-open safety net — if an `ongoing` ledger exists and the user ignored the window, the system auto-transitions it to `reconciling` and opens the next month on the 1st, with notification. Opening the next month never requires the current month to be clean (encouraged via nudge, not enforced). Auto-open does not fire with no `ongoing` ledger and never settles. Added `LedgerCreationWindow` config relationship and two invariants. |
| 0.20    | 2026-05-28 | NafiOS Foundation | **Negative ASM Contribution handling (Informed Friction).** Three-tier approach: (1) Green zone — normal, no friction. (2) Amber zone — blocking confirmation when `maxCapped` edited above `openingBalance`, showing savings draw amount. (3) Red zone — persistent non-dismissible banner when ASM Contribution < 0. Hard block on `maxCapped` above 2× Opening Balance to catch input errors. System does not block envelope additions — shows truth, user decides. Resolves RFC-022. |
| 0.19    | 2026-05-28 | NafiOS Foundation | **No-ongoing-ledger guard for carry-over addition.** Adding a carry-over from a template's panel is blocked if no ongoing ledger exists — system tells user to create one first. Carry-over stays on the template panel until a ledger is available. Resolves RFC-021. |
| 0.18    | 2026-05-28 | NafiOS Foundation | **Template termination side-effects.** When a recurring template is terminated, unresolved envelopes (status != paid) linked to that template in `reconciling` ledgers are removed. Paid envelopes, ongoing ledger envelopes, and settled ledger envelopes are untouched. Resolves RFC-020. |
| 0.17    | 2026-05-27 | NafiOS Foundation | **Envelope status transition rules.** Free-form transitions (any → any) while ledger is `ongoing` or `reconciling`. Locked at `settled`. Side-effect rules defined per transition: `paidAt` cleared/set on payment changes, template carry-over panel synced on carry-over changes, COL and template fulfillment recalculate on every change. Acted-on locking: if a template-linked carry-over has been acted on (added to a ledger or killed), the source envelope's status is locked. Resolves RFC-018. |
| 0.16    | 2026-05-27 | NafiOS Foundation | **Template-centric carry-over model.** Carry-over for template-linked envelopes now routes to the parent template's carry-over panel — not a staging panel on the target ledger. Manually created envelopes treat `carried-over` as a terminal ledger status (no routing). Removed ledger-level carry-over staging panel, target resolution rules, and panel rules. Settlement pre-conditions simplified to a single gate: no `pending` envelopes remain. `carried-over` is a resolved status from the ledger's perspective. |
| 0.15    | 2026-05-25 | NafiOS Foundation | **Carry-over target resolution.** Carry-over entries always target the current `ongoing` ledger, not the literal next month. When multiple reconciling ledgers accumulate, carry-overs skip intermediate months and land where the user is actively working. The `carryOverReason` and `carriedFromEnvelopeId` provide full traceability without pass-through bookkeeping. Resolves RFC-016. |
| 0.14    | 2026-05-25 | NafiOS Foundation | **Recurring template status lifecycle cross-ref.** Updated references from `active` boolean to `status` enum. Added `pending_reconciliation` cross-reference in carry-over section. Updated system nudge to mention templates blocked from terminal transition. Resolves RFC-015. |
| 0.13    | 2026-05-25 | NafiOS Foundation | **Cross-spec alignment pass.** Fixed carry-over table — "Null if ad-hoc" replaced with "Null if source was manually created (no template)" to avoid ambiguity with adhoc template type. Fixed amendment awareness section header — now says "recurring or adhoc" not just "recurring." Added DefaultOpeningBalance to relationship section. |
| 0.12    | 2026-05-25 | NafiOS Foundation | **Cross-spec alignment fixes.** Fixed `originalAmount` wording — now correctly states variance applies to both recurring and adhoc template types; only manually created envelopes (no `templateId`) have null `originalAmount`. Added orphaned template rule to sync prompt conditions. Added `maxCapped` locked-in-reconciling rationale. |
| 0.11    | 2026-05-25 | NafiOS Foundation | **Settlement pre-conditions defined.** Strict gate with two hard-block rules: (1) carry-over staging panel must be empty, (2) no `pending` envelopes may remain. No override or force-settle. Settlement snapshots final derived metrics as a frozen summary. Explicitly rejected candidates: minimum paid count, mass-skip detection, financial reconciliation gate, calendar timing, $0 validation. Resolves RFC-012. |
| 0.10    | 2026-05-25 | NafiOS Foundation | **Updated references for unified Template entity.** Renamed RecurringTemplate references to Template throughout. Template sync prompt now explicitly excludes adhoc-template-linked envelopes. Updated cross-references to `template.md`. |
| 0.9     | 2026-05-25 | NafiOS Foundation | **Deferred variance alerts to Finance Analytics module.** Removed in-ledger variance alert behavior. Envelope amount shifts will be captured as variance events for future analytics — threshold definitions and UX belong to the Finance Analytics module (Finance Product team). No in-ledger alerts in current scope. Resolves RFC-007. |
| 0.8     | 2026-05-25 | NafiOS Foundation | **Added `createdAt` timestamp.** Ledger records when it was created (entered `ongoing`). Immutable after creation. `reconcilingAt` intentionally omitted — derivable from the next ledger's `createdAt`. Resolves RFC-006. |
| 0.7     | 2026-05-25 | NafiOS Foundation | **Removed `notes` field.** Ledger-level free-text journal removed — all annotation lives per-envelope via `remark`. Resolves RFC-005. |
| 0.6     | 2026-05-25 | NafiOS Foundation | **Cross-spec alignment review.** Removed duplicate "Max Capped delta" derived metric (identical formula to Health Margin — consolidated into Health Margin row with "negative = over ceiling" note). Fixed stale "ordered by priority" language to "organized by category" (priority semantics were removed in domain spec v0.6). Updated COL formula and invariant to explicitly include only `pending` and `paid` envelopes — `carried-over` envelopes are now excluded. |
| 0.5     | 2026-05-24 | NafiOS Foundation | **Carry-over mechanics.** Defined two-phase carry-over flow: mandatory `carryOverReason` blocking prompt on mark, staging panel on target ledger (no auto-insert), explicit user actions (add/kill/carry-over again). Envelopes added from carry-over retain `templateId` and `originalAmount` from source, plus `carriedFromEnvelopeId` and `carryOverReason` for traceability. Visual "dirty" distinction for carried-over envelopes. Panel must be cleared before settling. Resolves RFC-004. |
| 0.4     | 2026-05-24 | NafiOS Foundation | **Amendment awareness.** Added `originalAmount` variance tracking for template-linked envelopes, inline variance indicator, Amendments derived metric, and template sync prompt (blocking two-option dialog). Resolves RFC-011. |
| 0.3     | 2026-05-24 | NafiOS Foundation | **Envelope amounts editable regardless of status.** Explicitly stated that envelope `amount` is editable while the ledger is `ongoing` or `reconciling`, regardless of envelope payment status (`pending`, `paid`, `skipped`, `carried-over`). Amounts lock only at `settled`. Added editability statement to both "During the month" and "Reconciliation" workflow sections. |
| 0.2     | 2026-05-24 | NafiOS Foundation | **MaxCapped as ledger-owned field.** Added `maxCapped` to entity fields. Documented config-seeded, ledger-owned pattern for both `openingBalance` and `maxCapped`. `maxCapped` is editable while `ongoing`, locked in `reconciling` and `settled`. Updated ledger creation workflow to copy Max Capped from config. Updated relationship section. Resolves RFC-003. |
| 0.1     | 2026-05-24 | NafiOS Foundation | Initial extraction from `finance-domain-spec.md`. Ledger status lifecycle, workflows, derived metrics, invariants, carry-over behavior. |
