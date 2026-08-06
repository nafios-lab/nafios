# _archive

Deprecated code kept git-tracked for reference, **outside the active Bun
workspace**. Nothing here is built, deployed, typechecked, tested, linted, or
formatted by the monorepo tooling (`_archive` is not in the `package.json`
`workspaces` globs and is excluded from Biome). Treat everything here as frozen —
read for reference, don't extend.

## Contents

| Path  | What it was | Superseded by | Archived |
| ----- | ----------- | ------------- | -------- |
| `web/` | `@nafios/web` — the original TanStack **Start** (Vite + Nitro SSR) shell with server functions | `apps/nafios-web` (`@nafios/nafios-web`) — the Vite + React 19 SPA cutover; client-side auth/data with RLS as the boundary (ADR-0026) | 2026-08-06 |

## Notes

- **Not deleted yet, by design.** The full history is preserved via `git mv`, so
  `git log --follow _archive/web/<file>` still traces each file back through its
  `apps/web/` life.
- **CI:** `.github/workflows/deploy-staging.yml` still references the old
  `apps/web` path and will fail if run as-is — it is slated to be repointed to
  `apps/nafios-web` and cleaned up separately (nafios-web's deploy host is still
  in planning).
- **Hard cleanup:** when the team is ready, delete `_archive/web/`, drop the
  Biome `!_archive` exclude, and remove this note.
