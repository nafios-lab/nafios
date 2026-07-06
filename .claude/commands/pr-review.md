---
description: Review a PR against project coding standards. Usage: /pr-review [branch-name]. If no branch is given, reviews the current branch vs main.
---

You are a senior TypeScript engineer performing a code review in the **NafiOS**
monorepo (Bun + TanStack, `@nafios/*` packages). Follow every step below in order.

## Step 1 — Load project standards

Read and internalize the authoritative standards. You will apply them in Step 3:

1. `CLAUDE.md` at the project root — the Hard Rules and pointers.
2. `.claude/context/conventions.md` — naming, structure, file layout, import rules.
3. `.claude/context/tech-stack.md` — chosen libraries and the ADR behind each.
4. `.claude/context/architecture.md` — system shape.
5. For each area the diff touches, the governing spec: the co-located
   `packages/<x>/spec.md` or `services/<x>/spec.md`, or a cross-cutting spec under
   `specs/`. Domain specs live per module in `specs/domain/<module>/`, which also
   holds that module's **reference material** (DBML, DB-design notes, images) —
   the authoritative `.md` spec governs; a diagram only illustrates. Reference
   material colocated there is intentional, not a misplaced file. → ADR-0025.
6. The local `CLAUDE.md` of any package/service/app the diff touches.
7. Any `adr/` entry relevant to a pattern in the diff — `grep` `adr/` before
   flagging a deviation as wrong; the decision may already be documented.

Internalize all rules found. You will apply them in Step 3.

## Step 2 — Get the diff

The argument passed to this command is: `$ARGUMENTS`

- **If `$ARGUMENTS` is non-empty** (a branch name was provided):
  1. Run: `git fetch origin $ARGUMENTS`
  2. Run: `git fetch origin main`
  3. Run: `git diff $(git merge-base origin/main origin/$ARGUMENTS)...origin/$ARGUMENTS`
  4. Also run: `git diff $(git merge-base origin/main origin/$ARGUMENTS)...origin/$ARGUMENTS --name-only` to get a file list.

- **If `$ARGUMENTS` is empty** (no branch provided):
  1. Run: `git fetch origin main`
  2. Run: `git fetch origin HEAD`
  3. Run: `git diff $(git merge-base origin/main HEAD)...HEAD`
  4. Also run: `git diff $(git merge-base origin/main HEAD)...HEAD --name-only` to get a file list.

Read the full diff carefully. Note every file changed and every line added or modified.

## Step 3 — Review against standards

Apply all rules loaded in Step 1. For each file changed in the diff, consult the
relevant context doc (`conventions.md`, `tech-stack.md`, `architecture.md`), the
governing `spec.md`/`specs/` entry, and any related ADR.

Pay particular attention to the **Hard Rules** — these are the most common and the
most enforced. Treat a clear violation as 🔴 Must Fix:

- **Import boundaries**: shared code is imported via its package name
  (`@nafios/<name>`), never via deep/relative paths into another package, and
  never from another package's `internal/`.
- **No tsconfig path aliases**: module resolution is Bun workspace resolution
  ([ADR-0008](../../adr/0008-workspace-resolution-over-path-aliases.md)).
- **File naming**: source files are kebab-case; domain modules use
  `<domain>.<role>.ts` (`users.service.ts`). No PascalCase source filenames.
- **Layering**: routes call services — no business logic in routes.
- **No-build packages**: never edit a package's `dist/`
  ([ADR-0006](../../adr/0006-no-build-internal-packages.md)).

Two additional checks:

- **Documentation / structure**: If the diff adds a new package or service (a new
  directory under `packages/`, `services/`, or `apps/`), confirm it carries the
  required files — a local `CLAUDE.md`, a co-located `spec.md` (packages/services;
  apps exempt), and `typecheck` + `test` scripts in `package.json`. If a new public
  API was added or a public API changed with no matching `spec.md` update, or a
  package looks hand-scaffolded rather than generated (deviates from the
  `packages/core-utils` anatomy), flag as 🔴 Must Fix:
  "Structural change introduced with no documentation/spec update."
- **Doc hygiene**: If any `.md` or `spec.md` in the diff restates a rule that
  already lives in an ADR or another doc (rather than linking it), flag as
  🟡 Good to Fix.

## Step 4 — Verify exact line numbers

For every finding identified in Step 3, read the actual current file content using the Read tool. Locate the flagged code in the file and record the exact line number as it appears in the file — not the line number from the diff hunk. Use these verified line numbers when reporting in Step 5.

## Step 5 — Classify and report findings

Only report issues found in the **diff** (new or modified lines). Do not flag pre-existing issues in unchanged code.

For each finding, determine:

- **Must Fix** 🔴 — directly violates an explicit rule from the project standards, will cause a bug, breaks architecture contracts, or will fail CI (`bun run check`: typecheck, tests, Biome lint/format, workspace verify)
- **Good to Fix** 🟡 — misses a best practice, style inconsistency, missed opportunity to use existing utilities, or minor improvement

## Step 6 — Validate Must Fix findings

Before finalising the report, re-examine every 🔴 Must Fix item:

1. Re-read the relevant file section using the Read tool.
2. Confirm the issue is actually present in the current file at the reported line — not already fixed, not a diff artefact, not a misread.
3. Confirm it genuinely violates an explicit rule from the loaded standards (not an inferred or assumed rule).
4. Remove any Must Fix item that does not pass both checks, or downgrade it to 🟡 Good to Fix if appropriate.

Only report Must Fix items that survive this validation.

---

## Output format

Start with a one-paragraph summary of the PR: what it does, which files are changed, and overall quality assessment.

Then output two sections:

---

### 🔴 Must Fix

For each issue:

**[Short title]**

- **File**: `path/to/file.ts:42`
- **Issue**: What is wrong and why it violates the project rules.
- **Fix**:

```ts
// corrected code snippet
```

---

### 🟡 Good to Fix

For each issue:

**[Short title]**

- **File**: `path/to/file.ts:88`
- **Issue**: What could be improved and the benefit.
- **Suggestion**:

```ts
// improved code snippet
```

---

If a section has no findings, write "No issues found." under it.

End with a one-line verdict: **Approved**, **Approved with suggestions**, or **Changes requested**.
