import { afterEach, describe, expect, test } from "bun:test";
import { monthOf } from "@nafios/datetime";
import { type Money, moneyFromCents, toCents } from "@nafios/finance";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useAtomValue, useSetAtom } from "jotai";
import type { ReactNode } from "react";
import {
  _ledgerInSession,
  _metrics_maxCapped,
  _metrics_openingBalance,
  _startLedgerSession,
} from "../../src/features/finance/state/ledger-sheet/ledger-sheet.atoms.ts";
import { LedgerSheetProvider } from "../../src/features/finance/state/ledger-sheet/ledger-sheet-provider.tsx";
import { makeLedger } from "../ledger-fixtures.ts";

// The session working copy for the ledger sheet (ADR-0030): the atoms plus the
// Provider that scopes them. What is worth pinning is the LIFETIME contract —
// the Provider's `key={month}` is what discards a month's session state, so
// there is no cleanup effect to maintain. A regression there (dropping the key,
// hoisting the Provider above the route) is silent in the UI but leaks the
// previous month's ledger into the next, which is exactly what these assert.
//
// `_startLedgerSession` also FANS the ledger's two user-owned figures out into
// their own atoms, so the metric cards can be edited without writing back into
// the ledger entity. That fan-out is a second contract worth pinning: a figure
// that stops being seeded shows up as a card that renders nothing at all.

afterEach(cleanup);

/** Read + write the session in one hook, so a test can drive and observe it. */
function useSession() {
  return {
    ledger: useAtomValue(_ledgerInSession),
    openingBalance: useAtomValue(_metrics_openingBalance),
    maxCapped: useAtomValue(_metrics_maxCapped),
    start: useSetAtom(_startLedgerSession),
    setOpeningBalance: useSetAtom(_metrics_openingBalance),
  };
}

/** Cents out of a nullable session Money — `null` stays `null`, never 0. */
function cents(value: Money | null) {
  return value === null ? null : toCents(value);
}

/** The one wrapper every case renders through: a month-scoped session. */
function sheet(month: string) {
  return ({ children }: { children: ReactNode }) => (
    <LedgerSheetProvider month={month}>{children}</LedgerSheetProvider>
  );
}

describe("ledger-sheet atoms", () => {
  test("the session starts empty", () => {
    const { result } = renderHook(() => useSession(), { wrapper: sheet("July 2026") });

    // Null, not a placeholder ledger — consumers branch on it to render nothing.
    expect(result.current.ledger).toBeNull();
    // Same for the metric figures: `null` is "not read yet", never $0.00.
    expect(result.current.openingBalance).toBeNull();
    expect(result.current.maxCapped).toBeNull();
  });

  test("_startLedgerSession writes the ledger the sheet resolved", () => {
    const ledger = makeLedger();
    const { result } = renderHook(() => useSession(), { wrapper: sheet("July 2026") });

    act(() => result.current.start(ledger));

    expect(result.current.ledger).toEqual(ledger);
  });

  test("_startLedgerSession seeds the editable metrics off the same ledger", () => {
    // One write, three atoms: the entity plus the two figures the user owns. The
    // cards read the fanned-out atoms, so a figure missing here is a blank card.
    const { result } = renderHook(() => useSession(), { wrapper: sheet("July 2026") });

    act(() => result.current.start(makeLedger()));

    expect(cents(result.current.openingBalance)).toBe(715235);
    expect(cents(result.current.maxCapped)).toBe(500000);
  });

  test("the seeded figures stay Money — the codec is not lost in the fan-out", () => {
    // `set(atom, ledger.openingBalance)` passes the branded value straight
    // through; a refactor that routed it via a raw number would break `toCents`.
    const ledger = makeLedger();
    const { result } = renderHook(() => useSession(), { wrapper: sheet("July 2026") });

    act(() => result.current.start(ledger));

    expect(result.current.openingBalance).toBe(ledger.openingBalance);
    expect(result.current.maxCapped).toBe(ledger.maxCapped);
  });

  test("a second write replaces the session — a refetch never merges", () => {
    const { result } = renderHook(() => useSession(), { wrapper: sheet("July 2026") });

    act(() => result.current.start(makeLedger({ status: "ongoing" })));
    act(() => result.current.start(makeLedger({ status: "reconciling" })));

    expect(result.current.ledger?.status).toBe("reconciling");
  });

  test("a refetch re-seeds the metrics, discarding an uncommitted edit", () => {
    // The figures are a WORKING COPY of the read, not a parallel source of truth:
    // when the read lands again it wins. Persisting the edit is the mutation's
    // job (`useUpdateOpeningBal`'s optimistic-update TODO) — not the atom's.
    const { result } = renderHook(() => useSession(), { wrapper: sheet("July 2026") });

    act(() => result.current.start(makeLedger()));
    act(() => result.current.setOpeningBalance(moneyFromCents(123456)));
    expect(cents(result.current.openingBalance)).toBe(123456);

    act(() => result.current.start(makeLedger()));

    expect(cents(result.current.openingBalance)).toBe(715235);
  });

  test("editing a metric leaves the ledger entity untouched", () => {
    // The whole point of the fan-out: a card edit never mutates the resolved
    // entity, so nothing downstream of `_ledgerInSession` sees a half-saved figure.
    const { result } = renderHook(() => useSession(), { wrapper: sheet("July 2026") });

    act(() => result.current.start(makeLedger()));
    act(() => result.current.setOpeningBalance(moneyFromCents(123456)));

    expect(cents(result.current.ledger?.openingBalance ?? null)).toBe(715235);
  });
});

describe("LedgerSheetProvider", () => {
  test("switching month gives a fresh store — the previous session does not leak", () => {
    // `key={month}` remounts the Provider, so the whole store (drafts, selection,
    // collapse state — everything, not just this atom) is discarded with it.
    let month = "July 2026";
    const { result, rerender } = renderHook(() => useSession(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <LedgerSheetProvider month={month}>{children}</LedgerSheetProvider>
      ),
    });

    act(() => result.current.start(makeLedger({ month: monthOf("2026-07-01") })));
    expect(result.current.ledger).not.toBeNull();

    month = "August 2026";
    rerender();

    expect(result.current.ledger).toBeNull();
    // The metric figures ride the same store, so they are discarded with it —
    // August must never open showing July's opening balance.
    expect(result.current.openingBalance).toBeNull();
    expect(result.current.maxCapped).toBeNull();
  });

  test("re-rendering the SAME month keeps the session — no spurious reset", () => {
    const { result, rerender } = renderHook(() => useSession(), { wrapper: sheet("July 2026") });

    act(() => result.current.start(makeLedger()));
    rerender();

    expect(result.current.ledger?.id).toBe("led_july_2026");
    expect(cents(result.current.openingBalance)).toBe(715235);
  });

  test("two sibling sheets hold independent sessions", () => {
    // Store-per-Provider, not a module-level singleton: the atoms are plain
    // `atom()` values, so nothing is shared between two mounted months.
    const july = renderHook(() => useSession(), { wrapper: sheet("July 2026") });
    const august = renderHook(() => useSession(), { wrapper: sheet("August 2026") });

    act(() => july.result.current.start(makeLedger({ month: monthOf("2026-07-01") })));

    expect(july.result.current.ledger).not.toBeNull();
    expect(august.result.current.ledger).toBeNull();
    expect(august.result.current.openingBalance).toBeNull();
  });
});
