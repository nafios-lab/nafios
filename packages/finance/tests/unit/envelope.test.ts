import { describe, expect, test } from "bun:test";
import {
  applyStatusTransition,
  countsTowardCol,
  decodeMoney,
  encodeMoney,
  ENVELOPE_STATUSES,
  type EnvelopeStatus,
  sumMoney,
} from "../../src/domain";

// The four Jan 2027 envelopes — two count toward COL, two do not.
const jan2027 = [
  { amount: decodeMoney("1200.00"), status: "pending" as EnvelopeStatus },
  { amount: decodeMoney("3107.28"), status: "paid" as EnvelopeStatus },
  { amount: decodeMoney("500.00"), status: "skipped" as EnvelopeStatus },
  { amount: decodeMoney("250.00"), status: "carried-over" as EnvelopeStatus },
];

describe("countsTowardCol & the status set", () => {
  test("#1 pending and paid count toward COL", () => {
    expect(countsTowardCol("pending")).toBe(true);
    expect(countsTowardCol("paid")).toBe(true);
  });

  test("#2 skipped and carried-over are excluded from COL", () => {
    expect(countsTowardCol("skipped")).toBe(false);
    expect(countsTowardCol("carried-over")).toBe(false);
  });

  test("#3 ENVELOPE_STATUSES is the four members in display order, no extras", () => {
    expect([...ENVELOPE_STATUSES]).toEqual(["pending", "paid", "skipped", "carried-over"]);
  });

  test("#4 the COL contributing set sums to the Jan 2027 anchor (feeds EF3.2)", () => {
    const col = sumMoney(jan2027.filter((e) => countsTowardCol(e.status)).map((e) => e.amount));
    expect(encodeMoney(col)).toBe("4307.28");
  });
});

describe("applyStatusTransition — the paidAt rule", () => {
  // Each row: [current status/paidAt] → next, now  =>  expected {status, paidAt}
  const rows: {
    n: number;
    current: { status: EnvelopeStatus; paidAt: string | null };
    next: EnvelopeStatus;
    now: string;
    expected: { status: EnvelopeStatus; paidAt: string | null };
  }[] = [
    {
      n: 5,
      current: { status: "pending", paidAt: null },
      next: "paid",
      now: "T1",
      expected: { status: "paid", paidAt: "T1" },
    },
    {
      n: 6,
      current: { status: "paid", paidAt: "T1" },
      next: "pending",
      now: "T2",
      expected: { status: "pending", paidAt: null },
    },
    {
      n: 7,
      current: { status: "paid", paidAt: "T1" },
      next: "skipped",
      now: "T2",
      expected: { status: "skipped", paidAt: null },
    },
    {
      n: 8,
      current: { status: "paid", paidAt: "T1" },
      next: "carried-over",
      now: "T2",
      expected: { status: "carried-over", paidAt: null },
    },
    {
      n: 9,
      current: { status: "skipped", paidAt: null },
      next: "paid",
      now: "T3",
      expected: { status: "paid", paidAt: "T3" },
    },
    {
      n: 10,
      current: { status: "carried-over", paidAt: null },
      next: "paid",
      now: "T4",
      expected: { status: "paid", paidAt: "T4" },
    },
    {
      n: 11,
      current: { status: "paid", paidAt: "T1" },
      next: "paid",
      now: "T5",
      expected: { status: "paid", paidAt: "T1" },
    },
    {
      n: 12,
      current: { status: "pending", paidAt: null },
      next: "skipped",
      now: "T6",
      expected: { status: "skipped", paidAt: null },
    },
    {
      n: 13,
      current: { status: "pending", paidAt: null },
      next: "carried-over",
      now: "T7",
      expected: { status: "carried-over", paidAt: null },
    },
  ];

  for (const { n, current, next, now, expected } of rows) {
    test(`#${n} ${current.status}/${current.paidAt} → ${next}`, () => {
      expect(applyStatusTransition(current, next, now)).toEqual(expected);
    });
  }

  test("#14 paid → pending → paid yields a fresh stamp on re-pay", () => {
    const afterClear = applyStatusTransition({ status: "paid", paidAt: "T1" }, "pending", "T2");
    const rePaid = applyStatusTransition(afterClear, "paid", "T8");
    expect(rePaid).toEqual({ status: "paid", paidAt: "T8" });
  });

  test("#15 invariant: paidAt != null ⟺ status === 'paid' on every result", () => {
    const allResults = [
      ...rows.map((r) => applyStatusTransition(r.current, r.next, r.now)),
      applyStatusTransition({ status: "paid", paidAt: "T1" }, "paid", "T5"),
    ];
    for (const r of allResults) {
      expect(r.paidAt !== null).toBe(r.status === "paid");
    }
  });
});
