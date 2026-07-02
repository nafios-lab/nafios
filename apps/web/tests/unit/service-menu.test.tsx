import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ServiceMenu } from "../../src/components/service-menu.tsx";

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
