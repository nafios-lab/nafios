// @nafios/finance — domain layer (pure).
//
// Reserved for framework-agnostic domain types, enums, and the Money/Month
// codecs. Zero I/O: this layer must never import the data layer
// (`src/internal/`), `@nafios/database`, `@nafios/supabase-core`, or
// `@supabase/*` — a Biome import-boundary rule (see root biome.json) enforces
// it.
export * from "./codec-error";
export * from "./creation-window";
export * from "./envelope";
export * from "./ledger-metrics";
export * from "./money";
export * from "./month";
export * from "./monthly-ledger";
