import { createFileRoute, Outlet, useLocation, useMatch } from "@tanstack/react-router";
import { ArrowLeftRight, LayoutDashboard, NotebookText as LedgerIcon, Wallet } from "lucide-react";
import { ledgerCrumbLabel } from "~/features/finance/lib/ledger-crumb-label";
import { NavbarBreadcrumb, NavbarClock, NavbarTitle, useNavbar } from "~/shared/components/navbar";
import { ServiceMenu } from "~/shared/components/service-menu";
import { type SidebarNavItem, useSidebarNav } from "~/shared/components/sidebar";

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

  // The ledger sheet is the one page in Finance that sits a level below the
  // module root *and* is deep-linkable (`/finance/ledger/2026-08-01`), so it is
  // the one page whose "where am I" the rail cannot answer. Non-throwing match:
  // this returns undefined on every other Finance page.
  const ledgerMatch = useMatch({
    from: "/_protected/_app/finance/ledger/$month",
    shouldThrow: false,
  });

  // Finance specializes the shared navbar: the module identity sits in the left
  // slot, while the product switcher (highlighting Finance) and the live clock
  // sit in the right slot alongside the shell-owned account chrome.
  //
  // This layout is the module's SOLE navbar writer (see `useNavbar`) — pages
  // never write the bar themselves, so the trail is derived here from the match
  // rather than declared by the page. Flat pages keep the plain module title:
  // a one-segment breadcrumb is a title wearing a costume.
  useNavbar({
    leftAside: ledgerMatch ? (
      <NavbarBreadcrumb
        items={[
          { label: "Finance", to: "/finance" },
          {
            label: ledgerCrumbLabel(ledgerMatch.params.month),
            // The month alone is a bare value; the mark says *ledger for* that
            // month. Same icon the sheet's own header bar uses, so the bar and
            // the page name the thing identically.
            icon: <LedgerIcon className="size-3.5 shrink-0" />,
          },
        ]}
      />
    ) : (
      <NavbarTitle>FINANCE</NavbarTitle>
    ),
    rightAside: (
      <>
        <ServiceMenu active="finance" />
        <NavbarClock />
      </>
    ),
  });

  return <Outlet />;
}
