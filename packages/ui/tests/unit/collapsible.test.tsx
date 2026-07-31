import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../src/components/ui/collapsible.tsx";

afterEach(cleanup);

function Fixture({ defaultOpen }: { defaultOpen?: boolean }) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger>Toggle</CollapsibleTrigger>
      <CollapsibleContent>Panel body</CollapsibleContent>
    </Collapsible>
  );
}

describe("Collapsible", () => {
  test("stays collapsed by default", () => {
    render(<Fixture />);
    const trigger = screen.getByRole("button", { name: "Toggle" });
    // Closed initially: Radix never mounts the content, and the trigger reports
    // the closed state to assistive tech.
    expect(trigger.getAttribute("data-state")).toBe("closed");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Panel body")).toBeNull();
  });

  test("reveals content when the trigger is clicked", async () => {
    const user = userEvent.setup();
    render(<Fixture />);

    await user.click(screen.getByRole("button", { name: "Toggle" }));
    const trigger = screen.getByRole("button", { name: "Toggle" });
    expect(trigger.getAttribute("data-state")).toBe("open");
    expect(screen.getByText("Panel body")).toBeDefined();
  });

  test("respects defaultOpen and reports state through toggling", async () => {
    const user = userEvent.setup();
    render(<Fixture defaultOpen />);

    const trigger = screen.getByRole("button", { name: "Toggle" });
    expect(trigger.getAttribute("data-state")).toBe("open");
    expect(screen.getByText("Panel body")).toBeDefined();

    await user.click(trigger);
    expect(trigger.getAttribute("data-state")).toBe("closed");
  });

  test("exposes data-slot hooks for styling", () => {
    render(<Fixture defaultOpen />);
    const trigger = screen.getByRole("button", { name: "Toggle" });
    expect(trigger.getAttribute("data-slot")).toBe("collapsible-trigger");
    expect(trigger.closest("[data-slot='collapsible']")).not.toBeNull();
  });
});
