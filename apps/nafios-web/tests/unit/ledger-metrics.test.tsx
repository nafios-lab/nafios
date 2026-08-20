import { afterEach, describe, expect, test } from "bun:test";
import { type Money, moneyFromCents, toCents } from "@nafios/finance";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { LedgerLoading } from "../../src/features/finance/components/ledger/ledger-loading.tsx";
import { LedgerMetrics } from "../../src/features/finance/components/ledger/metrics/index.tsx";
import { MetricCard } from "../../src/features/finance/components/ledger/metrics/metric-card.tsx";
import { _metrics_openingBalance } from "../../src/features/finance/state/ledger-sheet/ledger-sheet.atoms.ts";

// The summary strip is MID-MIGRATION: the five hardcoded `MetricCard`s were
// replaced by one atom-driven card, `MetricOpenBalance`, and the remaining four
// figures are not wired yet. So the contracts pinned here are the ones the
// migration must preserve card-by-card:
//
//   - the card reads the SESSION copy of the figure (`_metrics_openingBalance`),
//     never a prop threaded down from the read — a regression there is invisible
//     until an edit silently fails to stick;
//   - editing round-trips: figure → field → figure, with the new amount landing
//     in the session in CENTS, through `moneyFromCents`, not as a float;
//   - `formatMoneyToFit`'s bargain holds — whenever the card abbreviates an
//     amount, the exact figure stays reachable to both eyes and screen readers.
//
// `MetricCard` is `@deprecated` and no longer composed by the strip; its suite
// stays until the last figure moves off it, so the deprecated path keeps working
// for as long as it is still in the tree.

afterEach(cleanup);

/** The summary strip inside either tree — the five-column grid. */
function strip(container: HTMLElement) {
  const el = container.querySelector(".grid-cols-5");
  if (!el) throw new Error("no five-column summary strip found");
  return el;
}

/**
 * Render the strip against a session store, the way `LedgerSheetProvider` scopes
 * it in the app. The store is returned so a test can assert what an edit WROTE
 * BACK, not merely what got re-rendered.
 */
function renderStrip(openingBalance: Money | null = moneyFromCents(715235)) {
  const store = createStore();
  store.set(_metrics_openingBalance, openingBalance);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  return { store, ...render(<LedgerMetrics />, { wrapper }) };
}

/** The currency field, once the card is in edit mode. */
function field(): HTMLInputElement {
  return screen.getByRole("textbox") as HTMLInputElement;
}

describe("LedgerMetrics — opening balance", () => {
  test("renders nothing until a ledger is in session", () => {
    // Null is the pre-read state, and the card branches on it. An empty strip is
    // the correct answer — a $0.00 card would assert a figure nobody read yet.
    const { container } = renderStrip(null);

    expect(strip(container).children).toHaveLength(0);
    expect(screen.queryByText("OPENING BAL")).toBeNull();
  });

  test("renders the caption and the session's amount, formatted to fit the card", () => {
    renderStrip(moneyFromCents(715235));

    expect(screen.getByText("OPENING BAL")).toBeTruthy();
    expect(screen.getByText("$7,152.35")).toBeTruthy();
  });

  test("tracks the session — a later write to the atom re-renders the figure", () => {
    // The card is a READER of the working copy, not a snapshot of it: whatever
    // else in the sheet updates the opening balance, this figure follows.
    const { store } = renderStrip(moneyFromCents(715235));

    act(() => store.set(_metrics_openingBalance, moneyFromCents(900000)));

    expect(screen.getByText("$9,000.00")).toBeTruthy();
    expect(screen.queryByText("$7,152.35")).toBeNull();
  });

  test("adds no tooltip or alternate text when the amount fits as-is", () => {
    // Nothing was given up, so there is no second form of the figure to expose —
    // a title here would be a tooltip repeating what is already on screen.
    renderStrip(moneyFromCents(23300));

    expect(screen.getByText("$233.00").closest("code")?.getAttribute("title")).toBeNull();
  });

  test("keeps the exact amount reachable when it abbreviates one", () => {
    // $123,456,789.00 cannot fit the card, so `formatMoneyToFit` trades precision
    // for width. The spec's rule for that trade: the UI MUST still surface `exact`.
    renderStrip(moneyFromCents(12345678900));

    const abbreviated = screen.getByText("$123.46M");
    expect(abbreviated.closest("code")?.getAttribute("title")).toBe("$123,456,789.00");
    // Sighted users get the tooltip; screen readers read the exact string instead
    // of the abbreviation, so the abbreviation is hidden from them.
    expect(abbreviated.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("$123,456,789.00").className).toContain("sr-only");
  });

  test("its card matches the skeleton's card height, so the swap causes no shift", () => {
    // Card COUNT is deliberately not asserted: the skeleton still draws five and
    // the strip is down to one while the other four figures are wired. Restore
    // the count assertion with the last of them — the shift is real until then.
    const { container: loaded } = renderStrip();
    const { container: loading } = render(<LedgerLoading />);

    for (const card of [...strip(loaded).children, ...strip(loading).children]) {
      expect(card.className).toContain("h-[90px]");
    }
  });
});

describe("LedgerMetrics — editing the opening balance", () => {
  test("the figure is editable; the edit affordance opens the field", () => {
    renderStrip();

    fireEvent.click(screen.getByRole("button", { name: "edit-OPENING BAL" }));

    // Edit mode replaces both halves at once: the figure gives way to the field,
    // and the pencil to the tick — two affordances on a 90px card would crowd it.
    expect(screen.queryByText("$7,152.35")).toBeNull();
    expect(field()).toBeTruthy();
    expect(screen.queryByRole("button", { name: "edit-OPENING BAL" })).toBeNull();
    expect(screen.getByRole("button", { name: "save-edit" })).toBeTruthy();
  });

  test("the field opens on the amount already in session, in minor units", () => {
    // Seeded from `value`, not blank: the edit is an amendment to a known figure,
    // so the user retypes only what changed.
    renderStrip(moneyFromCents(715235));

    fireEvent.click(screen.getByRole("button", { name: "edit-OPENING BAL" }));

    expect(field().value).toBe("7,152.35");
  });

  test("typing writes the new amount into the session, as whole cents", () => {
    const { store } = renderStrip();

    fireEvent.click(screen.getByRole("button", { name: "edit-OPENING BAL" }));
    fireEvent.focus(field());
    fireEvent.change(field(), { target: { value: "1234.56" } });

    // `CurrencyInput` speaks minor units and the card re-brands them through
    // `moneyFromCents` — so the session holds an integer-cent Money, never a float.
    const saved = store.get(_metrics_openingBalance);
    expect(saved).not.toBeNull();
    expect(toCents(saved as Money)).toBe(123456);
  });

  test("clearing the field leaves the session amount alone", () => {
    // An empty field emits `null`, which is "mid-edit", not "the opening balance
    // is now nothing" — committing it would blank a real figure on a stray Backspace.
    const { store } = renderStrip(moneyFromCents(715235));

    fireEvent.click(screen.getByRole("button", { name: "edit-OPENING BAL" }));
    fireEvent.focus(field());
    fireEvent.change(field(), { target: { value: "" } });

    expect(toCents(store.get(_metrics_openingBalance) as Money)).toBe(715235);
  });

  test("the tick closes the field and shows the edited figure", () => {
    renderStrip();

    fireEvent.click(screen.getByRole("button", { name: "edit-OPENING BAL" }));
    fireEvent.focus(field());
    fireEvent.change(field(), { target: { value: "1234.56" } });
    fireEvent.click(screen.getByRole("button", { name: "save-edit" }));

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("$1,234.56")).toBeTruthy();
    expect(screen.getByRole("button", { name: "edit-OPENING BAL" })).toBeTruthy();
  });

  test("Enter closes the field — the keyboard path out, not just the tick", () => {
    renderStrip();

    fireEvent.click(screen.getByRole("button", { name: "edit-OPENING BAL" }));
    fireEvent.focus(field());
    fireEvent.change(field(), { target: { value: "1234.56" } });
    fireEvent.keyDown(field(), { key: "Enter" });

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("$1,234.56")).toBeTruthy();
  });

  test("a key that is not Enter keeps the field open", () => {
    // Guards the `key === "Enter"` test itself: a bare `onKeyDown={close}` would
    // dismiss the field on the first digit typed.
    renderStrip();

    fireEvent.click(screen.getByRole("button", { name: "edit-OPENING BAL" }));
    fireEvent.keyDown(field(), { key: "5" });

    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  test("blurring closes the field, keeping what was typed", () => {
    // Clicking away is a commit, not a cancel — the change already reached the
    // session as the user typed, so dropping it on blur would contradict itself.
    renderStrip();

    fireEvent.click(screen.getByRole("button", { name: "edit-OPENING BAL" }));
    fireEvent.focus(field());
    fireEvent.change(field(), { target: { value: "1234.56" } });
    fireEvent.blur(field());

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("$1,234.56")).toBeTruthy();
  });
});

describe("MetricCard (deprecated)", () => {
  // Superseded by the atom-driven cards and no longer composed by the strip. The
  // suite stays only while the component does — delete both together once the
  // remaining four figures are wired.

  test("renders the caption and the amount, formatted to fit the card", () => {
    render(<MetricCard label="OPENING BAL" value={moneyFromCents(540033)} />);

    expect(screen.getByText("OPENING BAL")).toBeTruthy();
    expect(screen.getByText("$5,400.33")).toBeTruthy();
  });

  test("adds no tooltip or alternate text when the amount fits as-is", () => {
    render(<MetricCard label="C.O.L" value={moneyFromCents(23300)} />);

    expect(screen.getByText("$233.00").closest("code")?.getAttribute("title")).toBeNull();
  });

  test("keeps the exact amount reachable when it abbreviates one", () => {
    render(<MetricCard label="MAX CAPPED" value={moneyFromCents(12345678900)} />);

    const abbreviated = screen.getByText("$123.46M");
    expect(abbreviated.closest("code")?.getAttribute("title")).toBe("$123,456,789.00");
    expect(abbreviated.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("$123,456,789.00").className).toContain("sr-only");
  });

  test("shows the edit affordance only when the metric is editable", () => {
    const { unmount } = render(<MetricCard label="C.O.L" value={moneyFromCents(23300)} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    unmount();

    render(<MetricCard label="OPENING BAL" value={moneyFromCents(540033)} editable />);
    expect(screen.getByRole("button", { name: "edit-OPENING BAL" })).toBeTruthy();
  });

  test("routes the edit affordance to onEdit", () => {
    let edits = 0;
    render(
      <MetricCard
        label="MAX CAPPED"
        value={moneyFromCents(640033)}
        editable
        onEdit={() => {
          edits += 1;
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "edit-MAX CAPPED" }));

    expect(edits).toBe(1);
  });

  test("applies the caller's value styling to the figure", () => {
    render(
      <MetricCard
        label="HEALTH MARGIN"
        value={moneyFromCents(23300)}
        valueClassName="text-brand"
      />,
    );

    expect(screen.getByText("$233.00").closest("code")?.className).toContain("text-brand");
  });

  test("swaps the figure for an entry field, and the field back for the figure", () => {
    render(<MetricCard label="MAX CAPPED" value={moneyFromCents(640033)} editable />);

    fireEvent.click(screen.getByRole("button", { name: "edit-MAX CAPPED" }));

    expect(screen.queryByText("$6,400.33")).toBeNull();
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "edit-MAX CAPPED" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "save-edit" }));

    expect(screen.getByText("$6,400.33")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
