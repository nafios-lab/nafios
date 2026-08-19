import { afterEach, describe, expect, test } from "bun:test";
import { SidebarProvider } from "@nafios/ui/components/ui/sidebar";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  Navbar,
  NavbarBreadcrumb,
  NavbarClock,
  NavbarProvider,
  NavbarTitle,
  SearchBar,
  useNavbar,
} from "../../src/shared/components/navbar.tsx";

afterEach(cleanup);

/** `<Link>` is stubbed process-wide in tests/setup.ts, so crumbs render as <a>. */
function renderCrumb(items: Parameters<typeof NavbarBreadcrumb>[0]["items"]) {
  return render(<NavbarBreadcrumb items={items} />);
}

describe("NavbarBreadcrumb", () => {
  test("renders every segment in order", () => {
    renderCrumb([{ label: "Finance", to: "/finance" }, { label: "Ledger : August 2026" }]);

    const trail = screen.getByRole("navigation", { name: "breadcrumb" });
    expect(trail.textContent).toBe("FinanceLedger : August 2026");
  });

  test("the last segment is the current page — never a link", () => {
    renderCrumb([{ label: "Finance", to: "/finance" }, { label: "Ledger : August 2026" }]);

    // `aria-current="page"` is what tells a screen reader where the trail ends.
    const current = screen.getByText("Ledger : August 2026").closest("[aria-current]");
    expect(current?.getAttribute("aria-current")).toBe("page");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  test("ancestors link up, with their params interpolated into the href", () => {
    renderCrumb([
      { label: "Finance", to: "/finance" },
      { label: "August", to: "/finance/ledger/$month", params: { month: "2026-08-01" } },
      { label: "Envelope" },
    ]);

    const [root, month] = screen.getAllByRole("link");
    expect(root?.getAttribute("href")).toBe("/finance");
    expect(month?.getAttribute("href")).toBe("/finance/ledger/2026-08-01");
  });

  test("an ancestor with no `to` is plain text, not a dead link", () => {
    // The escape hatch for a level that exists in the hierarchy but has no page
    // to land on — it must not look clickable.
    renderCrumb([{ label: "Finance" }, { label: "Ledger : August 2026" }]);

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Finance")).toBeTruthy();
  });

  test("a one-segment trail renders no separator", () => {
    const { container } = renderCrumb([{ label: "Finance" }]);

    expect(container.querySelectorAll('li[role="presentation"]')).toHaveLength(0);
  });

  test("separators sit between segments, never after the last", () => {
    const { container } = renderCrumb([
      { label: "Finance", to: "/finance" },
      { label: "August", to: "/finance" },
      { label: "Envelope" },
    ]);

    expect(container.querySelectorAll('li[role="presentation"]')).toHaveLength(2);
  });

  test("an icon renders inside the current segment", () => {
    renderCrumb([
      { label: "Finance", to: "/finance" },
      { label: "Ledger : August 2026", icon: <svg data-testid="ledger-icon" role="none" /> },
    ]);

    const icon = screen.getByTestId("ledger-icon");
    expect(icon.closest("[aria-current]")).toBeTruthy();
  });

  test("an icon on a linked segment sits inside the click target", () => {
    // Rendering it beside the anchor instead of within it would leave a mark the
    // user can aim at but not click.
    renderCrumb([
      { label: "Finance", to: "/finance", icon: <svg data-testid="finance-icon" role="none" /> },
      { label: "Ledger : August 2026" },
    ]);

    expect(screen.getByTestId("finance-icon").closest("a")).toBe(screen.getByRole("link"));
  });
});

// ─── the slot mechanism ─────────────────────────────────────────────────────
// The bar is filled by whichever route calls useNavbar(). These cover the
// contract every module layout depends on.

/** The shell as mounted in `_app.tsx`: provider → <Navbar/> → the route below. */
function renderShell(route: ReactNode) {
  return render(
    <SidebarProvider>
      <NavbarProvider>
        <Navbar />
        {route}
      </NavbarProvider>
    </SidebarProvider>,
  );
}

function FinanceRoute() {
  useNavbar({
    leftAside: <NavbarTitle>FINANCE</NavbarTitle>,
    rightAside: <span>clock</span>,
  });
  return <p>page</p>;
}

describe("the navbar slots", () => {
  test("a route's content lands in both slots", () => {
    renderShell(<FinanceRoute />);

    expect(screen.getByText("FINANCE")).toBeTruthy();
    expect(screen.getByText("clock")).toBeTruthy();
  });

  test("the bar empties when the route unmounts", () => {
    const { rerender } = renderShell(<FinanceRoute />);
    expect(screen.getByText("FINANCE")).toBeTruthy();

    // Navigating away must not leave the previous module's identity in the bar.
    rerender(
      <SidebarProvider>
        <NavbarProvider>
          <Navbar />
        </NavbarProvider>
      </SidebarProvider>,
    );
    expect(screen.queryByText("FINANCE")).toBeNull();
  });

  test("renders an empty bar when no route has filled it", () => {
    renderShell(null);

    expect(screen.getByRole("navigation")).toBeTruthy();
  });
});

// ─── the remaining building blocks ──────────────────────────────────────────

describe("the navbar building blocks", () => {
  test("NavbarTitle renders the module identity as text", () => {
    render(<NavbarTitle>FINANCE</NavbarTitle>);

    expect(screen.getByText("FINANCE")).toBeTruthy();
  });

  test("NavbarClock paints nothing on the first render, then the live minute", () => {
    // `useNow` starts at null so the first render is stable — the clock fills in
    // from an effect, which `render` flushes before returning.
    const { container } = render(<NavbarClock />);

    expect(container.textContent).toMatch(/^[A-Z]{3} · \d{1,2} [A-Z]{3} · \d{2}:\d{2}[AP]M$/);
  });

  test("SearchBar exposes a labelled field — the bar's only text input", () => {
    render(<SearchBar />);

    const field = screen.getByLabelText("Search");
    expect(field.getAttribute("placeholder")).toBe("Search…");
    // Browser autofill on a search box would be noise, never help.
    expect(field.getAttribute("autocomplete")).toBe("off");
  });
});
