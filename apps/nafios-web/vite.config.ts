import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const monorepoRoot = path.resolve(import.meta.dirname, "../..");

// Load root .env into process.env at build time so `define` can inline the
// public anon creds. There is no server runtime in this app.
Object.assign(process.env, loadEnv("development", monorepoRoot, ""));

export default defineConfig({
  envDir: monorepoRoot,
  // Inline ONLY the public anon URL + key. NEVER SERVICE_ROLE_KEY / DATABASE_URL.
  define: {
    "process.env.SUPABASE_URL": JSON.stringify(process.env.SUPABASE_URL),
    "process.env.SUPABASE_ANON_KEY": JSON.stringify(process.env.SUPABASE_ANON_KEY),
  },
  resolve: { alias: { "~": path.resolve(import.meta.dirname, "src") } },
  server: { port: 3000 },
  plugins: [
    tailwindcss(),
    // Generates src/routeTree.gen.ts from src/routes/**. MUST precede viteReact().
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    viteReact(),
  ],
});
