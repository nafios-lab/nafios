import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DropdownMenuField,
  type MenuEntry,
} from "../../src/components/dropdown-menu-field.tsx";

afterEach(cleanup);

function Icon({ className }: { className?: string }) {
  return <svg data-testid="icon" className={className} aria-hidden="true" />;
}

async function open() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open" }));
}

describe("DropdownMenuField", () => {
  test("renders the trigger", () => {
    render(
      <DropdownMenuField
        trigger={<button type="button">Open</button>}
        items={[{ label: "Edit" }]}
      />,
    );
    expect(screen.getByRole("button", { name: "Open" })).toBeDefined();
  });

  test("renders plain item entries when opened", async () => {
    const items: MenuEntry[] = [{ label: "Edit" }, { type: "item", label: "Duplicate" }];
    render(<DropdownMenuField trigger={<button type="button">Open</button>} items={items} />);
    await open();
    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: "Edit" })).toBeDefined();
      expect(screen.getByRole("menuitem", { name: "Duplicate" })).toBeDefined();
    });
  });

  test("renders an item with icon and keyboard shortcut", async () => {
    const items: MenuEntry[] = [{ label: "Copy", icon: Icon, shortcut: "⌘C" }];
    render(<DropdownMenuField trigger={<button type="button">Open</button>} items={items} />);
    await open();
    await waitFor(() => {
      expect(screen.getByText("Copy")).toBeDefined();
      expect(screen.getByText("⌘C")).toBeDefined();
      expect(screen.getByTestId("icon")).toBeDefined();
    });
  });

  test("renders a destructive item with the error styling", async () => {
    const items: MenuEntry[] = [{ label: "Delete", destructive: true }];
    render(<DropdownMenuField trigger={<button type="button">Open</button>} items={items} />);
    await open();
    await waitFor(() => {
      const item = screen.getByRole("menuitem", { name: "Delete" });
      expect(item.className).toContain("text-error-foreground");
    });
  });

  test("renders a disabled item", async () => {
    const items: MenuEntry[] = [{ label: "Archive", disabled: true }];
    render(<DropdownMenuField trigger={<button type="button">Open</button>} items={items} />);
    await open();
    await waitFor(() => {
      const item = screen.getByRole("menuitem", { name: "Archive" });
      expect(item.getAttribute("data-disabled")).not.toBeNull();
    });
  });

  test("renders separator, standalone label, and a group with label + items", async () => {
    const items: MenuEntry[] = [
      { type: "label", label: "Actions" },
      { type: "separator" },
      { type: "group", label: "Danger zone", items: [{ label: "Delete" }] },
      { type: "group", items: [{ label: "Ungrouped" }] },
    ];
    render(<DropdownMenuField trigger={<button type="button">Open</button>} items={items} />);
    await open();
    await waitFor(() => {
      expect(screen.getByText("Actions")).toBeDefined();
      expect(screen.getByText("Danger zone")).toBeDefined();
      expect(screen.getByRole("menuitem", { name: "Delete" })).toBeDefined();
      expect(screen.getByRole("menuitem", { name: "Ungrouped" })).toBeDefined();
      expect(screen.getByRole("separator")).toBeDefined();
    });
  });

  test("calls onSelect when an item is activated", async () => {
    const onSelect = mock(() => {});
    const items: MenuEntry[] = [{ label: "Edit", onSelect }];
    render(<DropdownMenuField trigger={<button type="button">Open</button>} items={items} />);
    await open();
    const item = await screen.findByRole("menuitem", { name: "Edit" });
    fireEvent.click(item);
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledTimes(1);
    });
  });

  test("respects controlled open state without a trigger click", async () => {
    const items: MenuEntry[] = [{ label: "Edit" }];
    render(
      <DropdownMenuField
        trigger={<button type="button">Open</button>}
        items={items}
        open
        align="end"
        side="bottom"
        contentClassName="custom-panel"
      />,
    );
    await waitFor(() => {
      const item = screen.getByRole("menuitem", { name: "Edit" });
      expect(item).toBeDefined();
      const content = item.closest('[role="menu"]');
      expect(content?.className).toContain("custom-panel");
      expect(content?.className).toContain("min-w-48");
    });
  });

  test("fires onOpenChange when the menu is toggled open", async () => {
    const onOpenChange = mock((_: boolean) => {});
    render(
      <DropdownMenuField
        trigger={<button type="button">Open</button>}
        items={[{ label: "Edit" }]}
        onOpenChange={onOpenChange}
      />,
    );
    await open();
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(true);
    });
  });
});
