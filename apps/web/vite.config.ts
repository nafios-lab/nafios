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
