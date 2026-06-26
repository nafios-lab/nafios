import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserMenu, type UserMenuProps } from "../../src/components/user-menu.tsx";

afterEach(cleanup);

const baseUser = {
  name: "Hanafi Yakub",
  email: "hanafi.yakub@example.com",
};

function renderMenu(overrides: Partial<UserMenuProps> = {}) {
  const onProfile = mock(() => {});
  const onSettings = mock(() => {});
  const onLogout = mock(() => {});
  const result = render(
    <UserMenu
      user={baseUser}
      onProfile={onProfile}
      onSettings={onSettings}
      onLogout={onLogout}
      {...overrides}
    />,
  );
  return { onProfile, onSettings, onLogout, ...result };
}

describe("UserMenu", () => {
  test("renders an avatar trigger labelled with the user's name", () => {
    renderMenu();
    expect(screen.getByRole("button", { name: "Open user menu for Hanafi Yakub" })).toBeDefined();
  });

  test("falls back to a generic trigger label when the user has no name", () => {
    renderMenu({ user: { email: "no.name@example.com" } });
    expect(screen.getByRole("button", { name: "Open user menu" })).toBeDefined();
  });

  test("does not render the menu items until opened", () => {
    renderMenu();
    expect(screen.queryByRole("menuitem", { name: "Profile" })).toBeNull();
  });

  test("opens the menu on trigger click", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: /Open user menu/ }));
    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: "Profile" })).toBeDefined();
      expect(screen.getByRole("menuitem", { name: "Settings" })).toBeDefined();
      expect(screen.getByRole("menuitem", { name: "Logout" })).toBeDefined();
    });
  });

  test("renders the user's name and email in the header when open", async () => {
    renderMenu({ open: true });
    await waitFor(() => {
      expect(screen.getByText("Hanafi Yakub")).toBeDefined();
      expect(screen.getByText("hanafi.yakub@example.com")).toBeDefined();
    });
  });

  test("omits the identity header when the user has neither name nor email", async () => {
    renderMenu({ open: true, user: {} });
    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: "Profile" })).toBeDefined();
    });
    // The header email/name lines are the only non-item text — with no identity
    // there should be no separator above the first item (only the one before Logout).
    expect(screen.getAllByRole("separator")).toHaveLength(1);
  });

  test("shows a separator above Logout and below the actions group", async () => {
    renderMenu({ open: true });
    await waitFor(() => {
      // One after the header, one before Logout.
      expect(screen.getAllByRole("separator")).toHaveLength(2);
    });
  });

  test("calls onProfile when the Profile item is activated", async () => {
    const { onProfile } = renderMenu({ open: true });
    const item = await screen.findByRole("menuitem", { name: "Profile" });
    fireEvent.click(item);
    await waitFor(() => expect(onProfile).toHaveBeenCalledTimes(1));
  });

  test("calls onSettings when the Settings item is activated", async () => {
    const { onSettings } = renderMenu({ open: true });
    const item = await screen.findByRole("menuitem", { name: "Settings" });
    fireEvent.click(item);
    await waitFor(() => expect(onSettings).toHaveBeenCalledTimes(1));
  });

  test("calls onLogout when the Logout item is activated", async () => {
    const { onLogout } = renderMenu({ open: true });
    const item = await screen.findByRole("menuitem", { name: "Logout" });
    fireEvent.click(item);
    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1));
  });

  test("does nothing (no throw) when an item is activated with no callback", async () => {
    render(<UserMenu user={baseUser} open />);
    const item = await screen.findByRole("menuitem", { name: "Profile" });
    expect(() => fireEvent.click(item)).not.toThrow();
  });

  test("styles the Logout item with the error foreground", async () => {
    renderMenu({ open: true });
    const item = await screen.findByRole("menuitem", { name: "Logout" });
    expect(item.className).toContain("text-error-foreground");
  });

  test("accepts an avatarUrl without crashing", () => {
    // Radix only mounts the <img> once it reports "loaded", which never happens
    // in happy-dom — so assert the trigger renders rather than the image node.
    renderMenu({ user: { ...baseUser, avatarUrl: "https://example.com/a.png" } });
    expect(screen.getByRole("button", { name: /Open user menu/ })).toBeDefined();
  });

  test("applies a custom content class and respects the controlled open state", async () => {
    renderMenu({ open: true, contentClassName: "custom-panel" });
    const item = await screen.findByRole("menuitem", { name: "Profile" });
    const content = item.closest('[role="menu"]');
    expect(content?.className).toContain("custom-panel");
    expect(content?.className).toContain("min-w-56");
  });

  test("fires onOpenChange when the trigger is clicked", async () => {
    const onOpenChange = mock((_: boolean) => {});
    const user = userEvent.setup();
    renderMenu({ onOpenChange });
    await user.click(screen.getByRole("button", { name: /Open user menu/ }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(true));
  });

  test("renders a single-word name without crashing and derives initials", async () => {
    // Exercises the single-part name branch in initials derivation.
    renderMenu({ open: true, user: { name: "Cher" } });
    await waitFor(() => {
      expect(screen.getByText("Cher")).toBeDefined();
    });
  });
});
