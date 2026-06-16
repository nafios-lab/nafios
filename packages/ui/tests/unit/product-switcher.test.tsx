import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  type ProductItem,
  ProductSwitcher,
} from "../../src/components/product-switcher.tsx";

afterEach(cleanup);

function Icon({ className }: { className?: string }) {
  return <svg data-testid="product-icon" className={className} aria-hidden="true" />;
}

function items(overrides: Partial<ProductItem>[] = []): ProductItem[] {
  const base: ProductItem[] = [
    { id: "finance", label: "Finance", icon: Icon },
    { id: "calendar", label: "Calendar", icon: Icon },
    { id: "drive", label: "Drive", icon: Icon },
  ];
  return base.map((item, i) => ({ ...item, ...overrides[i] }));
}

function trigger() {
  return (
    <button type="button" data-testid="trigger">
      Apps
    </button>
  );
}

describe("ProductSwitcher", () => {
  test("renders the trigger but not the panel until opened", () => {
    render(<ProductSwitcher items={items()} renderTrigger={() => trigger()} />);
    expect(screen.getByTestId("trigger")).toBeDefined();
    expect(screen.queryByText("Finance")).toBeNull();
  });

  test("passes the open state into renderTrigger", () => {
    const renderTrigger = mock(({ open }: { open: boolean }) => (
      <button type="button" data-testid="trigger">
        {open ? "Open" : "Closed"}
      </button>
    ));
    render(<ProductSwitcher items={items()} renderTrigger={renderTrigger} />);
    // Uncontrolled default => open is false.
    expect(screen.getByText("Closed")).toBeDefined();
    expect(renderTrigger).toHaveBeenCalledWith({ open: false });
  });

  test("reflects controlled open prop into renderTrigger", () => {
    const renderTrigger = ({ open }: { open: boolean }) => (
      <button type="button" data-testid="trigger">
        {open ? "Open" : "Closed"}
      </button>
    );
    render(
      <ProductSwitcher items={items()} renderTrigger={renderTrigger} open />,
    );
    expect(screen.getByText("Open")).toBeDefined();
  });

  test("opens the panel and renders product entries when the trigger is clicked", async () => {
    const user = userEvent.setup();
    render(<ProductSwitcher items={items()} renderTrigger={() => trigger()} />);

    await user.click(screen.getByTestId("trigger"));

    await waitFor(() => {
      expect(screen.getByText("Finance")).toBeDefined();
      expect(screen.getByText("Calendar")).toBeDefined();
      expect(screen.getByText("Drive")).toBeDefined();
    });
    // Each product renders its icon.
    expect(screen.getAllByTestId("product-icon").length).toBe(3);
  });

  test("fires onSelect for a button item when clicked", async () => {
    const user = userEvent.setup();
    const onSelect = mock(() => {});
    render(
      <ProductSwitcher
        items={items([{}, { onSelect }, {}])}
        renderTrigger={() => trigger()}
      />,
    );

    await user.click(screen.getByTestId("trigger"));
    await waitFor(() => {
      expect(screen.getByText("Calendar")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Calendar"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  test("renders an item with an href as a link and fires onSelect on click", async () => {
    const user = userEvent.setup();
    const onSelect = mock(() => {});
    render(
      <ProductSwitcher
        items={items([{ href: "/finance", onSelect }, {}, {}])}
        renderTrigger={() => trigger()}
      />,
    );

    await user.click(screen.getByTestId("trigger"));
    await waitFor(() => {
      expect(screen.getByText("Finance")).toBeDefined();
    });

    const link = screen.getByText("Finance").closest("a");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("/finance");

    fireEvent.click(link as HTMLAnchorElement);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  test("does not throw when a button item without onSelect is clicked", async () => {
    const user = userEvent.setup();
    render(
      <ProductSwitcher items={items()} renderTrigger={() => trigger()} />,
    );

    await user.click(screen.getByTestId("trigger"));
    await waitFor(() => {
      expect(screen.getByText("Drive")).toBeDefined();
    });

    // No onSelect provided on these items; clicking must be a no-op (optional chaining).
    expect(() => fireEvent.click(screen.getByText("Drive"))).not.toThrow();
  });

  test("does not throw when an href item without onSelect is clicked", async () => {
    const user = userEvent.setup();
    render(
      <ProductSwitcher
        items={items([{ href: "/finance" }, {}, {}])}
        renderTrigger={() => trigger()}
      />,
    );

    await user.click(screen.getByTestId("trigger"));
    await waitFor(() => {
      expect(screen.getByText("Finance")).toBeDefined();
    });

    const link = screen.getByText("Finance").closest("a") as HTMLAnchorElement;
    expect(() => fireEvent.click(link)).not.toThrow();
  });

  test("highlights the active product", async () => {
    const user = userEvent.setup();
    render(
      <ProductSwitcher
        items={items([{ active: true }, {}, {}])}
        renderTrigger={() => trigger()}
      />,
    );

    await user.click(screen.getByTestId("trigger"));
    await waitFor(() => {
      expect(screen.getByText("Finance")).toBeDefined();
    });

    const activeEl = screen.getByText("Finance").closest("button");
    expect(activeEl?.className).toContain("bg-accent/50");

    // A non-active item does not carry the active highlight class.
    const inactiveEl = screen.getByText("Calendar").closest("button");
    expect(inactiveEl?.className).not.toContain("bg-accent/50");
  });

  test("applies custom column count, alignment, and content className", async () => {
    const user = userEvent.setup();
    render(
      <ProductSwitcher
        items={items()}
        renderTrigger={() => trigger()}
        columns={2}
        align="start"
        side="right"
        sideOffset={12}
        contentClassName="custom-panel"
      />,
    );

    await user.click(screen.getByTestId("trigger"));
    await waitFor(() => {
      expect(screen.getByText("Finance")).toBeDefined();
    });

    // The grid uses the requested column count.
    const grid = screen.getByText("Finance").closest("div.grid") as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe("repeat(2, 1fr)");

    // The custom class is applied to the content panel.
    expect(document.querySelector(".custom-panel")).not.toBeNull();
  });

  test("invokes onOpenChange when toggled", async () => {
    const user = userEvent.setup();
    const onOpenChange = mock(() => {});
    render(
      <ProductSwitcher
        items={items()}
        renderTrigger={() => trigger()}
        onOpenChange={onOpenChange}
      />,
    );

    await user.click(screen.getByTestId("trigger"));
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalled();
    });
  });
});
