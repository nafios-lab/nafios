/**
 * Create-ledger command — live-DB verification matrix (EF3.7 §6).
 *
 * NON-GATING. Like the connection-spine and ledger-repository matrices, this
 * suite needs a live local Supabase and is run ONLY via `bun run test:integration`
 * (`bun test tests/integration/`), which `bun run check` never calls — there is
 * no live Supabase in CI. It proves what mocked unit tests cannot: the real
 * pre-write rejections (no write), the real park-then-insert with compensation
 * on a lost `duplicate_month` race, the "at most one ongoing" invariant enforced
 * by `uq_one_ongoing_ledger`, and RLS caller isolation — against two seeded users.
 *
 * Unlike the EF3.6 matrix this drives the PUBLIC, barrel-exported command
 * (`createLedgerCommands`) — the app-facing write surface EF3.12 imports — so it
 * needs NO reach into `src/internal/` (no documented import-boundary exception).
 *
 * Prerequisites (run by the operator — all Supabase CLI commands are manual):
 *   1. `supabase db reset`  — replays migrations + seeds two users
 *      (test@nafios.local / test-b@nafios.local, both password `password123`).
 *   2. Export env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 *   3. `bun run test:integration`.
 *
 * With any of those env vars missing the suite SKIPS. `beforeEach` wipes both
 * seeded users' envelopes and ledgers via the service client, so every test
 * starts clean (the "at most one ongoing" invariant is global per user) and the
 * matrix is idempotent across runs.
 */
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { asDb } from "@nafios/database";
import {
  CodecError,
  type CreateLedgerResult,
  createLedgerCommands,
  createServiceClient,
  decodeMoney,
  decodeMonth,
  encodeMoney,
  encodeMonth,
  type FinanceClient,
  FinanceDataError,
  type LedgerCommands,
} from "@nafios/finance";
import { createAuthedClient } from "@nafios/supabase-core";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const HAS_ENV = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);

// Seeded users (supabase/seed.sql).
const USER_A = "00000000-0000-0000-0000-000000000001";
const USER_B = "00000000-0000-0000-0000-000000000002";
const PASSWORD = "password123";

// The Jan 2027 anchor (EF3 epic / §5) and neighbouring months.
const NOV_2026 = decodeMonth("2026-11-01");
const DEC_2026 = decodeMonth("2026-12-01");
const JAN = decodeMonth("2027-01-01");
const FEB = decodeMonth("2027-02-01");
const SEP = decodeMonth("2027-09-01");

// Amounts. The Jan 2027 anchor (opening 7152.35, maxCapped 6415.00 — green),
// the next-month worked values (7000.00 / 6000.00), and the guardrail edges.
const OPENING = decodeMoney("7152.35");
const MAXCAP = decodeMoney("6415.00");
const OPENING2 = decodeMoney("7000.00");
const MAXCAP2 = decodeMoney("6000.00");
const AMBER = decodeMoney("7500.00"); // > opening 7152.35, ≤ 2× → amber; draw 347.65
const BLOCKED = decodeMoney("20000.00"); // > 2× opening (14304.70) → blocked
const NEGATIVE = decodeMoney("-1.00");

// `today` values (caller-supplied "YYYY-MM-DD"; the command reads no clock).
const JAN_CURRENT = "2027-01-05"; // current Jan free; next Feb NOT in window (31−5=26)
const JAN_IN_WINDOW = "2027-01-28"; // next Feb IN window (31−28=3 < 7)
const JAN_EARLY = "2027-01-03"; // current Jan free (opening current while a prev is stuck)
const JAN_OUT_OF_WINDOW = "2027-01-10"; // next Feb window shut (31−10=21)
const FEB_OUT_OF_WINDOW = "2027-02-10"; // current Feb; next Mar window shut (28−10=18)

async function signIn(email: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY as string, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const json = (await res.json()) as { access_token?: string; error_description?: string };
  if (!json.access_token) {
    throw new Error(`sign-in failed for ${email}: ${json.error_description ?? res.status}`);
  }
  return json.access_token;
}

function assertOk(
  r: CreateLedgerResult,
): asserts r is Extract<CreateLedgerResult, { readonly ok: true }> {
  if (!r.ok) {
    throw new Error(`expected ok:true, got ${JSON.stringify(r)}`);
  }
}

function assertRejected(
  r: CreateLedgerResult,
): asserts r is Extract<CreateLedgerResult, { readonly ok: false }> {
  if (r.ok) {
    throw new Error(`expected ok:false, got ${JSON.stringify(r)}`);
  }
}

describe.skipIf(!HAS_ENV)("create-ledger command — verification matrix (live DB)", () => {
  let service: FinanceClient;
  let cmdA: LedgerCommands;

  // A raw monthly_ledger row (the service view — user_id is visible here).
  type Row = {
    id: string;
    month: string;
    opening_balance: string;
    max_capped: string;
    status: string;
    settled_at: string | null;
    user_id: string;
  };

  const COLS = "id, month, opening_balance, max_capped, status, settled_at, user_id";

  /** All of a user's ledgers via the service client (bypasses RLS), chronological. */
  async function ledgersOf(userId: string): Promise<Row[]> {
    const { data, error } = await service
      .from("monthly_ledger")
      .select(COLS)
      .eq("user_id", userId)
      .order("month", { ascending: true });
    if (error) {
      throw new Error(`ledgersOf(${userId}): ${error.message}`);
    }
    return (data ?? []) as unknown as Row[];
  }

  /** The user's `ongoing` ledgers (the invariant probe — must never exceed one). */
  async function ongoingOf(userId: string): Promise<Row[]> {
    return (await ledgersOf(userId)).filter((l) => l.status === "ongoing");
  }

  /** Seed a ledger directly (service client → user_id set explicitly), for the
   *  stuck-previous-month (S5) and RLS-isolation setups. */
  async function seed(
    userId: string,
    month: ReturnType<typeof decodeMonth>,
    status: "ongoing" | "reconciling",
  ): Promise<Row> {
    const { data, error } = await service
      .from("monthly_ledger")
      .insert({
        user_id: userId,
        month: encodeMonth(month),
        opening_balance: encodeMoney(OPENING) as unknown as number,
        max_capped: encodeMoney(MAXCAP) as unknown as number,
        status,
      })
      .select(COLS)
      .single();
    if (error || !data) {
      throw new Error(`seed(${userId}, ${encodeMonth(month)}): ${error?.message}`);
    }
    return data as unknown as Row;
  }

  async function envelopeCount(ledgerId: string): Promise<number> {
    const { count, error } = await service
      .from("envelope")
      .select("id", { count: "exact", head: true })
      .eq("ledger_id", ledgerId);
    if (error) {
      throw new Error(`envelopeCount(${ledgerId}): ${error.message}`);
    }
    return count ?? 0;
  }

  async function cleanup() {
    // Envelopes first (FK → monthly_ledger), then the ledgers themselves.
    await service.from("envelope").delete().in("user_id", [USER_A, USER_B]);
    await service.from("monthly_ledger").delete().in("user_id", [USER_A, USER_B]);
  }

  beforeAll(async () => {
    const [tokenA] = await Promise.all([signIn("test@nafios.local")]);
    const authedA = asDb(createAuthedClient(tokenA));
    service = createServiceClient();
    cmdA = createLedgerCommands(authedA);
  });

  beforeEach(cleanup);

  // ─────────────────────── Happy paths — open a month ───────────────────────

  test("row 1 — fresh start: no ongoing to park → single insert, parkedLedgerId null, zero envelopes", async () => {
    const result = await cmdA.createLedger({
      month: JAN,
      openingBalance: OPENING,
      maxCapped: MAXCAP,
      confirmed: false, // green zone — confirmed irrelevant
      today: JAN_CURRENT,
    });
    assertOk(result);
    expect(result.parkedLedgerId).toBeNull();

    const ongoing = await ongoingOf(USER_A);
    expect(ongoing).toHaveLength(1);
    expect(ongoing[0]?.month).toBe("2027-01-01");
    expect(ongoing[0]?.settled_at).toBeNull();
    expect(await envelopeCount(result.ledger.id)).toBe(0);
  });

  test("row 2 — in-window: open NEXT month, current ongoing parked → parkedLedgerId set, sole ongoing is the new month", async () => {
    const jan = await cmdA.createLedger({
      month: JAN,
      openingBalance: OPENING,
      maxCapped: MAXCAP,
      confirmed: false,
      today: JAN_CURRENT,
    });
    assertOk(jan);

    const feb = await cmdA.createLedger({
      month: FEB,
      openingBalance: OPENING2,
      maxCapped: MAXCAP2,
      confirmed: false,
      today: JAN_IN_WINDOW,
    });
    assertOk(feb);
    expect(feb.parkedLedgerId).toBe(jan.ledger.id);

    const all = await ledgersOf(USER_A);
    expect(all.find((l) => l.month === "2027-01-01")?.status).toBe("reconciling");
    const ongoing = await ongoingOf(USER_A);
    expect(ongoing).toHaveLength(1);
    expect(ongoing[0]?.month).toBe("2027-02-01");
  });

  test("row 3 — S5: a previous month stuck ongoing; open the current month → previous parked, current ongoing", async () => {
    const dec = await seed(USER_A, DEC_2026, "ongoing");

    const result = await cmdA.createLedger({
      month: JAN,
      openingBalance: OPENING,
      maxCapped: MAXCAP,
      confirmed: false,
      today: JAN_EARLY,
    });
    assertOk(result);
    expect(result.parkedLedgerId).toBe(dec.id);

    const all = await ledgersOf(USER_A);
    expect(all.find((l) => l.month === "2026-12-01")?.status).toBe("reconciling");
    expect(all.find((l) => l.month === "2027-01-01")?.status).toBe("ongoing");
  });

  test("row 4 — round-trip: the created next-month ledger re-encodes month/opening/maxCapped exactly", async () => {
    assertOk(
      await cmdA.createLedger({
        month: JAN,
        openingBalance: OPENING,
        maxCapped: MAXCAP,
        confirmed: false,
        today: JAN_CURRENT,
      }),
    );
    const feb = await cmdA.createLedger({
      month: FEB,
      openingBalance: OPENING2,
      maxCapped: MAXCAP2,
      confirmed: false,
      today: JAN_IN_WINDOW,
    });
    assertOk(feb);
    expect(encodeMonth(feb.ledger.month)).toBe("2027-02-01");
    expect(encodeMoney(feb.ledger.openingBalance)).toBe("7000.00");
    expect(encodeMoney(feb.ledger.maxCapped)).toBe("6000.00");
  });

  // ─────────────── Pre-write rejections — result union, no write ───────────────

  test("row 5 — negative openingBalance → negative_amount, guardrail null, NO ledger created", async () => {
    const result = await cmdA.createLedger({
      month: JAN,
      openingBalance: NEGATIVE,
      maxCapped: MAXCAP,
      confirmed: false,
      today: JAN_CURRENT,
    });
    assertRejected(result);
    expect(result.reason).toBe("negative_amount");
    expect(result.guardrail).toBeNull();
    expect(await ledgersOf(USER_A)).toHaveLength(0);
  });

  test("row 6 — amber (maxCapped > opening), not confirmed → requires_confirmation w/ savingsDraw, no write", async () => {
    const result = await cmdA.createLedger({
      month: JAN,
      openingBalance: OPENING,
      maxCapped: AMBER,
      confirmed: false,
      today: JAN_CURRENT,
    });
    assertRejected(result);
    expect(result.reason).toBe("requires_confirmation");
    expect(result.guardrail?.zone).toBe("amber");
    expect(result.guardrail?.savingsDraw && encodeMoney(result.guardrail.savingsDraw)).toBe(
      "347.65",
    );
    expect(await ledgersOf(USER_A)).toHaveLength(0);
  });

  test("row 7 — same amber value confirmed → ok, ledger created with the amber maxCapped", async () => {
    const result = await cmdA.createLedger({
      month: JAN,
      openingBalance: OPENING,
      maxCapped: AMBER,
      confirmed: true,
      today: JAN_CURRENT,
    });
    assertOk(result);
    expect(encodeMoney(result.ledger.maxCapped)).toBe("7500.00");
  });

  test("row 8 — blocked (maxCapped > 2× opening), confirmed:true → exceeds_hard_cap, NO override, no write", async () => {
    const result = await cmdA.createLedger({
      month: JAN,
      openingBalance: OPENING,
      maxCapped: BLOCKED,
      confirmed: true, // ignored — the block is absolute
      today: JAN_CURRENT,
    });
    assertRejected(result);
    expect(result.reason).toBe("exceeds_hard_cap");
    expect(result.guardrail?.zone).toBe("blocked");
    expect(await ledgersOf(USER_A)).toHaveLength(0);
  });

  test("row 9 — far-future month (not in openable set) → month_not_openable, no write", async () => {
    const result = await cmdA.createLedger({
      month: SEP,
      openingBalance: OPENING,
      maxCapped: MAXCAP,
      confirmed: false,
      today: FEB_OUT_OF_WINDOW,
    });
    assertRejected(result);
    expect(result.reason).toBe("month_not_openable");
    expect(result.guardrail).toBeNull();
    expect(await ledgersOf(USER_A)).toHaveLength(0);
  });

  test("row 10 — back-fill (past month) → month_not_openable, no write", async () => {
    const result = await cmdA.createLedger({
      month: NOV_2026,
      openingBalance: OPENING,
      maxCapped: MAXCAP,
      confirmed: false,
      today: FEB_OUT_OF_WINDOW,
    });
    assertRejected(result);
    expect(result.reason).toBe("month_not_openable");
    expect(await ledgersOf(USER_A)).toHaveLength(0);
  });

  test("row 11 — current month already has a ledger → month_not_openable (taken month never offered), no new write", async () => {
    assertOk(
      await cmdA.createLedger({
        month: JAN,
        openingBalance: OPENING,
        maxCapped: MAXCAP,
        confirmed: false,
        today: JAN_CURRENT,
      }),
    );
    const again = await cmdA.createLedger({
      month: JAN,
      openingBalance: OPENING,
      maxCapped: MAXCAP,
      confirmed: false,
      today: JAN_CURRENT,
    });
    assertRejected(again);
    expect(again.reason).toBe("month_not_openable");
    expect(await ledgersOf(USER_A)).toHaveLength(1);
  });

  test("row 12 — next month OUTSIDE the window → month_not_openable (openable.next null), no write", async () => {
    const result = await cmdA.createLedger({
      month: FEB,
      openingBalance: OPENING,
      maxCapped: MAXCAP,
      confirmed: false,
      today: JAN_OUT_OF_WINDOW,
    });
    assertRejected(result);
    expect(result.reason).toBe("month_not_openable");
    expect(await ledgersOf(USER_A)).toHaveLength(0);
  });

  // ──────────────── Atomicity — park/insert & compensation ────────────────

  test("row 13 — lost race: month validated free, taken before insert → throws duplicate_month, park compensated", async () => {
    // Seed the current ongoing (Jan) the command will park.
    await cmdA.createLedger({
      month: JAN,
      openingBalance: OPENING,
      maxCapped: MAXCAP,
      confirmed: false,
      today: JAN_CURRENT,
    });

    // Drive the REAL command through a client whose monthly_ledger INSERT is
    // delayed just enough to inject a concurrent, conflicting Feb row (via the
    // service client) AFTER the openable check read Feb as free but BEFORE the
    // command's own insert runs — a genuine TOCTOU. The injected Feb is
    // `reconciling` so the conflict is uq_ledger_user_month (duplicate_month),
    // not uq_one_ongoing_ledger — pinning the reported code deterministically.
    let injected = false;
    const [tokenA] = await Promise.all([signIn("test@nafios.local")]);
    const realA = asDb(createAuthedClient(tokenA));
    const raceClient = new Proxy(realA, {
      get(target, prop, receiver) {
        if (prop === "from") {
          return (table: string) => {
            const builder = (target as unknown as { from: (t: string) => object }).from(table);
            if (table !== "monthly_ledger") {
              return builder;
            }
            return new Proxy(builder, {
              get(bTarget, bProp, bReceiver) {
                if (bProp === "insert" && !injected) {
                  return (row: unknown) => {
                    const chain = (bTarget as { insert: (r: unknown) => unknown }).insert(row) as {
                      select: (c: string) => { single: () => Promise<unknown> };
                    };
                    return {
                      select: (cols: string) => ({
                        single: async () => {
                          if (!injected) {
                            injected = true;
                            await seed(USER_A, FEB, "reconciling"); // the concurrent write
                          }
                          return chain.select(cols).single();
                        },
                      }),
                    };
                  };
                }
                const value = Reflect.get(bTarget, bProp, bReceiver);
                return typeof value === "function" ? value.bind(bTarget) : value;
              },
            });
          };
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as FinanceClient;

    const cmdRace = createLedgerCommands(raceClient);
    let thrown: unknown;
    try {
      await cmdRace.createLedger({
        month: FEB,
        openingBalance: OPENING2,
        maxCapped: MAXCAP2,
        confirmed: false,
        today: JAN_IN_WINDOW,
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(FinanceDataError);
    expect((thrown as FinanceDataError).code).toBe("duplicate_month");

    // Compensation: the parked Jan was reverted to `ongoing` before the throw.
    const jan = (await ledgersOf(USER_A)).find((l) => l.month === "2027-01-01");
    expect(jan?.status).toBe("ongoing");
  });

  test("row 14 — invariant: exactly one ongoing ledger for A across a park-then-insert", async () => {
    assertOk(
      await cmdA.createLedger({
        month: JAN,
        openingBalance: OPENING,
        maxCapped: MAXCAP,
        confirmed: false,
        today: JAN_CURRENT,
      }),
    );
    assertOk(
      await cmdA.createLedger({
        month: FEB,
        openingBalance: OPENING2,
        maxCapped: MAXCAP2,
        confirmed: false,
        today: JAN_IN_WINDOW,
      }),
    );
    expect(await ongoingOf(USER_A)).toHaveLength(1);
  });

  test("row 15 — the parked ledger keeps opening/maxCapped/month; only status flips to reconciling", async () => {
    const jan = await cmdA.createLedger({
      month: JAN,
      openingBalance: OPENING,
      maxCapped: MAXCAP,
      confirmed: false,
      today: JAN_CURRENT,
    });
    assertOk(jan);
    assertOk(
      await cmdA.createLedger({
        month: FEB,
        openingBalance: OPENING2,
        maxCapped: MAXCAP2,
        confirmed: false,
        today: JAN_IN_WINDOW,
      }),
    );
    const parked = (await ledgersOf(USER_A)).find((l) => l.id === jan.ledger.id);
    expect(parked?.status).toBe("reconciling");
    expect(parked?.month).toBe("2027-01-01");
    expect(decodeMoney(parked?.opening_balance ?? "")).toBe(OPENING);
    expect(decodeMoney(parked?.max_capped ?? "")).toBe(MAXCAP);
  });

  // ─────────────────────── RLS / caller isolation ───────────────────────

  test("row 16 — A's insert never sets user_id (DB default = A); B's ledger untouched", async () => {
    const bLedger = await seed(USER_B, JAN, "ongoing");
    const result = await cmdA.createLedger({
      month: JAN,
      openingBalance: OPENING,
      maxCapped: MAXCAP,
      confirmed: false,
      today: JAN_CURRENT,
    });
    assertOk(result);

    const aRows = await ledgersOf(USER_A);
    expect(aRows).toHaveLength(1);
    expect(aRows[0]?.user_id).toBe(USER_A);

    const bRows = await ledgersOf(USER_B);
    expect(bRows).toHaveLength(1);
    expect(bRows[0]?.id).toBe(bLedger.id);
    expect(bRows[0]?.status).toBe("ongoing");
  });

  test("row 17 — malformed `today` throws CodecError (not a result rejection, not FinanceDataError)", async () => {
    for (const today of ["2027-13-01", ""]) {
      let thrown: unknown;
      try {
        await cmdA.createLedger({
          month: JAN,
          openingBalance: OPENING,
          maxCapped: MAXCAP,
          confirmed: false,
          today,
        });
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(CodecError);
    }
    expect(await ledgersOf(USER_A)).toHaveLength(0);
  });
});
