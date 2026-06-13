/**
 * sync-docs.ts
 *
 * Copies scattered monorepo markdown files into the VitePress content
 * directory so they render as a unified doc site.
 *
 * Run: bun ./scripts/sync-docs.ts
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../../..");
const CONTENT = resolve(import.meta.dirname, "../content");

interface DocMapping {
  /** Source path relative to monorepo root */
  src: string;
  /** Destination path relative to content/ */
  dest: string;
}

// ── Static mappings: hand-curated docs ─────────────────────────────────

const STATIC_MAPPINGS: DocMapping[] = [
  // Getting Started
  { src: ".claude/context/architecture.md", dest: "guide/architecture.md" },
  { src: ".claude/context/conventions.md", dest: "guide/conventions.md" },
  { src: ".claude/context/tech-stack.md", dest: "guide/tech-stack.md" },
  { src: ".claude/context/glossary.md", dest: "guide/glossary.md" },
  { src: ".claude/context/versioning-release-guide.md", dest: "guide/versioning-release-guide.md" },

  // Specs
  { src: "specs/README.md", dest: "specs/index.md" },
  // specs/_template.md excluded — contains <angle-bracket> placeholders
  // that Vue's compiler parses as HTML. A static copy is used instead.

  // Package docs
  { src: "packages/core-utils/README.md", dest: "packages/core-utils/index.md" },
  { src: "packages/core-utils/spec.md", dest: "packages/core-utils/spec.md" },
  { src: "packages/core-utils/docs/usage.md", dest: "packages/core-utils/usage.md" },
  { src: "packages/ui/README.md", dest: "packages/ui/index.md" },
  { src: "packages/ui/spec.md", dest: "packages/ui/spec.md" },
  { src: "packages/auth-core/README.md", dest: "packages/auth-core/index.md" },
  { src: "packages/auth-core/spec.md", dest: "packages/auth-core/spec.md" },
];

// ── Dynamic mappings: auto-discover ADRs and spec subdirs ──────────────

function discoverAdrs(): DocMapping[] {
  const adrDir = resolve(ROOT, "adr");
  if (!existsSync(adrDir)) return [];

  const mappings: DocMapping[] = [{ src: "adr/README.md", dest: "decisions/index.md" }];

  for (const file of readdirSync(adrDir)) {
    if (file.startsWith("0") && file.endsWith(".md")) {
      mappings.push({ src: `adr/${file}`, dest: `decisions/${file}` });
    }
  }

  return mappings;
}

function discoverSpecs(): DocMapping[] {
  const mappings: DocMapping[] = [];
  const specDirs = ["api", "domain", "events", "data"];

  for (const dir of specDirs) {
    const specDir = resolve(ROOT, "specs", dir);
    if (!existsSync(specDir)) continue;

    for (const file of readdirSync(specDir)) {
      if (!file.endsWith(".md")) continue;
      const dest = file === "README.md" ? `specs/${dir}/index.md` : `specs/${dir}/${file}`;
      mappings.push({ src: `specs/${dir}/${file}`, dest });
    }
  }

  return mappings;
}

// ── Sync logic ─────────────────────────────────────────────────────────

function syncAll() {
  const allMappings = [...STATIC_MAPPINGS, ...discoverAdrs(), ...discoverSpecs()];

  let created = 0;
  let skipped = 0;

  for (const { src, dest } of allMappings) {
    const srcAbs = resolve(ROOT, src);
    const destAbs = resolve(CONTENT, dest);

    if (!existsSync(srcAbs)) {
      console.warn(`  skip: ${src} (not found)`);
      skipped++;
      continue;
    }

    // Ensure parent directory exists
    mkdirSync(dirname(destAbs), { recursive: true });

    // Remove existing symlink/file to recreate fresh
    if (existsSync(destAbs)) {
      unlinkSync(destAbs);
    }

    // Copy file so VitePress sees a real file (not a symlink) and
    // computes relativePath correctly for sidebar matching.
    copyFileSync(srcAbs, destAbs);
    created++;
  }

  console.log(`docs sync: ${created} copied, ${skipped} skipped`);
}

syncAll();
