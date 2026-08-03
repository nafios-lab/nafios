import { Logo } from "@nafios/ui/components/logo";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  Sidebar as SidebarRoot,
} from "@nafios/ui/components/ui/sidebar";
import { TooltipProvider } from "@nafios/ui/components/ui/tooltip";
import { UserMenu, type UserMenuUser } from "@nafios/ui/components/user-menu";
import { Link, type LinkProps, useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { createContext, type ReactNode, useContext, useLayoutEffect, useState } from "react";
import { useSignOut } from "~/features/auth/hooks/use-sign-out";

/**
 * NafiOS shell navigation rail — a presentational *skeleton* shared by every
 * module in the suite (Finance, Calendar, Radio, Doc, …) and the root (welcome)
 * page, mirroring the navbar shell. The shell mounts `<Sidebar />` once, beside
 * the page outlet; each route declares *which* menu items the rail shows via
 * `useSidebarNav()`.
 *
 * The skeleton owns only the constant chrome — the logo header and the global
 * footer (the user account menu) that every module shares. The middle item
 * listing is filled per route, so welcome, finance, calendar, … each surface
 * their own menu.
 *
 * Built on the shadcn <Sidebar collapsible="icon" />. The shell pins it to the
 * collapsed (icon-only) state via the shadcn `SidebarProvider` in the protected
 * shell layout — so it is effectively non-expandable: labels surface as tooltips
 * on hover. Item clicks
 * are intentionally inert; the module-mounting epic will wire them to routes.
 */

/** One entry a route contributes to the rail's middle item listing. */
export interface SidebarNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /**
   * Route this item links to. When set, the item is a real navigation link
   * (SPA nav via TanStack `<Link>`, with intent preloading); when omitted the
   * item is inert — a visual affordance only. Modules point their rail items at
   * their own sub-routes (e.g. `/finance/accounts`).
   */
  to?: LinkProps["to"];
  /** Marks the item as the current location (visual only). */
  active?: boolean;
}

const EMPTY: SidebarNavItem[] = [];

// Two contexts on purpose, exactly as the navbar: the value is read only by
// <Sidebar />, while routes read only the (stable) setter. That split means a
// route calling useSidebarNav() updates the rail without re-rendering itself —
// so there's no update loop.
const SidebarNavContext = createContext<SidebarNavItem[]>(EMPTY);
const SidebarNavSetContext = createContext<(items: SidebarNavItem[]) => void>(() => {});

/** Wrap the shell so `<Sidebar />` and the module routes share one item slot. */
export function SidebarNavProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SidebarNavItem[]>(EMPTY);
  return (
    <SidebarNavSetContext.Provider value={setItems}>
      <SidebarNavContext.Provider value={items}>{children}</SidebarNavContext.Provider>
    </SidebarNavSetContext.Provider>
  );
}

/**
 * Declare this route's rail menu items. Applied on mount and cleared on unmount,
 * so navigating away empties the rail for the next route to fill.
 *
 * @example
 * useSidebarNav([
 *   { id: "overview", label: "Overview", icon: LayoutGrid, to: "/finance", active: true },
 *   { id: "accounts", label: "Accounts", icon: Wallet, to: "/finance/accounts" },
 * ]);
 */
export function useSidebarNav(items: SidebarNavItem[]) {
  const setItems = useContext(SidebarNavSetContext);
  // useLayoutEffect (not useEffect) so the rail's items swap before paint — no
  // flash of the previous route's menu when navigating between modules. This is
  // a client-only SPA, so there is no SSR pass to guard against.
  useLayoutEffect(() => {
    setItems(items);
    return () => setItems(EMPTY);
  }, [setItems, items]);
}

export interface SidebarProps {
  /**
   * The signed-in user shown in the footer account menu. The shell maps the
   * active session onto {@link UserMenuUser} before passing it in, keeping the
   * rail decoupled from any auth provider.
   */
  user: UserMenuUser;
}

/**
 * The shell navigation rail skeleton. Render exactly once, inside both the
 * shadcn `<SidebarProvider>` (open-state) and a `<SidebarNavProvider>` (item
 * slot). It draws the logo header and the global footer (the account menu),
 * and drops each route's declared items into the middle.
 */
export function Sidebar({ user }: SidebarProps) {
  const items = useContext(SidebarNavContext);
  const navigate = useNavigate();
  const { signOut } = useSignOut({
    onSuccess: () => {
      navigate({ to: "/auth/login" });
    },
  });

  return (
    // The rail follows the app theme — colors come from the shadcn sidebar
    // theme tokens (`--sidebar-*`), which are defined for both the light and
    // dark palettes, so it recolors automatically when the theme switches.
    // `border-border/50` softens the rail's right edge — same token as the base
    // border, at half opacity so it reads as a subtle seam, not a bright line.
    <SidebarRoot collapsible="icon" className="border-border/50">
      <SidebarHeader className="items-center py-3">
        {/* The brand mark doubles as the home affordance — the universal
            click-the-logo-to-go-home convention. It lives in the shared
            skeleton, so every module inherits a way back to /welcome. The mark
            is aria-hidden, so the link carries its own accessible name. */}
        <Link
          to="/welcome"
          aria-label="Go to NafiOS home"
          className="rounded-md outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <Logo variant="mark" className="size-8" />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            {/* The shadcn SidebarProvider wraps the whole shell in a
                `<TooltipProvider delayDuration={0}>`, so rail tooltips fire the
                instant the cursor grazes an icon — and Radix's default
                `skipDelayDuration` then machine-guns them on/off as you sweep the
                rail. Nest our own provider over just the menu to override that
                (composition, so the primitive stays unforked): require a short
                deliberate hover before a label appears (`delayDuration`), and
                make every item re-earn that delay (`skipDelayDuration={0}`) so
                there's no instant re-pop when moving between items. */}
            <TooltipProvider delayDuration={500} skipDelayDuration={0}>
              <SidebarMenu className="items-center gap-1">
                {items.map((item) => {
                  const Icon = item.icon;
                  // Shared inner content — an icon plus its (tooltip-surfaced)
                  // label. Rendered directly inside the default button when the
                  // item is inert, or slotted into a <Link> when it navigates.
                  const content = (
                    <>
                      <Icon />
                      <span>{item.label}</span>
                    </>
                  );
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        asChild={item.to !== undefined}
                        tooltip={item.label}
                        isActive={item.active}
                        // The shadcn primitive paints hover *and* active with the
                        // same neutral `sidebar-accent`, so in this icon-only rail
                        // the current route is indistinguishable from whatever's
                        // hovered. Keep hover neutral (per the theme's rule that
                        // interactive states stay neutral, not accent), but give
                        // the active item the brand (`sidebar-primary`) — a green
                        // tint + green glyph reads clearly as "you are here" and
                        // never collides with the neutral hover. These override the
                        // primitive's active classes via cn()/tailwind-merge.
                        className="transition-colors data-[active=true]:bg-sidebar-primary/15 data-[active=true]:text-sidebar-primary data-[active=true]:hover:bg-sidebar-primary/20 data-[active=true]:hover:text-sidebar-primary"
                      >
                        {item.to !== undefined ? <Link to={item.to}>{content}</Link> : content}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </TooltipProvider>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="items-center py-3">
        {/* In the collapsed rail the trigger is just the avatar; open the menu
            to the right so it clears the rail, anchored to its bottom edge. */}
        <UserMenu user={user} side="right" align="end" onLogout={signOut} />
      </SidebarFooter>
    </SidebarRoot>
  );
}
