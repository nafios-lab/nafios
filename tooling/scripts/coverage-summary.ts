/**
 * coverage-summary.ts
 *
 * Whole-repo coverage roll-up. Runs `bun test --coverage` in every package
 * that opts into the 90% gate (any bunfig.toml with `coverageThreshold`), then
 * prints ONE aligned table: %Funcs / %Lines / PASS|FAIL per package, measured
 * against that package's own threshold. See adr/0020-test-coverage-scoping-and-gate.md.
 *
 * The raw `bun run test:coverage` emits four separate tables prefixed with
 * `@nafios/<pkg> test:` and no roll-up; this collapses them into one verdict.
 *
 * Usage:
 *   bun run test:coverage:summary           # informational, always exits 0
 *   bun run test:coverage:summary --strict  # exits 1 if any package misses its gate
 *
 * Each package run honours its local bunfig.toml (preload, ignore patterns,
 * threshold), so the denominator here is identical to the real gate.
 */
import { Glob } from "bun";

const strict = process.argv.includes("--strict");

type Row = {
  pkg: string;
  funcs: number | null;
  lines: number | null;
  threshold: number; // 0..1
  status: "PASS" | "COVERAGE FAIL" | "TESTS FAIL" | "NO COVERAGE";
  detail: string;
};

/** Pull `coverageThreshold = 0.9` out of a bunfig.toml; default to 0.9. */
function parseThreshold(bunfig: string): number {
  const m = bunfig.match(/coverageThreshold\s*=\s*([\d.]+)/);
  return m ? Number(m[1]) : 0.9;
}

/** The `All files | %Funcs | %Lines |` row Bun's text reporter prints. */
function parseAllFiles(output: string): { funcs: number; lines: number } | null {
  const m = output.match(/^\s*All files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|/m);
  return m ? { funcs: Number(m[1]), lines: Number(m[2]) } : null;
}

/** Bun's `N fail` summary line; absent means a hard crash before the summary. */
function parseFailCount(output: string): number | null {
  const m = output.match(/^\s*(\d+)\s+fail\b/m);
  return m ? Number(m[1]) : null;
}

async function runPackage(pkgDir: string): Promise<Row> {
  const pkgName = pkgDir.split("/").pop() ?? pkgDir;
  const threshold = parseThreshold(await Bun.file(`${pkgDir}/bunfig.toml`).text());

  const proc = Bun.spawn(["bun", "test", "--coverage", "--coverage-reporter=text"], {
    cwd: pkgDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  // Bun writes the report to stderr; merge both streams to be safe.
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  const output = `${out}\n${err}`;

  const cov = parseAllFiles(output);
  const failCount = parseFailCount(output);
  const min = threshold * 100;

  if (!cov) {
    return {
      pkg: pkgName,
      funcs: null,
      lines: null,
      threshold,
      status: "NO COVERAGE",
      detail: failCount === null ? "run crashed before reporting" : "no in-scope files loaded",
    };
  }

  if (failCount && failCount > 0) {
    return {
      ...base(pkgName, cov, threshold),
      status: "TESTS FAIL",
      detail: `${failCount} test(s) failing`,
    };
  }

  const misses: string[] = [];
  if (cov.funcs < min) misses.push("funcs");
  if (cov.lines < min) misses.push("lines");

  return misses.length > 0
    ? {
        ...base(pkgName, cov, threshold),
        status: "COVERAGE FAIL",
        detail: `${misses.join(" + ")} < ${min}%`,
      }
    : { ...base(pkgName, cov, threshold), status: "PASS", detail: "" };
}

function base(pkg: string, cov: { funcs: number; lines: number }, threshold: number) {
  return { pkg, funcs: cov.funcs, lines: cov.lines, threshold };
}

// ── discover gated packages ──────────────────────────────────────────────
const pkgDirs: string[] = [];
for await (const bunfigPath of new Glob("{apps,packages,services}/*/bunfig.toml").scan(".")) {
  const text = await Bun.file(bunfigPath).text();
  if (text.includes("coverageThreshold")) pkgDirs.push(bunfigPath.replace(/\/bunfig\.toml$/, ""));
}
pkgDirs.sort();

if (pkgDirs.length === 0) {
  console.error("No packages with a coverageThreshold found — nothing to summarise.");
  process.exit(0);
}

console.log(`Running coverage for ${pkgDirs.length} gated package(s)…\n`);
const rows = await Promise.all(pkgDirs.map(runPackage));

// ── render table ─────────────────────────────────────────────────────────
const tty = process.stdout.isTTY;
const green = (s: string) => (tty ? `\x1b[32m${s}\x1b[0m` : s);
const red = (s: string) => (tty ? `\x1b[31m${s}\x1b[0m` : s);
const dim = (s: string) => (tty ? `\x1b[2m${s}\x1b[0m` : s);
const fmt = (n: number | null) => (n === null ? "   —  " : `${n.toFixed(2)}`.padStart(6));

const pkgW = Math.max(7, ...rows.map((r) => r.pkg.length));
const pad = (s: string) => s.padEnd(pkgW);
const rule = `${"-".repeat(pkgW)}  -------  -------  ----  ${"-".repeat(24)}`;

console.log(`${pad("Package")}  % Funcs  % Lines  Gate  Notes`);
console.log(rule);
for (const r of rows) {
  const ok = r.status === "PASS";
  const tag = ok ? green("PASS") : red("FAIL");
  const note = r.detail ? dim(r.detail) : "";
  console.log(`${pad(r.pkg)}  ${fmt(r.funcs)}   ${fmt(r.lines)}   ${tag}  ${note}`);
}
console.log(rule);

const failed = rows.filter((r) => r.status !== "PASS");
if (failed.length === 0) {
  console.log(`\n${green("✓")} all ${rows.length} package(s) meet their coverage gate.`);
} else {
  console.log(
    `\n${red("✗")} ${failed.length} of ${rows.length} package(s) below gate: ${failed.map((r) => r.pkg).join(", ")}`,
  );
  console.log(
    dim("Coverage is informational today — see adr/0020-test-coverage-scoping-and-gate.md."),
  );
}

if (strict && failed.length > 0) process.exit(1);
