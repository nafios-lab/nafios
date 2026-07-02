import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { CalendarDays, CalendarRange } from "lucide-react";
import { ServiceMenu } from "~/components/service-menu";
import { NavbarTitle, SearchBar, UserMenu, useNavbar } from "../../../../components/navbar";
import { type SidebarNavItem, useSidebarNav } from "../../../../components/sidebar";

/**
 * Calendar module layout — same shape as Finance, different specialization.
 * It reuses the common shell chrome and only swaps in Calendar's rail + navbar
 * identity, demonstrating that the module pattern generalizes: mounting a new
 * product is "add a `<module>/route.tsx` layout + its pages", nothing more.
 */

const CALENDAR_NAV = [
  { id: "month", label: "Month", icon: CalendarDays, to: "/calendar" },
  { id: "schedule", label: "Schedule", icon: CalendarRange, to: "/calendar/schedule" },
] as const satisfies readonly SidebarNavItem[];

export const Route = createFileRoute("/_protected/_app/calendar")({
  component: CalendarLayout,
});

function CalendarLayout() {
  const { session } = Route.useRouteContext();
  const { pathname } = useLocation();

  useSidebarNav(
    CALENDAR_NAV.map((item) => ({
      ...item,
      active: item.to === "/calendar" ? pathname === "/calendar" : pathname.startsWith(item.to),
    })),
  );

  useNavbar({
    leftAside: (
      <>
        <ServiceMenu active="calendar" />
        <NavbarTitle>Calendar</NavbarTitle>
      </>
    ),
    rightAside: (
      <>
        <SearchBar />
        <UserMenu email={session.user.email} />
      </>
    ),
  });

  return <Outlet />;
}
