// @nafios/finance — domain layer (pure).
//
// Reserved for framework-agnostic domain types, enums, and the Money/Month
// codecs. Zero I/O: this layer must never import the data layer
// (`src/internal/`), `@nafios/database`, `@nafios/supabase-core`, or
// `@supabase/*` — a Biome import-boundary rule (see root biome.json) enforces
// it. It is deliberately empty at EF2; types and codecs land with later
// finance feature tickets.
export {};
