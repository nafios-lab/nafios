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
