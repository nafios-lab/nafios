import { afterEach, describe, expect, test } from "bun:test";
import { type Money, moneyFromCents, toCents } from "@nafios/finance";
import { act, cleanup, renderHook } from "@testing-library/react";
import { createStore, Provider, useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { useUpdateOpeningBal } from "../../src/features/finance/hooks/use-update-opening-bal.ts";
import {
  _ledgerInSession,
  _metrics_maxCapped,
  _metrics_openingBalance,
  _startLedgerSession,
} from "../../src/features/finance/state/ledger-sheet/ledger-sheet.atoms.ts";
import { makeLedger } from "../ledger-fixtures.ts";

// The write half of the opening-balance metric. Today it is session-only — the
// persistence and the optimistic update are still a TODO in the hook — so what is
// pinned here is the BLAST RADIUS: exactly one atom moves, and it moves in Money.
// When the mutation lands, these tests are the ones to extend, not replace.

afterEach(cleanup);

/** The hook plus what it is allowed to touch, driven inside one session store. */
function renderUpdater(seed?: boolean) {
  const store = createStore();
  if (seed) store.set(_startLedgerSession, makeLedger());

  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const { result } = renderHook(
    () => ({
      update: useUpdateOpeningBal(),
      openingBalance: useAtomValue(_metrics_openingBalance),
    }),
    { wrapper },
  );
  return { store, result };
}

/** Cents out of a nullable session Money — `null` stays `null`, never 0. */
function cents(value: Money | null) {
  return value === null ? null : toCents(value);
}

describe("useUpdateOpeningBal", () => {
  test("writes the amount into the session's opening balance", () => {
    const { result } = renderUpdater(true);

    act(() => result.current.update(moneyFromCents(123456)));

    expect(cents(result.current.openingBalance)).toBe(123456);
  });

  test("stores the Money it was handed — no re-derivation through cents", () => {
    // The hook is a passthrough onto the atom. If it ever starts unwrapping and
    // re-branding the value, a rounding bug can slip in between the two.
    const amount = moneyFromCents(715235);
    const { result } = renderUpdater(true);

    act(() => result.current.update(amount));

    expect(result.current.openingBalance).toBe(amount);
  });

  test("writes even with no ledger in session — the atom is the only precondition", () => {
    // No guard in the hook, and none is wanted: the card that calls it is already
    // gated on a non-null balance, so a second check would be dead code.
    const { result } = renderUpdater();

    act(() => result.current.update(moneyFromCents(50000)));

    expect(cents(result.current.openingBalance)).toBe(50000);
  });

  test("touches nothing else in the session — not the entity, not the other metric", () => {
    // The whole reason the figures are fanned out of the ledger: an edit to one
    // metric must not disturb the resolved entity or its sibling figure.
    const { store, result } = renderUpdater(true);

    act(() => result.current.update(moneyFromCents(123456)));

    expect(cents(store.get(_ledgerInSession)?.openingBalance ?? null)).toBe(715235);
    expect(cents(store.get(_metrics_maxCapped))).toBe(500000);
  });

  test("successive edits replace, never accumulate", () => {
    const { result } = renderUpdater(true);

    act(() => result.current.update(moneyFromCents(100000)));
    act(() => result.current.update(moneyFromCents(250000)));

    expect(cents(result.current.openingBalance)).toBe(250000);
  });
});
