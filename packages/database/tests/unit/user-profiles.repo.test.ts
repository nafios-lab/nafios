import { describe, expect, test } from "bun:test";
import { insertUserProfile } from "../../src/user-profiles.repo";

/**
 * Records the `rpc` call and returns a configurable result. The repo only
 * touches `db.rpc`, so a minimal fake is enough — the real wiring (schema
 * typing, connection) is supabase-core/database client concerns tested elsewhere.
 */
function makeFakeDb(result: { error: { message: string } | null }) {
  const calls: Array<{ fn: string; args: unknown }> = [];
  const db = {
    rpc: (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return Promise.resolve(result);
    },
    // biome-ignore lint/suspicious/noExplicitAny: minimal test double for the typed Db
  } as any;
  /** The single recorded rpc call; throws if none was made. */
  const onlyCall = () => {
    const call = calls.at(0);
    if (!call) throw new Error("expected an rpc call but none was made");
    return call;
  };
  return { db, calls, onlyCall };
}

describe("insertUserProfile", () => {
  test("calls the insert_user_profile RPC with mapped (snake_case) args", async () => {
    const { db, calls, onlyCall } = makeFakeDb({ error: null });

    await insertUserProfile(db, {
      avatarUrl: "data:image/png;base64,AAA",
      familyMembers: [
        {
          name: "Jane",
          relationship: "spouse",
          avatarUrl: "data:image/png;base64,BBB",
          nric: "S1234567A",
          mobileNo: "(+65) 8123 4567",
          dateOfBirth: "1990-01-01",
        },
      ],
    });

    expect(calls).toHaveLength(1);
    expect(onlyCall().fn).toBe("insert_user_profile");
    expect(onlyCall().args).toEqual({
      p_avatar_url: "data:image/png;base64,AAA",
      p_family_members: [
        {
          name: "Jane",
          relationship: "spouse",
          avatar_url: "data:image/png;base64,BBB",
          nric: "S1234567A",
          mobile_no: "(+65) 8123 4567",
          date_of_birth: "1990-01-01",
        },
      ],
    });
  });

  test("defaults optional family-member fields to null and omits absent avatar", async () => {
    const { db, onlyCall } = makeFakeDb({ error: null });

    await insertUserProfile(db, {
      familyMembers: [{ name: "Tom", relationship: "child" }],
    });

    expect(onlyCall().args).toEqual({
      p_avatar_url: undefined,
      p_family_members: [
        {
          name: "Tom",
          relationship: "child",
          avatar_url: null,
          nric: null,
          mobile_no: null,
          date_of_birth: null,
        },
      ],
    });
  });

  test("sends an empty array when there are no family members", async () => {
    const { db, onlyCall } = makeFakeDb({ error: null });

    await insertUserProfile(db, { familyMembers: [] });

    expect(onlyCall().args).toEqual({ p_avatar_url: undefined, p_family_members: [] });
  });

  test("throws with the database error message when the RPC fails", async () => {
    const { db } = makeFakeDb({ error: { message: "violates check constraint" } });

    await expect(
      insertUserProfile(db, { familyMembers: [{ name: "X", relationship: "other" }] }),
    ).rejects.toThrow("violates check constraint");
  });
});
