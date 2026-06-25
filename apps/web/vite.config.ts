import path from "node:path";
import netlify from "@netlify/vite-plugin-tanstack-start";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";

const monorepoRoot = path.resolve(import.meta.dirname, "../..");

// Load all env vars from the monorepo root .env into process.env so that
// server-side code (Nitro / TanStack Start server functions) can read them
// via process.env.SUPABASE_URL etc.
Object.assign(process.env, loadEnv("development", monorepoRoot, ""));

export default defineConfig({
  envDir: monorepoRoot,
  resolve: {
    alias: {
      "~": path.resolve(import.meta.dirname, "src"),
      // Force tslib to its pure-ESM build. tslib's `default` export condition
      // resolves to the CJS `tslib.js` (which sets `__esModule` but has no real
      // `default`). When Nitro's SSR rollup bundles a default-style tslib import,
      // it emits `__toESM(tslib).default` — undefined at runtime — and the SSR
      // function crashes on init with "Cannot destructure property '__extends'".
      // The ESM build exposes real named exports, so no CJS interop is generated.
      tslib: "tslib/tslib.es6.mjs",
    },
  },
  server: {
    port: 3000,
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      srcDirectory: "src",
    }),
    viteReact(),
    netlify(),
    nitro(),
  ],
});
