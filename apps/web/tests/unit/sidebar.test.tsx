import { afterEach, describe, expect, test } from "bun:test";
import { SidebarProvider } from "@nafios/ui/components/ui/sidebar";
import { cleanup, render, screen } from "@testing-library/react";
import { House, ListChecks } from "lucide-react";
import {
  Sidebar,
  type SidebarNavItem,
  SidebarNavProvider,
  useSidebarNav,
} from "../../src/components/sidebar.tsx";

afterEach(cleanup);

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
        <Sidebar />
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

  test("owns only constant chrome — no menu items when a route declares none", () => {
    renderSidebar([]);
    // The global footer is shell-owned and always present...
    expect(screen.getByText("AI Assistant")).toBeDefined();
    expect(screen.getByText("Settings")).toBeDefined();
    // ...but no route-declared module items leak in.
    expect(screen.queryByText("SmartTodo")).toBeNull();
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
