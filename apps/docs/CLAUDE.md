# @nafios/docs

Developer documentation site built with VitePress.

## What this app does

Aggregates markdown docs from across the monorepo (ADRs, specs, context docs,
package READMEs) into a single searchable, navigable site.

## How it works

- `scripts/sync-docs.ts` creates symlinks from scattered `.md` files into `content/`.
- VitePress renders `content/` as a static site with sidebar navigation and local search.
- Source of truth stays in the original files — the doc site just presents them.

## Scripts

```sh
bun run dev       # sync + start dev server
bun run build     # sync + production build
bun run preview   # preview production build
bun run sync      # re-create content symlinks
```

## Adding new docs

1. Add a mapping in `scripts/sync-docs.ts` (static or dynamic).
2. Add a sidebar entry in `content/.vitepress/config.ts`.
3. Run `bun run sync` to create the symlink.

## Non-obvious gotchas

- `content/` contains mostly symlinks — don't edit files there directly.
- Cross-doc links using relative paths (e.g. `../../adr/0001-...`) won't resolve
  in VitePress. The symlinks flatten the structure so links work within the site.
  `ignoreDeadLinks: true` suppresses warnings for links that point outside the site.
