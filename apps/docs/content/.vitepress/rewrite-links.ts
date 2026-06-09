/**
 * rewrite-links.ts
 *
 * markdown-it plugin that rewrites relative links from their original
 * monorepo paths to the VitePress content paths.
 *
 * The source .md files use paths like `../../adr/0001-bun-monorepo.md`
 * which make sense in the repo but break in VitePress where content
 * is symlinked into a flat structure.
 */
import type MarkdownIt from "markdown-it";

/**
 * Map of regex patterns to replacement functions.
 * Order matters — first match wins.
 */
const REWRITE_RULES: Array<{
  pattern: RegExp;
  replace: (match: RegExpMatchArray) => string;
}> = [
  // ── ADR links ────────────────────────────────────────────────────

  // ../../adr/NNNN-slug.md  or  ../adr/NNNN-slug.md  →  /decisions/NNNN-slug
  {
    pattern: /^(?:\.\.\/)+adr\/(0\d{3}-[^)]+)\.md$/,
    replace: (m) => `/decisions/${m[1]}`,
  },

  // Sibling ADR links (from within adr/): 0001-bun-monorepo.md → /decisions/0001-bun-monorepo
  {
    pattern: /^(0\d{3}-[^)]+)\.md$/,
    replace: (m) => `/decisions/${m[1]}`,
  },

  // ── Spec links ───────────────────────────────────────────────────

  // ../../specs/README.md  →  /specs/
  {
    pattern: /^(?:\.\.\/)+specs\/README\.md$/,
    replace: () => `/specs/`,
  },

  // _template.md or ./_template.md (from specs/) → /specs/template
  {
    pattern: /^(?:\.\/)?_template\.md$/,
    replace: () => `/specs/template`,
  },

  // Sibling spec data links: table-conventions.md → /specs/data/table-conventions
  // (used from within specs/data/)
  {
    pattern:
      /^(table-conventions|migration-conventions|supabase-local-stack|deferred-work-register)\.md$/,
    replace: (m) => `/specs/data/${m[1]}`,
  },

  // ../../specs/data/*.md → /specs/data/*
  {
    pattern: /^(?:\.\.\/)+specs\/data\/([^)]+)\.md$/,
    replace: (m) => `/specs/data/${m[1]}`,
  },

  // ── Context doc links (sibling within .claude/context/) ──────────

  // conventions.md, tech-stack.md, architecture.md, glossary.md → /guide/*
  {
    pattern: /^(conventions|tech-stack|architecture|glossary)\.md$/,
    replace: (m) => `/guide/${m[1]}`,
  },

  // ── Context doc links (from deeper paths) ────────────────────────

  // ../../.claude/context/*.md → /guide/*
  {
    pattern: /^(?:\.\.\/)+\.claude\/context\/(conventions|tech-stack|architecture|glossary)\.md$/,
    replace: (m) => `/guide/${m[1]}`,
  },

  // ── Package links ────────────────────────────────────────────────

  // ../../packages/core-utils/ → /packages/core-utils/
  {
    pattern: /^(?:\.\.\/)+packages\/([^/]+)\/?$/,
    replace: (m) => `/packages/${m[1]}/`,
  },

  // ../../packages/*/spec.md → /packages/*/spec
  {
    pattern: /^(?:\.\.\/)+packages\/([^/]+)\/spec\.md$/,
    replace: (m) => `/packages/${m[1]}/spec`,
  },

  // ./spec.md or ./CLAUDE.md from within a package
  {
    pattern: /^\.\/spec\.md$/,
    replace: () => `spec`,
  },

  // ── ADR README ───────────────────────────────────────────────────

  // ../../adr/README.md → /decisions/
  {
    pattern: /^(?:\.\.\/)+adr\/README\.md$/,
    replace: () => `/decisions/`,
  },

  // ── Root CLAUDE.md (informational, link to guide) ────────────────
  {
    pattern: /^(?:\.\.\/)+CLAUDE\.md$/,
    replace: () => `/guide/architecture`,
  },
];

/**
 * Try to rewrite a href. Returns the original if no rule matches.
 */
function rewriteHref(href: string): string {
  for (const { pattern, replace } of REWRITE_RULES) {
    const match = href.match(pattern);
    if (match) {
      return replace(match);
    }
  }
  return href;
}

/**
 * markdown-it plugin — walks all link_open tokens and rewrites href attributes.
 */
export function rewriteLinksPlugin(md: MarkdownIt): void {
  md.core.ruler.push("rewrite-links", (state) => {
    for (const token of state.tokens) {
      if (token.type === "inline" && token.children) {
        for (const child of token.children) {
          if (child.type === "link_open") {
            const hrefAttr = child.attrGet("href");
            if (hrefAttr && !hrefAttr.startsWith("http") && !hrefAttr.startsWith("#")) {
              child.attrSet("href", rewriteHref(hrefAttr));
            }
          }
        }
      }
    }
  });
}
