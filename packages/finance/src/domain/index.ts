// @nafios/finance — domain layer (pure).
//
// Reserved for framework-agnostic domain types, enums, and the Money codec.
// Zero I/O: this layer must never import the data layer (`src/internal/`),
// `@nafios/database`, `@nafios/supabase-core`, or `@supabase/*` — a Biome
// import-boundary rule (see root biome.json) enforces it. (`@nafios/datetime`,
// a pure sibling package, is allowed — it holds the shared `Month` primitive.)

// `Month` + its codec/math live in @nafios/datetime — a shared temporal
// primitive extracted from finance (2026-08). Re-exported here so
// `@nafios/finance`'s public surface still carries `Month` (finance's own public
// types reference it), keeping every existing `import { Month } from
// "@nafios/finance"` working. NOT re-exported: `daysInMonth` / the month
// formatters / datetime's `CodecError` (finance never surfaced them, and its own
// money `CodecError` owns that name here).
export {
  addMonths,
  compareMonths,
  decodeMonth,
  encodeMonth,
  type Month,
  monthOf,
} from "@nafios/datetime";
export * from "./category";
export * from "./codec-error";
export * from "./creation-window";
export * from "./default-categories";
export * from "./envelope";
export * from "./ledger-metrics";
export * from "./max-capped";
export * from "./money";
export * from "./monthly-ledger";
