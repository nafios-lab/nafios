import { describe, expect, test } from "bun:test";
import { encodeMonth } from "@nafios/datetime";
// EF3.1 codecs to build fixtures without touching raw money/month strings.
import { decodeMoney, decodeMonth } from "../../src/domain";
import { encodeMoney } from "../../src/domain/money";
import {
  newLedgerToInsertRow,
  reconPendingLedgerDTOToDomain,
  rowToLedgerHeader,
} from "../../src/internal/mappers/ledger.mapper";
import type {
  LedgerRow,
  NewLedger,
  ReconPendingLedgerDTO,
} from "../../src/internal/repositories/ledger.repo";

// A monthly_ledger row as supabase-js hands it back: numeric(12,2) arrives as a
// STRING at runtime (the generated Row type lossily says `number`), so the
// fixture stores money as strings cast to satisfy the type.
function row(overrides: Partial<LedgerRow> = {}): LedgerRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    month: "2027-01-01",
    opening_balance: "7152.35" as unknown as number,
    max_capped: "6415.00" as unknown as number,
    status: "ongoing",
    created_at: "2027-01-01T08:00:00.000Z",
    settled_at: null,
    ...overrides,
  };
}

describe("rowToLedgerHeader — exact round-trip (money never floated)", () => {
  test("decodes the Jan 2027 anchor row and re-encodes exactly", () => {
    const header = rowToLedgerHeader(row());
    expect(encodeMonth(header.month)).toBe("2027-01-01");
    expect(encodeMoney(header.openingBalance)).toBe("7152.35");
    expect(encodeMoney(header.maxCapped)).toBe("6415.00");
    expect(header.status).toBe("ongoing");
    expect(header.settledAt).toBeNull();
    expect(header.id).toBe("11111111-1111-1111-1111-111111111111");
    expect(header.createdAt).toBe("2027-01-01T08:00:00.000Z");
  });

  test("maps a settled row (all statuses read)", () => {
    const header = rowToLedgerHeader(
      row({ status: "settled", settled_at: "2027-02-01T00:00:00.000Z" }),
    );
    expect(header.status).toBe("settled");
    expect(header.settledAt).toBe("2027-02-01T00:00:00.000Z");
  });

  test("a malformed stored month surfaces EF3.1's CodecError (not a FinanceDataError)", () => {
    expect(() => rowToLedgerHeader(row({ month: "2027-01-15" }))).toThrow(
      "month must be the first of the month",
    );
  });

  test("a malformed stored money value surfaces CodecError", () => {
    expect(() =>
      rowToLedgerHeader(row({ opening_balance: "not-money" as unknown as number })),
    ).toThrow();
  });
});

describe("newLedgerToInsertRow — encodes, defaults status, omits DB-owned columns", () => {
  const base: NewLedger = {
    month: decodeMonth("2027-01-01"),
    openingBalance: decodeMoney("7152.35"),
    maxCapped: decodeMoney("6415.00"),
  };

  test("encodes month + money and defaults status to 'ongoing'", () => {
    const insert = newLedgerToInsertRow(base);
    expect(insert.month).toBe("2027-01-01");
    // numeric columns are typed `number` but carry the encoded decimal STRING at
    // runtime (the money-never-floated contract) — assert against that reality.
    expect(insert.opening_balance as unknown as string).toBe("7152.35");
    expect(insert.max_capped as unknown as string).toBe("6415.00");
    expect(insert.status).toBe("ongoing");
  });

  test("never sets user_id / id / created_at / settled_at", () => {
    const insert = newLedgerToInsertRow(base);
    expect(insert).not.toHaveProperty("user_id");
    expect(insert).not.toHaveProperty("id");
    expect(insert).not.toHaveProperty("created_at");
    expect(insert).not.toHaveProperty("settled_at");
  });

  test("passes an explicit non-settled status through", () => {
    const insert = newLedgerToInsertRow({ ...base, status: "reconciling" });
    expect(insert.status).toBe("reconciling");
  });
});

describe("reconPendingLedgerDTOToDomain — one get_pending_recon_ledgers row → domain", () => {
  // The RPC row shape: money crosses the wire as TEXT (numeric(12,2) ::text),
  // month as the first-of-month DATE, counts as plain integers, status always
  // the raw 'reconciling' enum label.
  function dto(overrides: Partial<ReconPendingLedgerDTO> = {}): ReconPendingLedgerDTO {
    return {
      id: "11111111-1111-1111-1111-111111111111",
      month: "2027-01-01",
      status: "reconciling",
      pending_env_counts: 3,
      pending_sum_amount: "1200.00",
      ...overrides,
    };
  }

  test("decodes month + money and passes counts/status through (money never floated)", () => {
    const domain = reconPendingLedgerDTOToDomain(dto());
    expect(domain.id).toBe("11111111-1111-1111-1111-111111111111");
    expect(encodeMonth(domain.month)).toBe("2027-01-01");
    expect(encodeMoney(domain.pendingSumAmount)).toBe("1200.00");
    expect(domain.pendingEnvCounts).toBe(3);
    expect(domain.status).toBe("reconciling");
  });

  test("handles the fully-resolved-but-unsettled row (LEFT JOIN LATERAL → 0 / '0.00')", () => {
    const domain = reconPendingLedgerDTOToDomain(
      dto({ pending_env_counts: 0, pending_sum_amount: "0.00" }),
    );
    expect(domain.pendingEnvCounts).toBe(0);
    expect(encodeMoney(domain.pendingSumAmount)).toBe("0.00");
  });

  test("a malformed month surfaces EF3.1's CodecError (not a FinanceDataError)", () => {
    expect(() => reconPendingLedgerDTOToDomain(dto({ month: "2027-01-15" }))).toThrow(
      "month must be the first of the month",
    );
  });

  test("a malformed money value surfaces CodecError", () => {
    expect(() => reconPendingLedgerDTOToDomain(dto({ pending_sum_amount: "not-money" }))).toThrow();
  });
});
