import { resolve } from "node:path";
import { defineConfig } from "vitepress";
import { rewriteLinksPlugin } from "./rewrite-links";

export default defineConfig({
  title: "NafiOS Docs",
  description: "Developer documentation for the NafiOS monorepo",

  // Clean URLs (no .html suffix)
  cleanUrls: true,

  // Ignore dead links to files outside the content directory
  ignoreDeadLinks: true,

  markdown: {
    config: (md) => {
      md.use(rewriteLinksPlugin);
    },
  },

  vite: {
    resolve: {
      // Symlinked docs resolve modules from their physical location.
      // Force Vue resolution to the docs app's node_modules.
      alias: {
        vue: resolve(__dirname, "../../node_modules/vue"),
        "vue/server-renderer": resolve(__dirname, "../../node_modules/vue/server-renderer"),
      },
      // Follow symlinks to real path for correct resolution
      preserveSymlinks: false,
    },
  },

  themeConfig: {
    search: {
      provider: "local",
    },

    nav: [
      { text: "Guide", link: "/guide/architecture" },
      { text: "Decisions", link: "/decisions/" },
      { text: "Specs", link: "/specs/" },
      { text: "Packages", link: "/packages/core-utils/" },
    ],

    sidebar: {
      "/guide/": [
        {
          text: "Getting Started",
          items: [
            { text: "Architecture", link: "/guide/architecture" },
            { text: "Tech Stack", link: "/guide/tech-stack" },
            { text: "Conventions", link: "/guide/conventions" },
            { text: "Glossary", link: "/guide/glossary" },
          ],
        },
        {
          text: "Operations",
          items: [{ text: "Versioning & Release", link: "/guide/versioning-release-guide" }],
        },
      ],

      "/decisions/": [
        {
          text: "Architecture Decisions",
          items: [
            { text: "Overview", link: "/decisions/" },
            { text: "0001 — Bun Monorepo", link: "/decisions/0001-bun-monorepo" },
            { text: "0002 — TanStack Start", link: "/decisions/0002-tanstack-start-for-web-apps" },
            { text: "0003 — REST over GraphQL", link: "/decisions/0003-rest-over-graphql" },
            { text: "0004 — Vercel AI SDK", link: "/decisions/0004-vercel-ai-sdk-behind-ai-core" },
            { text: "0005 — Biome", link: "/decisions/0005-biome-over-eslint-prettier" },
            {
              text: "0006 — No-Build Packages",
              link: "/decisions/0006-no-build-internal-packages",
            },
            {
              text: "0007 — Bun Filter Tasks",
              link: "/decisions/0007-bun-native-filter-task-running",
            },
            {
              text: "0008 — Workspace Resolution",
              link: "/decisions/0008-workspace-resolution-over-path-aliases",
            },
            {
              text: "0009 — CLAUDE.md Context",
              link: "/decisions/0009-claude-md-canonical-agent-context",
            },
            { text: "0010 — Per-Package Typecheck", link: "/decisions/0010-per-package-typecheck" },
            { text: "0011 — Co-locate Specs", link: "/decisions/0011-co-locate-package-specs" },
            {
              text: "0012 — Supabase / PostgreSQL",
              link: "/decisions/0012-supabase-postgresql-database-engine",
            },
            {
              text: "0013 — SQL-First Migrations",
              link: "/decisions/0013-sql-first-migrations-supabase-cli",
            },
            { text: "0014 — No ORM", link: "/decisions/0014-no-orm-supabase-js-data-access" },
            {
              text: "0015 — Convention Templates",
              link: "/decisions/0015-conventions-as-templates-not-applied-tables",
            },
            {
              text: "0016 — Auth Schema",
              link: "/decisions/0016-auth-schema-referenced-not-owned",
            },
            {
              text: "0017 — Manual Deploy",
              link: "/decisions/0017-manual-deploy-via-github-actions-netlify-cli",
            },
          ],
        },
      ],

      "/specs/": [
        {
          text: "Specifications",
          items: [
            { text: "Overview", link: "/specs/" },
            { text: "Spec Template", link: "/specs/template" },
          ],
        },
        {
          text: "Data Conventions",
          items: [
            { text: "Table Conventions", link: "/specs/data/table-conventions" },
            { text: "Migration Conventions", link: "/specs/data/migration-conventions" },
            { text: "Supabase Local Stack", link: "/specs/data/supabase-local-stack" },
            { text: "Deferred Work Register", link: "/specs/data/deferred-work-register" },
          ],
        },
      ],

      "/packages/": [
        {
          text: "Packages",
          items: [
            {
              text: "@nafios/core-utils",
              collapsed: false,
              items: [
                { text: "Overview", link: "/packages/core-utils/" },
                { text: "Specification", link: "/packages/core-utils/spec" },
                { text: "Usage", link: "/packages/core-utils/usage" },
              ],
            },
            {
              text: "@nafios/ui",
              collapsed: false,
              items: [
                { text: "Overview", link: "/packages/ui/" },
                { text: "Specification", link: "/packages/ui/spec" },
              ],
            },
          ],
        },
      ],
    },

    socialLinks: [{ icon: "github", link: "https://github.com/nafios-lab/nafios" }],

    editLink: {
      pattern: "https://github.com/nafios-lab/nafios/edit/main/:path",
      text: "Edit this page on GitHub",
    },

    footer: {
      message: "NafiOS Developer Documentation",
    },
  },
});
