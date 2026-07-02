import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { ArrowLeftRight, LayoutDashboard, Wallet } from "lucide-react";
import { ServiceMenu } from "~/components/service-menu";
import { NavbarTitle, useNavbar } from "../../../../components/navbar";
import { type SidebarNavItem, useSidebarNav } from "../../../../components/sidebar";

/**
 * Finance module layout — the entry point for everything under `/finance/**`.
 *
 * It does *not* re-implement the chrome: the common shell (`_app.tsx`) already
 * renders the sidebar + navbar once. This layout only *specializes* them for
 * the Finance product — declaring Finance's own rail items and navbar identity
 * via the shell's slot hooks — then renders its child pages through `<Outlet/>`.
 * Every module (Calendar, Doc, …) follows this same shape.
 */

// Finance's rail. Each item links to a sub-route under /finance, so the shared
// rail navigates within the module. Declared once here, reused by every page.
const FINANCE_NAV = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, to: "/finance" },
  { id: "accounts", label: "Accounts", icon: Wallet, to: "/finance/accounts" },
  {
    id: "transactions",
    label: "Transactions",
    icon: ArrowLeftRight,
    to: "/finance/transactions",
  },
] as const satisfies readonly SidebarNavItem[];

export const Route = createFileRoute("/_protected/_app/finance")({
  component: FinanceLayout,
});

function FinanceLayout() {
  // Session flows down from `_protected` (fetched once in its beforeLoad).

  const { pathname } = useLocation();

  // Highlight the current rail item: exact match for the overview index,
  // prefix match for the deeper sub-routes.
  useSidebarNav(
    FINANCE_NAV.map((item) => ({
      ...item,
      active: item.to === "/finance" ? pathname === "/finance" : pathname.startsWith(item.to),
    })),
  );

  // Finance specializes the shared navbar's left slot: product switcher
  // (highlighting Finance) + module title. The right slot is intentionally
  // empty — global search / account chrome is shell-owned, not per-module.
  useNavbar({
    leftAside: (
      <>
        <ServiceMenu active="finance" />
        <NavbarTitle>FINANCE</NavbarTitle>
      </>
    ),
  });

  return <Outlet />;
}
