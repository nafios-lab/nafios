# Template Spec

> **Status:** Draft · **Parent Spec:** `finance-domain-spec.md` (Section 4, Core Entities) · **Last Updated:** 2026-05-28

---

## 1. What is a Template?

A Template is a **reusable definition that creates Envelopes**. It captures the details of an expense — item name, category, amount, remark, payment source — so the user doesn't have to re-enter them from scratch each time.

Templates come in two types:

| Type | Purpose | How envelopes are created |
|---|---|---|
| **`recurring`** | Standing instruction for repeating obligations | **Auto-generated** into every new ledger by the system |
| **`adhoc`** | Reusable blueprint for occasional expenses | **User-initiated** — manually inserted from a library |

A template is **not** an envelope itself. It is a factory (recurring) or a blueprint (adhoc) that produces envelopes. Once an envelope is created from a template, the envelope is independent — the user can adjust its amount, remark, or status without affecting the template.

### Examples

| Template | Type | Why this type |
|---|---|---|
| Netflix | `recurring` | Monthly subscription — auto-generates every month |
| DBS Reno Loan | `recurring` | Debt repayment — 24 fixed payments |
| Property Tax (GIRO) | `recurring` | Tax installment — repeats on schedule |
| Car Servicing | `adhoc` | ~2x/year, irregular timing — user inserts when needed |
| Hari Raya Prep | `adhoc` | Annual but variable — user decides when to budget |
| Home Appliance Replacement | `adhoc` | One-off with repeat pattern — not on a schedule |

---

## 2. Shared Configuration — Data Points

These fields exist on **every** template, regardless of type.

### Identity

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | enum | Yes | `recurring` or `adhoc`. Set at creation, **immutable** — see [Section 7.5](#75-no-type-change-between-recurring-and-adhoc--decided). |
| `item` | string | Yes | Name of the expense (e.g., "Netflix", "Car Servicing") |
| `category` | Category ref | Yes | Which category this belongs to |
| `sortOrder` | integer | No | Display position within the category. Inherited by generated/inserted envelopes. Defaults to append order. |

### Defaults (pre-fill into each created envelope)

| Field | Type | Required | Description |
|---|---|---|---|
| `defaultAmount` | decimal | Yes | The standard/typical amount for this expense |
| `defaultRemark` | string | No | Operational knowledge (e.g., "6th every month", "Book at Tan Chong") |
| `defaultPaymentSource` | Account ref | No | Which account this is typically paid from |
| `defaultLinkedPerson` | Person ref | No | Family member this expense is tied to |

---

## 3. Type-Specific Configuration

### Recurring-only fields

These fields exist **only** on `type: recurring` templates. They are absent/irrelevant for `adhoc`.

#### Schedule

| Field | Type | Required | Description |
|---|---|---|---|
| `nextDueMonth` | month (YYYY-MM) | Yes | **Cursor.** The next month this template should generate an envelope. Advances automatically after each generation — see [Section 4](#4-how-templates-create-envelopes). |

> **Note:** Frequency is implicitly `monthly` — the system is monthly-ledger-first. If non-monthly frequencies are needed in the future, a `frequency` field can be introduced then.

#### Lifecycle

| Field | Type | Required | Description |
|---|---|---|---|
| `status` | enum | Yes | `active` / `pending_reconciliation` / `completed` / `terminated`. Controls generation behavior and lifecycle state. Defaults to `active` on creation. See [Section 3.1](#31-recurring-template-status-lifecycle) for transitions. |
| `terminationReason` | string | No | Required when terminating. Records why the user stopped this template before its natural end (e.g., "Paid off early", "Refinanced with OCBC", "Cancelled subscription"). `null` unless terminated. |

#### End Condition

| Field | Type | Required | Description |
|---|---|---|---|
| `endMonth` | month (YYYY-MM) | No | **Source of truth.** The last month this template should generate an envelope. `null` = indefinite (subscriptions, utilities). |
| `occurrencesRemaining` | integer | — | Number of payments remaining. Present on the template entity as a data point. How it is derived/stored is an implementation decision. |

**UX input methods** — the user can set the end condition via two paths:

1. **By date:** User sets `endMonth` directly (e.g., "ends June 2027").
2. **By count:** User enters number of occurrences (e.g., "24 payments"). The system calculates `endMonth` from `nextDueMonth` + count, and stores the result as `endMonth`.

Either way, `endMonth` is what the system stores and checks. The count input is a UX convenience, not a separate stored field.

**`occurrencesRemaining`** is derived from `endMonth`, the current month, and the count of envelopes with `status = paid` linked to this template. It is a data point on the entity for reading/display purposes. Physical storage and derivation strategy is an implementation decision.

**End-of-schedule rule:** When the current month exceeds `endMonth`, the system stops generating envelopes. If no outstanding carry-over envelopes exist, the template transitions to `completed`. If outstanding carry-overs exist, the template transitions to `pending_reconciliation` — see [Section 3.1](#31-recurring-template-status-lifecycle). The user can also **terminate** the template at any time — see [Section 6](#6-user-workflows), Terminating a recurring template.

**Skipped and carried-over envelopes do not decrement.** Only envelopes with `status = paid` count toward fulfillment. If the user skips or carries over a month, the obligation is still outstanding — `occurrencesRemaining` stays the same. Carried-over envelopes retain their `templateId`, so when eventually paid in a future ledger they count toward the template's fulfillment (see [`monthly-ledger.md`](monthly-ledger.md), Carry-Over Mechanics).

### 3.1 Recurring Template Status Lifecycle

A recurring template has four statuses:

```
active → completed                   (endMonth exceeded, no outstanding carry-overs)
active → pending_reconciliation      (endMonth exceeded, outstanding carry-overs exist)
active → terminated                  (user terminate, with mandatory reason → archived)
pending_reconciliation → completed   (all COs resolved — paid or killed)
pending_reconciliation → terminated  (user terminate, with mandatory reason → archived)
```

| Status | Meaning | Generates envelopes? | Visible in |
|---|---|---|---|
| `active` | Normal operation — generates envelopes on ledger creation | Yes | Main template list |
| `pending_reconciliation` | `endMonth` exceeded but outstanding carry-over envelopes exist. The template is waiting for those COs to be resolved before it can close. | No | Main template list |
| `completed` | Natural end — template finished its schedule and all obligations are resolved. Historical record. | No | Main template list |
| `terminated` | User early-terminated. Soft-deleted to archive with mandatory reason. All in-flight items (COs, unresolved envelopes) are removed. | No | Archive only |

> **No pause/resume.** Once a recurring template is active, it runs until natural completion or user termination. If the user no longer wants this obligation, they terminate it (with a reason). If the obligation resumes later, they create a new template (consistent with Decision 7.7 — no reactivation).

#### `pending_reconciliation` behavior

When a template reaches `endMonth` and the system detects outstanding carry-over envelopes (envelopes with `status != paid` that retain this template's `templateId`), the template enters `pending_reconciliation` instead of `completed`. In this state:

- **No new envelopes are generated.** The template has finished its generation schedule.
- **The system notifies the user** (via the cross-cutting notification system — see Decision 7.4) that this template has outstanding carry-overs requiring a decision.
- **The user must choose per outstanding CO:**
  1. **Kill outstanding** (with mandatory reason) — the CO is dismissed. When all COs are resolved, the template transitions to `completed`.
  2. **Pay the CO** — the carried-over envelope is eventually paid in a future ledger. When all COs are paid, the template auto-transitions to `completed` (clean completion).

The user can also **terminate** the template at any time from `pending_reconciliation`, which removes all outstanding COs and moves the template to the archive — see [Section 6](#6-user-workflows), Terminating a recurring template.

#### `terminated` and archive

`terminated` is a terminal status. The template is **soft-deleted into an archive** — a separate view from the main template list. In the archive:

- The template is **read-only**. The user can view the template's configuration, history, and `terminationReason`.
- **Hard delete** is available only from the archive. This permanently destroys the template record.
- **No resume.** A terminated template cannot be reactivated. If the obligation returns, the user creates a new template (consistent with Decision 7.7). Resume may be considered in a future phase.

#### Completion states (display-level, not separate statuses)

`completed` is a terminal status for naturally-ended templates. Whether the completion was fully clean is a **derived display state**, not a separate status:

| Display state | Condition | Visual |
|---|---|---|
| **Completed cleanly** | All generated envelopes resolved. `occurrencesRemaining` is 0 (or template is indefinite). No outstanding carry-overs at the time of completion. | Green — clean completion indicator. |
| **Completed with gaps** | Template completed naturally but some payments were missed (envelopes killed, skipped without payment) — `occurrencesRemaining > 0`. | NOT green. System highlights the discrepancy so the user understands the obligation was not fully fulfilled. |

---

### Adhoc-only fields

These fields exist **only** on `type: adhoc` templates. They are absent/irrelevant for `recurring`.

| Field | Type | Required | Description |
|---|---|---|---|
| `archived` | boolean | Yes | `true` = hidden from the active library. Not deleted — remains for historical reference and can be unarchived. Defaults to `false` on creation. |
| `lastUsedMonth` | month (YYYY-MM) | No | The most recent ledger month this template was inserted into. System-managed. `null` if never used. |
| `usageCount` | integer | Yes | Number of times this template has been used to create an envelope. System-managed. Starts at `0`. |

---

## 4. How Templates Create Envelopes

### Recurring: auto-generation

#### Trigger — ledger creation (primary)

When the user creates a new MonthlyLedger, the system:

1. Queries all Templates where `type == 'recurring'` AND `status == 'active'` AND `nextDueMonth <= ledger.month`
2. For each matching template, creates a new Envelope in the ledger with:
   - `category` <- template.category
   - `sortOrder` <- template.sortOrder
   - `item` <- template.item
   - `amount` <- template.defaultAmount
   - `originalAmount` <- template.defaultAmount
   - `remark` <- template.defaultRemark
   - `paymentSource` <- template.defaultPaymentSource
   - `linkedPerson` <- template.defaultLinkedPerson
   - `templateId` <- template.id
   - `status` <- `pending`

#### Trigger — template creation (into existing ongoing ledger)

When the user creates a new recurring template, the system checks for an existing `ongoing` ledger:

1. If an `ongoing` ledger exists AND `nextDueMonth <= ongoing ledger.month`:
   - The system auto-generates an envelope into the ongoing ledger using the same field mapping as above.
   - The user set `nextDueMonth` to a month that is already open — the intent is clear: this obligation applies now.
2. If no `ongoing` ledger exists, OR `nextDueMonth > ongoing ledger.month`:
   - No envelope is generated. The template waits for the next `createLedger` call whose month matches.

#### After generation

- **`nextDueMonth` advances to `ledger.month + 1`.** This is the invariant: envelope created → cursor moves. The field acts as a cursor — once advanced, the template will not match the same month again. This provides natural idempotency (no duplicate envelopes from retries or race conditions). No back-filling of skipped months — if the user jumps from January to April, only April's envelope is generated and `nextDueMonth` advances to May.
- The envelope is **independent**. The user can change its amount, remark, status, etc. for that month without affecting the template.
- The system sets `originalAmount` on the generated envelope (snapshot of `defaultAmount` at creation time) for variance tracking.
- If the user updates the template's `defaultAmount`, future months get the new amount. Past envelopes are untouched.
- Deleting a template does NOT delete previously generated envelopes. They retain their `templateId` as a historical reference.

### Adhoc: user-initiated insert

#### Trigger — user selects from library (only trigger)

The user browses the adhoc template library and selects one (or more) to insert into the current `ongoing` ledger. The system creates a new Envelope with:

- `category` <- template.category
- `sortOrder` <- template.sortOrder
- `item` <- template.item
- `amount` <- template.defaultAmount
- `originalAmount` <- template.defaultAmount _(snapshot for variance awareness)_
- `remark` <- template.defaultRemark
- `paymentSource` <- template.defaultPaymentSource
- `linkedPerson` <- template.defaultLinkedPerson
- `templateId` <- template.id
- `status` <- `pending`

All pre-filled values are **editable** immediately — the user can adjust any field before or after insertion. The envelope is independent from the moment it is created.

**Constraint:** Insertion is only allowed into an `ongoing` ledger. If no ongoing ledger exists, the action is unavailable.

**Duplicate insertion:** The same adhoc template can be inserted **multiple times** into the same ledger. Each insertion creates a separate, independent envelope. This is intentional — some expenses legitimately occur more than once per month (e.g., car servicing, medical visits). Each envelope gets its own `originalAmount` snapshot and increments the template's `usageCount`.

#### What does NOT happen (adhoc only)

- **No auto-generation.** Adhoc templates are never queried during ledger creation. They do not participate in the `createLedger` flow.
- **No template sync prompt.** Changing an adhoc-template-linked envelope's amount does not trigger the "Update template / This month only" dialog. Adhoc templates are pre-fill convenience — the user expects amounts to vary each time.
- **No end condition.** There is no `endMonth`, `occurrencesRemaining`, or auto-deactivation. An adhoc template lives in the library indefinitely until the user archives or deletes it.

#### After insertion

- The system updates the template's `lastUsedMonth` to the ledger's month and increments `usageCount`.
- The envelope carries `templateId` as a back-reference for queryability (e.g., "show me all Car Servicing envelopes across all years").
- `originalAmount` is set, enabling variance awareness if the user adjusts the amount for this specific occurrence.

---

## 5. Template Sync (Recurring Only)

When the user changes a **recurring**-template-linked envelope's `amount` to a value different from the template's current `defaultAmount`, the system presents a **blocking prompt** with two options:

- **"Update template"** — sets the template's `defaultAmount` to the new amount. Future ledgers will generate envelopes with the updated value. Only `defaultAmount` is changed; no other template fields are affected.
- **"This month only"** — the template's `defaultAmount` is unchanged. The amendment applies only to this envelope in this ledger.

The prompt is mandatory (not dismissible). This prevents silent template drift — where a bill changes permanently but the template keeps seeding the old amount month after month, forcing repeated manual corrections.

The prompt does **not** fire when:
- The template is `type: adhoc` — adhoc templates are pre-fill convenience, not standing obligations
- The envelope has no `templateId` (manually created, not from any template)
- The amount is changed back to match the template's current `defaultAmount`
- The linked template has been **deleted** (orphaned `templateId`) — there is no template to compare against or update. The envelope retains its `templateId` as a historical reference, but sync behavior is inert.

---

## 6. User Workflows

### Creating a template

**Recurring:** User provides `item`, `category`, `defaultAmount`, `type: recurring`, `nextDueMonth`, and optionally the remaining fields. Template starts with `status = active` and will generate envelopes starting from `nextDueMonth`. If an `ongoing` ledger exists and `nextDueMonth` falls on or before that ledger's month, the system auto-generates an envelope into the ongoing ledger at creation time.

**Adhoc:** User provides `item`, `category`, `defaultAmount`, `type: adhoc`, and optionally the remaining fields. Template is immediately available in the library. No envelope is generated — the user inserts manually when ready.

### Editing a template

User can update any field at any time (except `type` — immutable). Changes only affect **future** envelope creations. Envelopes already created from this template are not modified.

### Inserting from the library (adhoc only)

1. User opens the adhoc template library (from the ongoing ledger's "add envelope" flow or a dedicated library view).
2. User selects one or more templates.
3. System creates envelopes in the ongoing ledger with pre-filled values.
4. User adjusts any values as needed.
5. System updates `lastUsedMonth` and `usageCount` on each used template.

### End-of-schedule — automatic (recurring only)

If `endMonth` is configured, the system automatically transitions the template when the current month exceeds `endMonth`:

- **No outstanding carry-overs →** `status = completed` (clean completion).
- **Outstanding carry-overs exist →** `status = pending_reconciliation`. The system notifies the user. No new envelopes are generated; the template waits for the user to resolve the outstanding COs — see [Section 3.1](#31-recurring-template-status-lifecycle).

### Terminating a recurring template

The user can **terminate** a recurring template at any time from `active` or `pending_reconciliation`. Termination is the mechanism for early exit — the user no longer wants this obligation to continue.

**Termination is a dangerous action.** The system guards the CTA with a confirmation dialog because termination is destructive and irreversible:

1. **Confirmation dialog** — clearly communicates that termination will stop all future envelope generation and remove all outstanding carry-overs.
2. **Mandatory `terminationReason`** — the user must explain why they are stopping the template before its natural end (e.g., "Paid off early", "Refinanced with OCBC", "Cancelled subscription"). Stored on the template.

**On termination, the system performs a clean cut:**

| Effect | Detail |
|---|---|
| **Status** | Set to `terminated`. |
| **Archive** | Template is soft-deleted into the archive. Removed from the main template list. |
| **Future generation** | Stops immediately. No envelopes will be generated for future ledgers. |
| **Outstanding carry-overs** | All entries in the template's carry-over panel are **removed entirely**. Gone — not preserved, not actionable. |
| **Envelopes in reconciling ledgers** | Any unresolved envelopes linked to this template in `reconciling` ledgers are **removed from reconciliation** — they are no longer part of the ledger's outstanding items. |
| **Existing paid/settled envelopes** | Untouched. Historical records remain intact. Envelopes retain their `templateId` as a historical reference (orphaned — the system handles this gracefully). |

The user is in control. The system does not block termination — but it makes the consequences clear before the user confirms.

### Archiving an adhoc template

User sets `archived = true`. The template is hidden from the active library but not deleted. Previously created envelopes retain their `templateId`. The user can unarchive at any time.

### Deleting a template

**Recurring templates:**
- **`active` or `pending_reconciliation`:** The user must **terminate** first (which moves the template to the archive). Hard delete is only available from the archive.
- **`completed`:** The user can hard-delete directly. Previously created envelopes retain their `templateId` as a historical reference (orphaned reference — the system handles this gracefully in queries).
- **`terminated` (in archive):** The user can hard-delete from the archive view. This permanently destroys the template record.

**Adhoc templates:**
- The user can permanently delete an adhoc template at any time (archive is the soft option; delete is permanent). Previously created envelopes retain their `templateId` as a historical reference.

### Carry-over panel (recurring and adhoc)

When a template-linked envelope is marked `carried-over` in a ledger, the carry-over entry is routed to the **parent template's carry-over panel**. This panel is the home for outstanding obligations that were deferred from previous months.

#### What the panel shows

Each carry-over entry displays:

- **Item name and amount** (from the source envelope)
- **Carried from** — the source ledger month (e.g., "Jun 2026")
- **Carry-over reason** — the mandatory reason the user provided
- **Source envelope reference** (`carriedFromEnvelopeId`)

#### User actions (per carry-over item)

| Action | Effect |
|---|---|
| **Add to ongoing ledger** | Creates a new `pending` envelope in the current `ongoing` ledger. The envelope retains `templateId`, `carriedFromEnvelopeId`, `carryOverReason`, and `originalAmount` from the source. Visually marked as "dirty" (carried-over origin) in the ledger. |
| **Kill** (with mandatory reason) | Dismissed. The carry-over is resolved without payment. For recurring templates, this counts as non-payment — `occurrencesRemaining` is unaffected. The kill reason is recorded for audit. |

The user can select individual items (checkboxes), select all, or ignore items to deal with later. No time pressure — items remain in the panel until explicitly acted on.

#### Sync with source envelope

The template's carry-over panel and the source envelope's status are **always in sync**:

- **Envelope marked `carried-over`** → entry appears in the template's panel immediately.
- **Envelope reverted from `carried-over`** (user changes status back to `pending`, `paid`, etc.) → entry is removed from the panel.
- **Carry-over acted on** (added to a ledger or killed) → the source envelope's status is **locked** as `carried-over` in the source ledger. The user cannot revert it — the downstream action has already occurred. The envelope is visually disabled for status changes in the source ledger.

This ensures the panel always reflects reality. See [`monthly-ledger.md`](monthly-ledger.md), Envelope Status Transitions, for the full side-effect rules.

#### Recurring template behavior

- The carry-over panel coexists with normal envelope generation. The RT continues generating fresh envelopes for new months while old carry-overs sit in the panel.
- If the RT reaches `endMonth` and enters `pending_reconciliation`, outstanding carry-overs in the panel must be resolved (added to a ledger and paid, or killed) before the template can transition to `completed`.
- The user can also **terminate** the template at any time — which removes all outstanding carry-overs and moves the template to the archive.

#### Adhoc template behavior

- Adhoc templates have no lifecycle pressure (`endMonth`, `pending_reconciliation`). Carry-overs sit in the panel indefinitely.
- The user manages them at their own pace — add to a ledger when ready, or kill if no longer relevant.

#### Carry-over history

The template surfaces carry-over history: which months had envelopes carried over (rather than paid), and the reasons provided. This helps the user during reconciliation work and when deciding whether to terminate. The system shows the truth — the user decides how to act on it.

#### Manually created envelopes (no template)

Envelopes with no `templateId` do **not** participate in template-centric carry-over. When marked `carried-over`, they remain in the source ledger with that status as a terminal state. No routing occurs. The ledger records the decision; no template is involved.

---

## 7. Decisions Log

### 7.1 End-condition model (recurring) — DECIDED

**Decision:** `endMonth` is the single source of truth for when a recurring template stops. The user can set it directly (by date) or indirectly (by entering a count, which the system converts to `endMonth`). `null` = indefinite.

### 7.2 Decrement logic (recurring) — DECIDED

`occurrencesRemaining` is a data point on the template entity, derived from paid envelope count. Only `paid` envelopes count. Skipped and carried-over envelopes do not decrement — the obligation is still outstanding. Physical storage strategy is an implementation decision.

### 7.3 Carry-over interaction (recurring) — DECIDED

Carried-over envelopes retain `templateId`. Non-payment (carry-over, skip) does not decrement `occurrencesRemaining`. Templates surface carry-over history for user visibility. The user can terminate a template at any time (which removes all outstanding COs and archives the template). Resolves RFC-004.

### 7.4 Template lifecycle notifications (recurring) — DECIDED

**Decision:** No pre-deactivation warning or notification mechanism in the finance domain. Template lifecycle notifications (completion, upcoming deactivation, final occurrence, pending reconciliation) are handled by a **cross-cutting in-app notification / inbox feature**. The finance system manages status transitions (`active → completed` or `active → pending_reconciliation`) and the notification system informs the user. Resolves RFC-009.

### 7.5 No type change between recurring and adhoc — DECIDED

**Decision:** `type` is immutable after creation. A recurring template cannot become adhoc, and vice versa.

If the user realizes an occasional expense has become a monthly obligation, they create a new `recurring` template. The system may offer a **"create from existing"** convenience — pre-filling the new template's fields from the adhoc one — but the result is a distinct entity. The original adhoc template can then be archived.

The reverse works the same way: deactivate the recurring template, create an adhoc template from its fields if desired.

This mirrors the "no reactivation" principle (Section 7.7): separate lifecycles, clean history.

### 7.6 Auto-deactivation timing (recurring) — DECIDED

End-of-schedule check happens at **ledger creation time**, not mid-ledger. When the system checks `status == 'active'` templates to generate envelopes, it also checks `endMonth`. If the current month exceeds `endMonth`, the template is skipped and transitions to either `completed` (no outstanding carry-overs) or `pending_reconciliation` (outstanding carry-overs exist). See [Section 3.1](#31-recurring-template-status-lifecycle).

### 7.7 No reactivation of completed recurring templates — DECIDED

**Decision:** Completed recurring templates cannot be reopened or reactivated. They are historical records. If the underlying obligation resumes (e.g., a loan gets extended, a cancelled subscription is renewed), the user creates a **new** template.

The system may offer a "duplicate from existing" convenience — pre-filling the new template's fields from the old one — but the new template is a distinct entity with its own lifecycle, `occurrencesRemaining`, and fulfillment history. The old template's data remains intact and unambiguous.

Resolves RFC-010.

### 7.8 Generate into ongoing ledger on recurring template creation — DECIDED

**Decision:** When a recurring template is created with `nextDueMonth <= ongoing ledger.month`, the system auto-generates an envelope into the current ongoing ledger immediately. The user already declared "start this month" by setting `nextDueMonth` — no additional prompt is needed. If no ongoing ledger exists or `nextDueMonth` is a future month, the template waits for the next ledger creation.

### 7.9 Unified entity with type field — DECIDED

**Decision:** Template is a single entity with `type: recurring | adhoc` rather than two separate entities (RecurringTemplate + SavedTemplate). The shared data shape (item, category, defaults) is identical. Type-specific fields and behaviors are clearly scoped by type. The user's mental model is one concept — "my templates" — with two modes of operation. Resolves RFC-013 (Option 2 chosen, with type-specific behavioral scoping).

### 7.10 Adhoc template sync prompt — DECIDED

**Decision:** The template sync prompt does NOT fire for adhoc-template-linked envelopes. Adhoc templates are pre-fill convenience for expenses that naturally vary in amount each occurrence. Only recurring templates trigger the sync prompt. The `templateId` back-reference exists on both for queryability, but behavioral implications differ by type.

### 7.11 `nextDueMonth` advances after each generation (recurring) — DECIDED

**Decision:** `nextDueMonth` is a **cursor** that advances to `ledger.month + 1` immediately after the system generates an envelope. This applies to both generation triggers — ledger creation (Section 4, primary trigger) and template creation into an ongoing ledger (Section 7.8).

This provides natural idempotency: once the cursor advances past a month, the template cannot match that month again. No separate duplicate-check or `lastGeneratedMonth` field is needed.

**No back-filling.** If the user skips a month (e.g., creates April's ledger without creating March), the template generates only for the month being created and advances the cursor. Skipped months simply don't get an envelope — the system does not retroactively fill gaps.

Resolves RFC-014.

### 7.12 Flat library for MVP (adhoc) — DECIDED

**Decision:** No folders, tags, or custom groupings at MVP. The adhoc library is a flat list sorted by `lastUsedMonth` (most recently used first), with never-used templates at the bottom sorted by creation order. Category filter and item search are sufficient. Reassess if the library grows beyond ~30 templates.

### 7.13 Recurring template lifecycle — status enum replaces boolean — DECIDED

**Decision:** The `active` boolean on recurring templates is replaced by a `status` enum with four states: `active`, `pending_reconciliation`, `completed`, `terminated`. No `paused` state — once active, a template runs until natural completion or user termination. This captures the full lifecycle, including the case where a template reaches `endMonth` with outstanding carry-over envelopes — the template enters `pending_reconciliation` instead of silently completing with unresolved obligations. The user is forced to make a decision (kill outstanding with reason, or wait for COs to be paid). `completed` and `terminated` are both terminal. `completed` stays in the main list; `terminated` is soft-deleted to archive. Clean vs gap completion is a derived display state on `completed`. See [Section 3.1](#31-recurring-template-status-lifecycle). Resolves RFC-015.

### 7.14 `occurrencesRemaining` — paid-only decrement confirmed — DECIDED

**Decision:** `occurrencesRemaining` decrements only when an envelope is marked `paid`. Carry-over and skip do not decrement — the obligation is still outstanding. The potential drift between `occurrencesRemaining` and months remaining (when carry-overs accumulate) is handled by the `pending_reconciliation` status (Decision 7.13) — the template does not silently close while obligations remain unresolved. Resolves RFC-015.

### 7.15 No pause/resume — terminate with mandatory reason — DECIDED

**Decision:** Recurring templates have no `paused` status. Once active, a template runs until natural completion (`endMonth` exceeded) or user termination. If the user no longer wants the obligation, they terminate it — not pause it. If the obligation resumes later, they create a new template (consistent with Decision 7.7 — no reactivation, clean lifecycles).

Termination requires a mandatory `terminationReason` — the user must explain why they are stopping the template before its natural end. This applies to termination from both `active` and `pending_reconciliation`. The template is soft-deleted to the archive. The reason is stored on the template and visible in the archive view. Resolves RFC-017.

### 7.16 Terminate replaces force-close — soft-delete to archive with clean cut — DECIDED

**Decision:** The previous "force-close" concept is replaced by **terminate**. Termination is the single mechanism for early exit of a recurring template. On termination:

1. The template transitions to `terminated` status and is soft-deleted to an **archive** (separate view from the main template list).
2. A **mandatory `terminationReason`** is required (dangerous action — confirmation dialog guards the CTA).
3. **All outstanding carry-overs are removed entirely** — not preserved, not actionable. Clean cut.
4. **Unresolved envelopes in reconciling ledgers linked to this template are removed from reconciliation.**
5. Existing paid/settled envelopes are untouched — historical records remain.
6. **Hard delete is only available from the archive.** Active/pending_reconciliation templates cannot be hard-deleted directly — they must be terminated first.
7. **No resume from archive** (for now). If the obligation returns, the user creates a new template (consistent with Decision 7.7). Resume may be added in a future phase.
8. `completed` templates are NOT archived — they remain in the main template list as historical records. Only terminated templates go to the archive.

Resolves RFC-020.

---

## 8. Adhoc Library Organization

For MVP, the adhoc template library is a **flat list**. Templates are displayed sorted by `lastUsedMonth` (most recently used first), with never-used templates at the bottom sorted by creation order.

The user can filter by category. Search by item name is available.

Folders, tags, and custom groupings are deferred to Phase 2 if usage patterns show the library growing large enough to need them.

---

## 9. Relationship to Other Entities

```
Template (type: recurring)
    │
    │  auto-generates (on new ledger creation)
    ▼
Envelope (templateId → back-ref)
    │
    │  belongs to
    ▼
MonthlyLedger

Template (type: adhoc)
    │
    │  inserts (user-initiated, into ongoing ledger)
    ▼
Envelope (templateId → back-ref)
    │
    │  belongs to
    ▼
MonthlyLedger
```

- **Template → Envelope:** One-to-many over time. Recurring templates produce one envelope per month. Adhoc templates produce one envelope per user insertion.
- **Envelope → Template:** Many-to-one via `templateId` (nullable — null means manually created, not from any template). The system checks the template's `type` to determine behavioral rules (sync prompt, carry-over tracking, etc.).
- **Template → MonthlyLedger:** No direct link. Templates are ledger-independent. Recurring templates generate into whichever ledger is being created. Adhoc templates insert into the current ongoing ledger.

---

## Revision History

| Version | Date       | Author            | Changes |
| ------- | ---------- | ----------------- | ------- |
| 1.7     | 2026-05-28 | NafiOS Foundation | **Terminate replaces force-close.** Replaced `forceCloseReason` with `terminationReason`. Added `terminated` as fourth recurring template status. Termination = soft-delete to archive with mandatory reason, clean cut (all outstanding COs removed, unresolved envelopes in reconciling ledgers removed). Hard delete only from archive. No resume (deferred). `completed` stays in main list — only terminated templates go to archive. Updated deletion rules: active/pending_reconciliation RTs must be terminated before hard-delete. Resolves RFC-020. |
| 1.6     | 2026-05-27 | NafiOS Foundation | **Carry-over panel sync contract.** Template carry-over panel and source envelope status are always in sync. Reverting an envelope from `carried-over` removes the panel entry. Acting on a carry-over (add to ledger or kill) locks the source envelope's status. Resolves RFC-018. |
| 1.5     | 2026-05-27 | NafiOS Foundation | **Template-centric carry-over panel.** Templates now own carry-over lifecycle for their linked envelopes. When a template-linked envelope is marked `carried-over` in a ledger, the entry routes to the parent template's carry-over panel (not a ledger staging panel). User manages carry-overs from the template — add to ongoing ledger (checkboxes, select all), or kill with reason. Applies to both recurring and adhoc templates. Manually created envelopes (no `templateId`) are unaffected — `carried-over` is terminal on the ledger. |
| 1.4     | 2026-05-25 | NafiOS Foundation | **Removed `paused` status; force-close requires reason.** Simplified recurring lifecycle to 3 statuses (`active` / `pending_reconciliation` / `completed`). No pause/resume — once active, runs until completion or force-close. Added `forceCloseReason` field (mandatory on force-close). Consistent with no-reactivation principle (Decision 7.7). Resolves RFC-017. |
| 1.3     | 2026-05-25 | NafiOS Foundation | **Recurring template status lifecycle.** Replaced `active` boolean with `status` enum (`active` / `pending_reconciliation` / `completed`). Added `pending_reconciliation` state for templates that reach `endMonth` with outstanding carry-over envelopes — forces user decision (kill or await payment) before template can close. Completion states (cleanly completed vs closed with outstanding) are now derived display states on the terminal `completed` status. Confirmed paid-only decrement for `occurrencesRemaining`. Resolves RFC-015. |
| 1.2     | 2026-05-25 | NafiOS Foundation | **`nextDueMonth` advancement rule.** `nextDueMonth` is a cursor — advances to `ledger.month + 1` after each envelope generation. Provides natural idempotency. No back-filling of skipped months. Applies to both ledger-creation and template-creation triggers. Resolves RFC-014. |
| 1.1     | 2026-05-25 | NafiOS Foundation | **Cross-spec alignment fixes.** Added orphaned template rule — sync prompt is inert when linked template has been deleted. Added explicit adhoc duplicate insertion stance — same template can be inserted multiple times into the same ledger. Filed RFC-014 (nextDueMonth advancement), RFC-015 (occurrencesRemaining derivation). |
| 1.0     | 2026-05-25 | NafiOS Foundation | **Unified Template entity.** Merged RecurringTemplate and adhoc template concept into a single Template entity with `type: recurring \| adhoc`. Shared fields (identity, defaults) are common to both types. Type-specific fields (schedule, end condition, active for recurring; archived, lastUsedMonth, usageCount for adhoc) are scoped by type. Single `templateId` on Envelope — system checks template type for behavioral branching (sync prompt fires for recurring only). Resolves RFC-013. Supersedes `recurring-template.md`. |
| 0.8     | 2026-05-25 | NafiOS Foundation | **No reactivation of completed templates.** Completed (auto-deactivated) templates are historical records — cannot be reopened. User creates a new template instead (optionally duplicated from the old one). Resolves RFC-010. |
| 0.7     | 2026-05-25 | NafiOS Foundation | **Generate into ongoing ledger on template creation.** When a template is created with `nextDueMonth` matching the current ongoing ledger's month, the system auto-generates an envelope into that ledger immediately. No prompt needed — the user already declared the start month. |
| 0.6     | 2026-05-25 | NafiOS Foundation | **Template lifecycle notifications — out of scope.** No pre-deactivation warning in finance domain. Deferred to cross-cutting notification feature. Resolves RFC-009. |
| 0.5     | 2026-05-25 | NafiOS Foundation | **Cross-spec alignment review.** Fixed stale `totalOccurrences` reference — now correctly references `endMonth`. Added `nextDueMonth` check to generation trigger. |
| 0.4     | 2026-05-24 | NafiOS Foundation | **Carry-over interaction and force-close.** Carried-over envelopes retain `templateId`. Added force-close workflow and completion states. Resolves RFC-004. |
| 0.3     | 2026-05-24 | NafiOS Foundation | **Template sync via envelope amendment.** Added `originalAmount` snapshot and blocking sync prompt. Resolves RFC-011. |
| 0.2     | 2026-05-24 | NafiOS Foundation | **PriorityTier → Category.** Updated `category` field. Added `sortOrder`. Resolves RFC-001. |
| 0.1     | 2026-05-24 | NafiOS Foundation | Initial draft (as RecurringTemplate). Template configuration, end-condition model, generation trigger, and user workflows. |
