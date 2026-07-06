# User Story Ticket Template

> How to use this file: the **blank template** below is what you copy for each new story.
> The **filled example** further down shows it in use for the Finance Onboarding journey.
>
> Structure reminder: the whole onboarding journey is an **Epic**. Each screen/step
> (create ledger, add environment, form entry) is a separate **Story** under it,
> small enough to finish within a sprint.

---

## Blank Template

**Ticket ID:** OA-XXXX
**Type:** Story
**Epic:** _<parent epic — the journey this step belongs to>_
**Reporter:** _<name>_
**Assignee:** _<name>_
**Priority:** _<Low / Medium / High>_
**Story Points:** _<estimate>_
**Labels:** `label-1`, `label-2`

### Summary

_<One line: what this story delivers, from the user's angle.>_

### User Story

> **As a** _<role>_
> **I want** _<capability>_
> **so that** _<benefit / reason>_.

### Description / Context

_<Where this sits in the journey, what the user's state is before/after, and any_
_background a reviewer needs. Keep it to what's relevant for this one step.>_

### Design

- Figma (source of truth): _<link to the specific frame(s) for this step>_
- Version / date of embedded snapshots: _<so it's clear when the screenshot was taken>_
- Embed the 1–2 relevant frames inline below, near the acceptance criteria.
- States to confirm covered: empty, loading, error, success.

<!-- Embed screenshots here, inline. Example markdown for an image:
![Create ledger — happy path](./images/create-ledger-happy.png)
![Create ledger — validation error state](./images/create-ledger-error.png)
-->

### Acceptance Criteria

```gherkin
Scenario: <happy path>
  Given <precondition>
  When <action>
  Then <expected outcome>

Scenario: <validation / error case>
  Given <precondition>
  When <action>
  Then <expected outcome>
```

### Technical Notes

- BFF endpoint(s): _<method + path>_
- Backend behavior: _<records created, side effects, active-state logic>_
- Data sources / config: _<reference services, config keys>_

### Out of Scope

- _<explicitly what this story does NOT cover — keeps it small>_

### Dependencies

- Blocked by: _<ticket>_
- Blocks: _<ticket>_

### Definition of Done

- [ ] Code merged, tests passing
- [ ] Acceptance criteria verified against Figma
- [ ] BFF endpoint documented
- [ ] Reviewed by reporter

---

## Filled Example

**Ticket ID:** OA-XXXX
**Type:** Story
**Epic:** Finance Onboarding — First-Time User Journey
**Reporter:** Hengky Sucanda
**Assignee:** Hanafi
**Priority:** Medium
**Story Points:** 3
**Labels:** `finance`, `onboarding`, `frontend`, `bff`

### Summary

Allow a first-time user to create their first ledger during onboarding.

### User Story

> **As a** first-time finance user
> **I want** to create my first ledger with a name and base currency
> **so that** I have a place to start recording transactions.

### Description / Context

New users landing in Finance for the first time have no ledger. This is step 2 of the
onboarding flow (after account setup, before adding an environment). This story covers
only the create-ledger screen and its submission; environment setup and form entry are
separate stories under the same Epic.

### Design

- Figma (source of truth): _<link to create-ledger frame>_
- Version / date of embedded snapshots: _<e.g. Figma v12, captured 2026-07-06>_
- States confirmed covered by designer: empty, loading, error, success.

<!-- Embed the create-ledger frames inline here:
![Create ledger — happy path](./images/create-ledger-happy.png)
![Create ledger — validation error](./images/create-ledger-error.png)
-->

### Acceptance Criteria

```gherkin
Scenario: Successful ledger creation
  Given I am a first-time user with no existing ledger
  When I enter a valid ledger name and select a base currency
  And I tap "Create"
  Then a new ledger is created and set as my active ledger
  And I am routed to the "Add Environment" step

Scenario: Validation error
  Given I am on the create-ledger screen
  When I submit with an empty name
  Then I see an inline error "Ledger name is required"
  And no ledger is created

Scenario: Duplicate name
  Given I already have a ledger named "Personal"
  When I try to create another ledger named "Personal"
  Then I see an error "A ledger with this name already exists"
```

### Technical Notes

- BFF endpoint: `POST /finance/ledgers`
- Backend: create ledger record, associate with user, mark as active if it's their first.
- Currency list source: _<config / reference service>_

### Out of Scope

- Editing / deleting ledgers
- Multi-ledger switching UI
- Environment creation (see sibling story)

### Dependencies

- Blocked by: OA-ZZZZ (finance user profile setup)
- Blocks: OA-YYYY (add environment)

### Definition of Done

- [ ] Code merged, tests passing
- [ ] Acceptance criteria verified against Figma
- [ ] BFF endpoint documented
- [ ] Reviewed by reporter
