import { describe, expect, test } from "bun:test";
import { decodeMoney, encodeMoney } from "../../src/domain";
import { ENVELOPE_STATUSES, type Envelope } from "../../src/domain/envelope";
import {
  type EnvelopeRow,
  envelopePatchToUpdateRow,
  newEnvelopeToInsertRow,
  rowToEnvelope,
  statusFromDb,
  statusToDb,
  statusWriteToUpdateRow,
} from "../../src/internal/mappers/envelope.mapper";
import type { NewEnvelope } from "../../src/internal/repositories/envelope.repo";

// UNIT tests over the envelope mapper: the row↔domain translation, the
// carried_over ↔ carried-over seam (the ONLY place the snake_case label appears),
// and the money encode/decode discipline (never a JS float). The live round-trip
// against a real DB is proven by the repo-root matrix
// (tests/integration/envelope.repo.test.ts).

function envelopeRow(overrides: Partial<EnvelopeRow> = {}): EnvelopeRow {
  return {
    id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
    ledger_id: "11111111-1111-1111-1111-111111111111",
    category_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    item: "Netflix",
    amount: "19.90" as unknown as number,
    original_amount: null,
    status: "pending",
    paid_at: null,
    payment_source_id: null,
    remark: null,
    linked_member_id: null,
    sort_order: 0,
    template_id: null,
    carried_from_envelope_id: null,
    carry_over_reason: null,
    ...overrides,
  };
}

describe("the carried_over ↔ carried-over seam", () => {
  test("statusFromDb maps carried_over → 'carried-over' and the other three 1:1", () => {
    expect(statusFromDb("carried_over")).toBe("carried-over");
    expect(statusFromDb("pending")).toBe("pending");
    expect(statusFromDb("paid")).toBe("paid");
    expect(statusFromDb("skipped")).toBe("skipped");
  });

  test("statusToDb maps 'carried-over' → carried_over and the other three 1:1", () => {
    expect(statusToDb("carried-over")).toBe("carried_over");
    expect(statusToDb("pending")).toBe("pending");
    expect(statusToDb("paid")).toBe("paid");
    expect(statusToDb("skipped")).toBe("skipped");
  });

  test("round-trips exactly for every domain status (row 4)", () => {
    for (const status of ENVELOPE_STATUSES) {
      expect(statusFromDb(statusToDb(status))).toBe(status);
    }
  });
});

describe("rowToEnvelope — read", () => {
  test("maps every surfaced column; decodes money; carried_over → 'carried-over'", () => {
    const envelope = rowToEnvelope(
      envelopeRow({
        status: "carried_over",
        amount: "120.00" as unknown as number,
        payment_source_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        remark: "monthly",
        linked_member_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        sort_order: 3,
      }),
    );
    const expected: Envelope = {
      id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      ledgerId: "11111111-1111-1111-1111-111111111111",
      category: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      item: "Netflix",
      amount: decodeMoney("120.00"),
      originalAmount: null,
      status: "carried-over",
      paidAt: null,
      paymentSource: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      remark: "monthly",
      linkedPerson: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      sortOrder: 3,
      templateId: null,
      carriedFromEnvelopeId: null,
      carryOverReason: null,
    };
    expect(envelope).toEqual(expected);
  });

  test("re-encodes a decoded amount exactly (money never floated)", () => {
    const envelope = rowToEnvelope(envelopeRow({ amount: "120.00" as unknown as number }));
    expect(encodeMoney(envelope.amount)).toBe("120.00");
  });

  test("decodes a non-null original_amount faithfully (mapped even though EF3 is manual)", () => {
    const envelope = rowToEnvelope(envelopeRow({ original_amount: "50.00" as unknown as number }));
    expect(envelope.originalAmount).not.toBeNull();
    expect(encodeMoney(envelope.originalAmount as ReturnType<typeof decodeMoney>)).toBe("50.00");
  });

  test("carries paid_at through verbatim when status is paid", () => {
    const envelope = rowToEnvelope(
      envelopeRow({ status: "paid", paid_at: "2027-01-06T09:00:00Z" }),
    );
    expect(envelope.status).toBe("paid");
    expect(envelope.paidAt).toBe("2027-01-06T09:00:00Z");
  });
});

const NEW_ENVELOPE: NewEnvelope = {
  ledgerId: "11111111-1111-1111-1111-111111111111",
  category: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  item: "Netflix",
  amount: decodeMoney("19.90"),
};

describe("newEnvelopeToInsertRow — write", () => {
  test("encodes money, defaults status/sort_order, omits DB-defaulted & manual-only columns", () => {
    const row = newEnvelopeToInsertRow(NEW_ENVELOPE) as Record<string, unknown>;
    expect(row.ledger_id).toBe("11111111-1111-1111-1111-111111111111");
    expect(row.category_id).toBe("cccccccc-cccc-cccc-cccc-cccccccccccc");
    expect(row.item).toBe("Netflix");
    expect(row.amount).toBe("19.90"); // encodeMoney string, not a float
    expect(row.status).toBe("pending"); // default
    expect(row.paid_at).toBeNull();
    expect(row.sort_order).toBe(0); // default
    // DB defaults & manual-only columns are OMITTED (not present as keys).
    for (const omitted of [
      "user_id",
      "id",
      "created_at",
      "updated_at",
      "template_id",
      "original_amount",
      "carried_from_envelope_id",
      "carry_over_reason",
    ]) {
      expect(row).not.toHaveProperty(omitted);
    }
  });

  test("translates a provided 'carried-over' status to the carried_over label", () => {
    const row = newEnvelopeToInsertRow({ ...NEW_ENVELOPE, status: "carried-over" });
    expect(row.status).toBe("carried_over");
  });

  test("passes through provided optionals (paidAt, paymentSource, remark, linkedPerson, sortOrder)", () => {
    const row = newEnvelopeToInsertRow({
      ...NEW_ENVELOPE,
      status: "paid",
      paidAt: "2027-01-06T09:00:00Z",
      paymentSource: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      remark: "note",
      linkedPerson: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      sortOrder: 5,
    }) as Record<string, unknown>;
    expect(row.status).toBe("paid");
    expect(row.paid_at).toBe("2027-01-06T09:00:00Z");
    expect(row.payment_source_id).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(row.remark).toBe("note");
    expect(row.linked_member_id).toBe("dddddddd-dddd-dddd-dddd-dddddddddddd");
    expect(row.sort_order).toBe(5);
  });
});

describe("envelopePatchToUpdateRow — partial update", () => {
  test("includes only present keys; encodes amount; never touches status/paid_at", () => {
    const row = envelopePatchToUpdateRow({ amount: decodeMoney("99.99"), item: "X" });
    expect(row).toEqual({ amount: "99.99" as unknown as number, item: "X" });
    expect(row).not.toHaveProperty("status");
    expect(row).not.toHaveProperty("paid_at");
  });

  test("maps every line field to its DB column when present", () => {
    const row = envelopePatchToUpdateRow({
      category: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      paymentSource: null,
      remark: null,
      linkedPerson: null,
      sortOrder: 2,
    }) as Record<string, unknown>;
    expect(row).toEqual({
      category_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      payment_source_id: null,
      remark: null,
      linked_member_id: null,
      sort_order: 2,
    });
  });

  test("an empty patch yields an empty update row", () => {
    expect(envelopePatchToUpdateRow({})).toEqual({});
  });
});

describe("statusWriteToUpdateRow — the (status, paidAt) pair", () => {
  test("writes status (via the seam) and paid_at together", () => {
    expect(statusWriteToUpdateRow({ status: "paid", paidAt: "2027-01-06T09:00:00Z" })).toEqual({
      status: "paid",
      paid_at: "2027-01-06T09:00:00Z",
    });
    expect(statusWriteToUpdateRow({ status: "carried-over", paidAt: null })).toEqual({
      status: "carried_over",
      paid_at: null,
    });
  });
});
