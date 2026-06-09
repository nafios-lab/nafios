/**
 * Pipeline proof test — proves the migration + RLS system works end-to-end.
 *
 * Creates a throwaway table with the RLS pattern from specs/data/table-conventions.md
 * inside a transaction, asserts row-level isolation between two simulated identities,
 * and rolls back — leaving zero NafiOS tables.
 *
 * Requires a running local Supabase stack (`bunx supabase start`).
 * Uses DATABASE_URL for a direct Postgres connection.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const USER_A_ID = "aaaaaaaa-aaaa-aaaa-aaaa-00000000000a";
const USER_B_ID = "bbbbbbbb-bbbb-bbbb-bbbb-00000000000b";

let sql: SQL;

beforeAll(() => {
  sql = new SQL(DATABASE_URL);
});

afterAll(async () => {
  if (sql) {
    await sql.close();
  }
});

describe("pipeline proof: RLS isolation in a rolled-back transaction", () => {
  test("user B cannot read user A's row via RLS policy", async () => {
    // Use a raw connection so we can control the transaction and SET LOCAL.
    // Bun's SQL tagged template returns result arrays.

    // --- Begin transaction ---
    await sql.unsafe("BEGIN");

    try {
      // 1. Create a throwaway table using the standard column set template
      //    (from specs/data/table-conventions.md)
      await sql.unsafe(`
        CREATE TABLE _pipeline_probe (
          id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          created_at  timestamptz NOT NULL DEFAULT now(),
          updated_at  timestamptz NOT NULL DEFAULT now(),
          deleted_at  timestamptz,
          created_by  uuid REFERENCES auth.users(id),
          updated_by  uuid REFERENCES auth.users(id),
          owner       uuid NOT NULL DEFAULT auth.uid(),
          data        text
        )
      `);

      // 2. Apply the RLS pattern (from specs/data/table-conventions.md)
      await sql.unsafe("ALTER TABLE _pipeline_probe ENABLE ROW LEVEL SECURITY");
      await sql.unsafe(`
        CREATE POLICY _pipeline_probe_owner ON _pipeline_probe
          FOR ALL
          USING   (owner = auth.uid())
          WITH CHECK (owner = auth.uid())
      `);

      // 3. Switch to 'authenticated' role so RLS applies
      //    (superuser/postgres bypasses RLS)
      await sql.unsafe("SET LOCAL role = 'authenticated'");

      // 4. Insert a row as User A
      await sql.unsafe(`
        SET LOCAL request.jwt.claims = '{"sub":"${USER_A_ID}"}'
      `);
      await sql.unsafe("INSERT INTO _pipeline_probe (data) VALUES ('secret from A')");

      // 5. Verify User A can see their own row
      const userARows = await sql.unsafe("SELECT count(*)::int AS cnt FROM _pipeline_probe");
      expect(userARows[0].cnt).toBe(1);

      // 6. Switch identity to User B
      await sql.unsafe(`
        SET LOCAL request.jwt.claims = '{"sub":"${USER_B_ID}"}'
      `);

      // 7. Assert: User B sees zero rows (RLS isolation)
      const userBRows = await sql.unsafe("SELECT count(*)::int AS cnt FROM _pipeline_probe");
      expect(userBRows[0].cnt).toBe(0);
    } finally {
      // --- Always roll back — leave zero tables ---
      await sql.unsafe("ROLLBACK");
    }

    // 8. Confirm the throwaway table does not exist after rollback
    const tableCheck = await sql.unsafe(`
      SELECT count(*)::int AS cnt
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = '_pipeline_probe'
    `);
    expect(tableCheck[0].cnt).toBe(0);
  });

  test("no NafiOS tables exist in the public schema", async () => {
    // Confirm that after the rolled-back test (or on a clean schema),
    // there are zero application tables in public.
    const tables = await sql.unsafe(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
    `);

    // Supabase may have its own internal tables in public (e.g. schema_migrations).
    // Filter to only NafiOS tables (none should exist).
    const nafiosTables = tables.filter(
      (t: { table_name: string }) =>
        !t.table_name.startsWith("schema_migrations") && !t.table_name.startsWith("_"),
    );
    expect(nafiosTables).toHaveLength(0);
  });
});
