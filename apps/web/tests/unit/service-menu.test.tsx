import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ServiceMenu } from "../../src/components/service-menu.tsx";
import { navigate } from "../setup.ts";

// `navigate` is the shared router spy from tests/setup.ts. Clear its history
// before each test so selection assertions see only this test's calls.
beforeEach(() => navigate.mockClear());
afterEach(cleanup);

// The fixed suite catalog the menu surfaces, in declaration order.
const PRODUCTS = ["Finance", "Calendar", "Document", "Storage", "Budgeting", "Notebook", "Radio"];

describe("ServiceMenu", () => {
  test("renders a labelled trigger with the panel closed", () => {
    render(<ServiceMenu />);
    expect(screen.getByRole("button", { name: "Services Menu" })).toBeDefined();
    // Closed by default: no catalog entries mounted yet.
    expect(screen.queryByText("Finance")).toBeNull();
  });

  test("opens the full product catalog when the trigger is clicked", async () => {
    const user = userEvent.setup();
    render(<ServiceMenu />);

    await user.click(screen.getByRole("button", { name: "Services Menu" }));

    await waitFor(() => expect(screen.getByText("Finance")).toBeDefined());
    for (const label of PRODUCTS) {
      expect(screen.getByText(label)).toBeDefined();
    }
  });

  test("highlights the product named by the active prop", async () => {
    const user = userEvent.setup();
    render(<ServiceMenu active="finance" />);

    await user.click(screen.getByRole("button", { name: "Services Menu" }));
    await waitFor(() => expect(screen.getByText("Finance")).toBeDefined());

    // The active product carries the highlight + aria-current…
    const activeRow = screen.getByText("Finance").closest("button");
    expect(activeRow?.className).toContain("font-medium");
    expect(activeRow?.getAttribute("aria-current")).toBe("page");

    // …while every other product stays inactive.
    const inactiveRow = screen.getByText("Calendar").closest("button");
    expect(inactiveRow?.className).not.toContain("font-medium");
    expect(inactiveRow?.getAttribute("aria-current")).toBeNull();
  });

  test("marks no product active when the active prop is omitted", async () => {
    const user = userEvent.setup();
    render(<ServiceMenu />);

    await user.click(screen.getByRole("button", { name: "Services Menu" }));
    await waitFor(() => expect(screen.getByText("Finance")).toBeDefined());

    for (const label of PRODUCTS) {
      const row = screen.getByText(label).closest("button");
      expect(row?.className).not.toContain("font-medium");
      expect(row?.getAttribute("aria-current")).toBeNull();
    }
  });

  test("navigates to the module route when a routed product is selected", async () => {
    const user = userEvent.setup();
    render(<ServiceMenu />);

    const trigger = screen.getByRole("button", { name: "Services Menu" });
    await user.click(trigger);
    await waitFor(() => expect(screen.getByText("Finance")).toBeDefined());

    // Finance and Calendar have mounted routes → selecting one is SPA nav.
    await user.click(screen.getByText("Finance").closest("button") as HTMLElement);
    expect(navigate).toHaveBeenCalledWith({ to: "/finance" });

    // Selecting dismisses the menu, so reopen it before the next pick.
    await user.click(trigger);
    await waitFor(() => expect(screen.getByText("Calendar")).toBeDefined());
    await user.click(screen.getByText("Calendar").closest("button") as HTMLElement);
    expect(navigate).toHaveBeenCalledWith({ to: "/calendar" });
  });

  test("surfaces a Home entry that navigates to the welcome dashboard", async () => {
    const user = userEvent.setup();
    render(<ServiceMenu />);

    await user.click(screen.getByRole("button", { name: "Services Menu" }));
    await waitFor(() => expect(screen.getByText("Home")).toBeDefined());

    // Home is the always-available way back to /welcome from any module.
    await user.click(screen.getByText("Home").closest("button") as HTMLElement);
    expect(navigate).toHaveBeenCalledWith({ to: "/welcome" });
  });

  test("highlights Home when it is the active entry", async () => {
    const user = userEvent.setup();
    render(<ServiceMenu active="home" />);

    await user.click(screen.getByRole("button", { name: "Services Menu" }));
    await waitFor(() => expect(screen.getByText("Home")).toBeDefined());

    const homeRow = screen.getByText("Home").closest("button");
    expect(homeRow?.className).toContain("font-medium");
    expect(homeRow?.getAttribute("aria-current")).toBe("page");
  });

  test("dismisses the menu once a routed selection settles", async () => {
    const user = userEvent.setup();
    render(<ServiceMenu />);

    await user.click(screen.getByRole("button", { name: "Services Menu" }));
    await waitFor(() => expect(screen.getByText("Finance")).toBeDefined());

    // Navigating across modules should auto-close the panel — the catalog
    // unmounts once the navigation resolves.
    await user.click(screen.getByText("Finance").closest("button") as HTMLElement);
    await waitFor(() => expect(screen.queryByText("Finance")).toBeNull());
  });

  test("leaves a product with no mounted route inert — no navigation", async () => {
    const user = userEvent.setup();
    render(<ServiceMenu />);

    await user.click(screen.getByRole("button", { name: "Services Menu" }));
    await waitFor(() => expect(screen.getByText("Document")).toBeDefined());

    // Document has no route yet → its row carries no onSelect, so clicking it
    // does nothing (never links to a route that would 404).
    await user.click(screen.getByText("Document").closest("button") as HTMLElement);
    expect(navigate).not.toHaveBeenCalled();
  });

  test("flips the trigger to the solid variant while the menu is open", async () => {
    const user = userEvent.setup();
    render(<ServiceMenu />);

    const trigger = screen.getByRole("button", { name: "Services Menu" });
    // Closed → ghost variant: no solid-fill text token.
    expect(trigger.className).not.toContain("text-fg-100");

    await user.click(trigger);

    // Open → default variant carries the solid-fill token.
    await waitFor(() => expect(trigger.className).toContain("text-fg-100"));
  });
});
