import { afterEach, describe, expect, test } from "bun:test";
import { monthOf } from "@nafios/datetime";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useAtomValue, useSetAtom } from "jotai";
import type { ReactNode } from "react";
import {
  _ledgerInSession,
  _startLedgerSession,
} from "../../src/features/finance/state/ledger-sheet/ledger-sheet.atoms.ts";
import { LedgerSheetProvider } from "../../src/features/finance/state/ledger-sheet/ledger-sheet-provider.tsx";
import { makeLedger } from "../ledger-fixtures.ts";

// The client-state tier for the ledger sheet (ADR-0029): the atoms plus the
// Provider that scopes them. What is worth pinning is the LIFETIME contract —
// the Provider's `key={month}` is what discards a month's session state, so
// there is no cleanup effect to maintain. A regression there (dropping the key,
// hoisting the Provider above the route) is silent in the UI but leaks the
// previous month's ledger into the next, which is exactly what these assert.

afterEach(cleanup);

/** Read + write the session in one hook, so a test can drive and observe it. */
function useSession() {
  return { ledger: useAtomValue(_ledgerInSession), start: useSetAtom(_startLedgerSession) };
}

describe("ledger-sheet atoms", () => {
  test("the session starts empty", () => {
    const { result } = renderHook(() => useSession(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <LedgerSheetProvider month="July 2026">{children}</LedgerSheetProvider>
      ),
    });

    // Null, not a placeholder ledger — consumers branch on it to render nothing.
    expect(result.current.ledger).toBeNull();
  });

  test("_startLedgerSession writes the ledger the sheet resolved", () => {
    const ledger = makeLedger();
    const { result } = renderHook(() => useSession(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <LedgerSheetProvider month="July 2026">{children}</LedgerSheetProvider>
      ),
    });

    act(() => result.current.start(ledger));

    expect(result.current.ledger).toEqual(ledger);
  });

  test("a second write replaces the session — a refetch never merges", () => {
    const { result } = renderHook(() => useSession(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <LedgerSheetProvider month="July 2026">{children}</LedgerSheetProvider>
      ),
    });

    act(() => result.current.start(makeLedger({ status: "ongoing" })));
    act(() => result.current.start(makeLedger({ status: "reconciling" })));

    expect(result.current.ledger?.status).toBe("reconciling");
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
  });

  test("re-rendering the SAME month keeps the session — no spurious reset", () => {
    const { result, rerender } = renderHook(() => useSession(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <LedgerSheetProvider month="July 2026">{children}</LedgerSheetProvider>
      ),
    });

    act(() => result.current.start(makeLedger()));
    rerender();

    expect(result.current.ledger?.id).toBe("led_july_2026");
  });

  test("two sibling sheets hold independent sessions", () => {
    // Store-per-Provider, not a module-level singleton: the atoms are plain
    // `atom()` values, so nothing is shared between two mounted months.
    const july = renderHook(() => useSession(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <LedgerSheetProvider month="July 2026">{children}</LedgerSheetProvider>
      ),
    });
    const august = renderHook(() => useSession(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <LedgerSheetProvider month="August 2026">{children}</LedgerSheetProvider>
      ),
    });

    act(() => july.result.current.start(makeLedger({ month: monthOf("2026-07-01") })));

    expect(july.result.current.ledger).not.toBeNull();
    expect(august.result.current.ledger).toBeNull();
  });
});
