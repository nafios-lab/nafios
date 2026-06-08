/**
 * verify-workspace.ts
 *
 * Structural guards that Biome can't express (filesystem + manifest checks).
 * Fails (non-zero exit) if any workspace package violates conventions.
 *
 * Guards:
 *   1. Every package must have a CLAUDE.md
 *   2. Every package must have `typecheck` and `test` scripts
 */
import { Glob } from "bun";

const REQUIRED_SCRIPTS = ["typecheck", "test"] as const;
const WORKSPACE_DIRS = ["apps", "packages", "services", "tooling"];

const failures: string[] = [];

for (const dir of WORKSPACE_DIRS) {
  const glob = new Glob(`${dir}/*/package.json`);
  for await (const pkgJsonPath of glob.scan(".")) {
    const pkgDir = pkgJsonPath.replace(/\/package\.json$/, "");
    const pkg = await Bun.file(pkgJsonPath).json();

    // Guard: CLAUDE.md must exist
    const hasClaude = await Bun.file(`${pkgDir}/CLAUDE.md`).exists();
    if (!hasClaude) {
      failures.push(
        `${pkgDir}: missing CLAUDE.md — every package needs one for agent context (see ADR-0009)`,
      );
    }

    // Guard: required scripts
    for (const script of REQUIRED_SCRIPTS) {
      if (!pkg.scripts?.[script]) {
        failures.push(
          `${pkgDir}: missing "${script}" script in package.json — required so \`bun run check\` can exercise every package`,
        );
      }
    }
  }
}

if (failures.length > 0) {
  console.error("workspace convention violations:\n");
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  console.error(
    `\n${failures.length} violation(s) found. Fix the above and re-run \`bun run verify\`.`,
  );
  process.exit(1);
}

console.log("workspace conventions OK");
