// The test files import from `bun:test`. TypeScript treats `bun:test` as an
// absolute-URI module and only resolves it through an ambient
// `declare module "bun:test"` — which ships in `@types/bun` (→ `bun-types`).
//
// apps/web picked `@types/bun` up transitively (via its Netlify/Nitro/Start
// deps); this SPA dropped all of those, so nothing pulls it into the program
// and `tsc --noEmit` can't find `bun:test`. Reference it explicitly here so the
// test files typecheck. This ambient file has no runtime and is test-only, so
// it stays out of `src/`.
/// <reference types="bun" />
