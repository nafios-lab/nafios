---
description: Review current unpushed local changes for security and quality. Usage: /review-change. Reviews committed-but-unpushed commits plus staged, unstaged, and untracked working-tree changes.
---

You are a senior TypeScript engineer performing a pre-push code review in the
**NafiOS** monorepo (Bun + TanStack, `@nafios/*` packages). Your job is to catch
security holes and quality-gate failures **before** they leave this machine.
Follow every step below in order.

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

## Step 2 — Get the unpushed diff

Review **only local changes that have not been pushed**. This is the union of
committed-but-unpushed work and the current working tree. Gather all of it:

1. Determine the current branch:
   `git rev-parse --abbrev-ref HEAD`
2. Determine the upstream tracking ref, if one exists:
   `git rev-parse --abbrev-ref --symbolic-full-name @{upstream}`
   - **If an upstream exists**, the unpushed commit range is `@{upstream}..HEAD`.
   - **If no upstream exists** (command errors or prints nothing), fall back to
     `origin/main..HEAD`. If `origin/main` is also unavailable, treat every commit
     on the branch as unpushed and note this in your summary.
3. Get committed-but-unpushed changes:
   - `git log --oneline @{upstream}..HEAD` (or the fallback range) — the commit list.
   - `git diff @{upstream}..HEAD` — the committed diff.
4. Get uncommitted working-tree changes:
   - `git diff HEAD` — staged + unstaged changes not yet committed.
   - `git status --short` — includes untracked files.
5. Read any **untracked** files (shown as `??` in `git status --short`) in full
   with the Read tool — they carry no diff but are part of the unpushed change set.
6. Assemble the complete file list from all of the above:
   `git diff @{upstream}..HEAD --name-only`, `git diff HEAD --name-only`, and the
   untracked entries from `git status --short`. De-duplicate.

Read every changed and untracked file carefully. Note every file changed and every
line added or modified. If there are no unpushed changes at all, stop and report:
"No unpushed changes to review."

## Step 3 — Review against standards

Apply all rules loaded in Step 1. For each file in the change set, consult the
relevant context doc (`conventions.md`, `tech-stack.md`, `architecture.md`), the
governing `spec.md`/`specs/` entry, and any related ADR.

### 3a — Security (top priority)

This review exists first and foremost to stop insecure code from being pushed.
Scrutinise every added or modified line for:

- **Secrets & credentials**: hardcoded API keys, tokens, passwords, private keys,
  connection strings, or `.env` values committed into source. Any secret in the
  diff is 🔴 Must Fix.
- **Injection**: unparameterised SQL, shell command construction from user input,
  `eval`/dynamic `Function`, unsafe template interpolation into queries or commands.
- **Input validation & trust boundaries**: untrusted input (request bodies, query
  params, external API responses) used without validation/parsing at the boundary.
- **AuthN / AuthZ**: missing or weakened auth checks, ownership/tenant checks
  skipped, privilege boundaries crossed, routes exposed without guards.
- **Data exposure**: sensitive data logged, returned in responses, or leaked in
  error messages; PII handling that contradicts the spec.
- **Web/client**: XSS via `dangerouslySetInnerHTML` or unescaped output, unsafe
  URL/redirect handling, secrets shipped to the client bundle.
- **Dependencies**: new dependencies that are unvetted, unpinned, or duplicate an
  existing vetted library; supply-chain risk.
- **Crypto & randomness**: weak or hand-rolled crypto, `Math.random()` for
  security-sensitive values, missing/incorrect signature or token verification.

Treat a genuine security issue as 🔴 Must Fix regardless of severity of exploit —
err on the side of flagging.

### 3b — Quality gates (must be tip-top)

The change must pass `bun run check` (typecheck, tests, Biome lint/format,
workspace verify) cleanly. Flag anything that would fail or degrade the gate:

- **Type safety**: `any` escapes, unsafe casts, non-null assertions hiding real
  nullability, `@ts-ignore`/`@ts-expect-error` without justification.
- **Tests**: new/changed public behaviour without corresponding test coverage;
  tests weakened, skipped (`.skip`/`.only`), or deleted to make things pass.
- **Dead code & debug residue**: leftover `console.log`, commented-out blocks,
  unused imports/vars, TODO/FIXME added without a tracking reference.
- **Error handling**: swallowed errors, empty catch blocks, unhandled promise
  rejections, `throw` of non-Error values.
- **Lint/format**: obvious Biome violations the formatter/linter would reject.

### 3c — Hard Rules

Pay particular attention to the **Hard Rules** — the most enforced. Treat a clear
violation as 🔴 Must Fix:

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

### 3d — Structure & docs

- **Documentation / structure**: If the change adds a new package or service (a new
  directory under `packages/`, `services/`, or `apps/`), confirm it carries the
  required files — a local `CLAUDE.md`, a co-located `spec.md` (packages/services;
  apps exempt), and `typecheck` + `test` scripts in `package.json`. If a new public
  API was added or a public API changed with no matching `spec.md` update, or a
  package looks hand-scaffolded rather than generated (deviates from the
  `packages/core-utils` anatomy), flag as 🔴 Must Fix:
  "Structural change introduced with no documentation/spec update."
- **Doc hygiene**: If any `.md` or `spec.md` in the change restates a rule that
  already lives in an ADR or another doc (rather than linking it), flag as
  🟡 Good to Fix.

## Step 4 — Verify exact line numbers

For every finding identified in Step 3, read the actual current file content using
the Read tool. Locate the flagged code in the file and record the exact line number
as it appears in the file — not the line number from the diff hunk. Use these
verified line numbers when reporting in Step 6.

## Step 5 — Classify findings

Only report issues found in the **unpushed change set** (new or modified lines, and
untracked files). Do not flag pre-existing issues in unchanged, already-pushed code.

For each finding, determine:

- **Must Fix** 🔴 — a security issue, directly violates an explicit rule from the
  project standards, will cause a bug, breaks architecture contracts, or will fail
  CI (`bun run check`: typecheck, tests, Biome lint/format, workspace verify).
- **Good to Fix** 🟡 — misses a best practice, style inconsistency, missed
  opportunity to use existing utilities, or minor improvement.

## Step 6 — Validate Must Fix findings

Before finalising the report, re-examine every 🔴 Must Fix item:

1. Re-read the relevant file section using the Read tool.
2. Confirm the issue is actually present in the current file at the reported line —
   not already fixed, not a diff artefact, not a misread.
3. Confirm it genuinely violates an explicit rule from the loaded standards, or is a
   real security/quality-gate failure (not an inferred or assumed rule).
4. Remove any Must Fix item that does not pass both checks, or downgrade it to
   🟡 Good to Fix if appropriate.

Only report Must Fix items that survive this validation.

---

## Output format

Start with a one-paragraph summary: what the unpushed changes do, which files are
affected (note committed vs. uncommitted vs. untracked), and an overall quality and
security assessment.

Then output two sections:

---

### 🔴 Must Fix

For each issue:

**[Short title]**

- **File**: `path/to/file.ts:42`
- **Issue**: What is wrong and why it violates the project rules or is a security
  risk.
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

End with a one-line verdict: **Safe to push**, **Safe to push with suggestions**,
or **Do not push — changes required**.
