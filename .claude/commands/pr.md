# Write a PR description

You are helping the user draft a pull request title and description. You do NOT
create the PR — the user handles all git/gh operations themselves. Your only job
is to **output a ready-to-copy PR title and body**.

## Steps

1. Determine the base branch (usually `main`). Check the current branch name
   with `git branch --show-current`.
2. Run `git log --oneline main..HEAD` to see all commits in this branch.
3. Run `git diff main...HEAD --stat` for a file-level summary.
4. If the branch name contains an issue number (e.g. `feat/#11-B3`), note it
   for linking.
5. Analyze the changes and draft the PR using the template below.

## PR template

The project already has a PR template at `.github/pull_request_template.md`.
Your output must follow that structure:

```markdown
## What & why

<!-- 1–3 sentences. Link the issue/epic if identifiable from the branch name. -->

## Spec & decisions

- [x/space] The spec governing this area is **up to date**.
- [x/space] New public API? A `spec.md` exists for the package/service.
- [x/space] Structural decision made? An ADR was added under `adr/`.

## Checks

- [x/space] `bun run check` passes locally.
- [x/space] No new cross-package imports from `internal/`.
- [x/space] New packages/services include their own `CLAUDE.md`.

## Notes for reviewers

<!-- Trade-offs, follow-ups, anything non-obvious. -->
```

### Checklist guidance

- Mark items `[x]` only when you can confirm them from the diff/log.
- Mark items `[ ]` when not applicable or you cannot verify.
- Add brief inline notes where helpful (e.g. "N/A — no new public API").

## Output

1. **PR title** — short, under 70 chars, same style as commit subjects
   (`<type>(<scope>): <subject>`).
2. **PR body** — the filled-in template above, inside a fenced code block so the
   user can copy it.

If you spot multiple logical changes that might be better as separate PRs,
mention it but still provide a single combined description.

Do NOT run `gh pr create`. The user will do that themselves.
