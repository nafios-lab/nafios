// Schema-typed data clients
export { asDb, createBrowserDb, createServerDb, type Db } from "./client";

// Generated schema types — the single source of truth for the DB shape.
// Regenerate with `bun run db:types` after every migration.
export type {
  CompositeTypes,
  Database,
  Enums,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
} from "./database.types";
export { Constants } from "./database.types";
