/**
 * root-test-preload.ts
 *
 * Preloaded by the repo-root bunfig.toml `[test]` block.
 *
 * Why this exists — the VS Code "Jest Runner" extension (firsttris.vscode-jest-
 * runner) locates a Bun project by walking up to the nearest `bun.lock`. In this
 * monorepo the only lockfile is at the repo root, so the extension always runs
 * `bun test <file>` with cwd = repo ROOT. From the root, Bun loads THIS bunfig —
 * not the per-package one — so a package's own DOM/mocks preload
 * (`<pkg>/tests/setup.ts`) never runs and its tests fail with
 * `ReferenceError: window is not defined`. The same happens for a plain
 * `bun test <file>` typed at the root.
 *
 * This dispatcher restores parity: it looks at the test file Bun is about to run
 * and imports that package's own setup. Non-DOM packages declare no preload, so
 * it is a no-op for them (finance, auth-core, storage, the root integration
 * suite, …) — they already run correctly from any cwd.
 *
 * SCOPE — this fixes single-package runs: one file, or a path under one package
 * (the extension's click-to-run, and `bun test <path>`). It does NOT fix a bare
 * `bun test` that sweeps the WHOLE repo: that runs every package in one process,
 * where web's process-global `mock.module` seams bleed into other packages'
 * tests. For the full suite always use `bun run test` (= `bun --filter '*' test`,
 * one isolated process per package). See CLAUDE.md and adr/0020.
 */
// Only packages whose own bunfig.toml declares a `preload` need dispatching.
// `match` finds the package as a path segment (start-of-path or after any
// `/` or `\`, absolute or relative); `setup` is resolved relative to THIS file
// (tooling/scripts/).
const PACKAGE_SETUPS = [
  { match: /(?:^|[\\/])packages[\\/]ui[\\/]/, setup: "../../packages/ui/tests/setup.ts" },
] as const;

// The test file Bun is about to run. `Bun.main` is the entry file at preload
// time; also scan argv in case a future Bun version changes that.
const entry = `${Bun.main ?? ""}\n${Bun.argv.join("\n")}`;

const hit = PACKAGE_SETUPS.find(({ match }) => match.test(entry));
if (hit) {
  await import(hit.setup);
}
