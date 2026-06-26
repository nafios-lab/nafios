import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { SidebarProvider } from "@nafios/ui/components/ui/sidebar";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { House, ListChecks } from "lucide-react";
import {
  Sidebar,
  type SidebarNavItem,
  SidebarNavProvider,
  useSidebarNav,
} from "../../src/components/sidebar.tsx";
import { navigate, resetServerFnMocks, signOut } from "../setup.ts";

// The footer account menu's logout calls the real signOutFn server fn (built on
// the process-wide createServerFn/auth-core stubs in tests/setup.ts) and then
// navigates. We assert on the shared `signOut` and `navigate` spies.

beforeEach(resetServerFnMocks);
afterEach(cleanup);

const user = { name: "Hanafi Yakub", email: "user@nafios.local" };

/** Mount the rail skeleton with a route declaring its items via useSidebarNav(). */
function renderSidebar(items: SidebarNavItem[]) {
  function Route() {
    useSidebarNav(items);
    return null;
  }
  return render(
    // shadcn's SidebarProvider supplies the open-state context the rail reads.
    <SidebarProvider>
      <SidebarNavProvider>
        <Sidebar user={user} />
        <Route />
      </SidebarNavProvider>
    </SidebarProvider>,
  );
}

describe("Sidebar rail skeleton", () => {
  test("renders the menu items a route declares", () => {
    renderSidebar([
      { id: "home", label: "Home", icon: House, active: true },
      { id: "smart-todo", label: "SmartTodo", icon: ListChecks },
    ]);
    expect(screen.getByText("Home")).toBeDefined();
    expect(screen.getByText("SmartTodo")).toBeDefined();
  });

  test("owns only constant chrome — the account menu, with no route items leaking in", () => {
    renderSidebar([]);
    // The footer account menu is shell-owned and always present...
    expect(screen.getByRole("button", { name: "Open user menu for Hanafi Yakub" })).toBeDefined();
    // ...but no route-declared module items leak in.
    expect(screen.queryByText("SmartTodo")).toBeNull();
  });

  test("logout signs out and redirects to the login page", async () => {
    const u = userEvent.setup();
    renderSidebar([]);
    await u.click(screen.getByRole("button", { name: /Open user menu/ }));
    const logout = await screen.findByRole("menuitem", { name: "Logout" });
    fireEvent.click(logout);

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/auth/login" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

describe("useSidebarNav", () => {
  test("is a safe no-op outside a SidebarNavProvider", () => {
    // Without a provider the setter resolves to the context default (a no-op),
    // so a route declaring items must not throw even if mounted standalone.
    function Standalone() {
      useSidebarNav([{ id: "home", label: "Home", icon: House }]);
      return <span>standalone</span>;
    }
    render(<Standalone />);
    expect(screen.getByText("standalone")).toBeDefined();
  });
});
