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
import { type LucideIcon, Settings } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";

/**
 * NafiOS shell navigation rail — a presentational *skeleton* shared by every
 * module in the suite (Finance, Calendar, Radio, Doc, …) and the root (welcome)
 * page, mirroring the navbar shell. The shell mounts `<Sidebar />` once, beside
 * the page outlet; each route declares *which* menu items the rail shows via
 * `useSidebarNav()`.
 *
 * The skeleton owns only the constant chrome — the logo header and the global
 * footer (AI Assistant, Settings) that every module shares. The middle item
 * listing is filled per route, so welcome, finance, calendar, … each surface
 * their own menu.
 *
 * Built on the shadcn <Sidebar collapsible="icon" />. The shell pins it to the
 * collapsed (icon-only) state — see `SidebarProvider` in `_app.tsx` — so it is
 * effectively non-expandable: labels surface as tooltips on hover. Item clicks
 * are intentionally inert; the module-mounting epic will wire them to routes.
 */

/** One entry a route contributes to the rail's middle item listing. */
export interface SidebarNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
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

// useLayoutEffect on the client (no flash when navigating between modules),
// useEffect on the server to avoid React's SSR useLayoutEffect warning.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Declare this route's rail menu items. Applied on mount and cleared on unmount,
 * so navigating away empties the rail for the next route to fill.
 *
 * @example
 * useSidebarNav([
 *   { id: "overview", label: "Overview", icon: LayoutGrid, active: true },
 *   { id: "accounts", label: "Accounts", icon: Wallet },
 * ]);
 */
export function useSidebarNav(items: SidebarNavItem[]) {
  const setItems = useContext(SidebarNavSetContext);
  useIsomorphicLayoutEffect(() => {
    setItems(items);
    return () => setItems(EMPTY);
  }, [setItems, items]);
}

/**
 * The shell navigation rail skeleton. Render exactly once, inside both the
 * shadcn `<SidebarProvider>` (open-state) and a `<SidebarNavProvider>` (item
 * slot). It draws the logo header and the global footer, and drops each route's
 * declared items into the middle.
 */
export function Sidebar() {
  const items = useContext(SidebarNavContext);

  return (
    // `dark` pins the rail to the dark palette regardless of the app theme,
    // matching the draft. Colors come from the shadcn sidebar theme tokens.
    <SidebarRoot collapsible="icon" className="dark">
      <SidebarHeader className="items-center py-3">
        <Logo variant="mark" className="size-8" />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="items-center gap-1">
              {items.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton tooltip={item.label} isActive={item.active}>
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="items-center py-3">
        <SidebarMenu className="items-center gap-1">
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="AI Assistant">
              <AssistantOrb />
              <span>AI Assistant</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Settings">
              <Settings />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </SidebarRoot>
  );
}

/** Iridescent AI-assistant glyph (display only). */
function AssistantOrb() {
  return (
    <span
      aria-hidden
      className="size-5 shrink-0 rounded-full shadow-inner ring-1 ring-white/20"
      style={{
        backgroundImage:
          "conic-gradient(from 210deg at 50% 50%, #4cc9f0, #8b7cf6, #f472b6, #ff8a5b, #4cc9f0)",
      }}
    />
  );
}
