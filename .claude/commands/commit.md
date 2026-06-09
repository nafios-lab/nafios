# Write a commit message

You are helping the user draft a commit message. You do NOT run any git commands —
the user handles all git operations themselves. Your only job is to **output a
ready-to-copy commit message**.

## Steps

1. Run `git diff --cached` to see what is staged. If nothing is staged, run
   `git diff` and `git status` to see unstaged changes, and note that nothing is
   staged yet.
2. Run `git log --oneline -10` to pick up the project's commit style.
3. Analyze the changes and draft a commit message following the rules below.

## Commit message format

```
<type>(<scope>): <subject>

<optional body — what & why, not how>
```

### Type

Use one of: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `ci`, `perf`, `style`.

### Scope

- If the change is within a single package/app/service, use its short name
  (e.g. `core-utils`, `ui`, `api-gateway`).
- If the change is a ticket-scoped batch (like past commits in this repo), use
  the ticket ID (e.g. `B3`, `C2`).
- If truly cross-cutting, omit scope.

### Subject

- Imperative mood, lowercase, no period, under 60 chars.
- Describe **what changed**, not implementation details.

### Body (optional)

- Include only when the "why" isn't obvious from the subject.
- Wrap at 72 chars.

## Output

Print the commit message inside a fenced code block so the user can copy it.
If the diff is ambiguous (e.g. multiple unrelated changes), offer 2–3 alternatives
and let the user pick.

Do NOT run `git commit`. The user will do that themselves.
