import { formatDate } from "@nafios/datetime";
import { TextInput } from "@nafios/ui/components/text-input";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@nafios/ui/components/ui/breadcrumb";
import { SidebarTrigger } from "@nafios/ui/components/ui/sidebar";
import { Link, type LinkProps } from "@tanstack/react-router";
import { Search } from "lucide-react";
import {
  createContext,
  Fragment,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";

/**
 * Shell navbar — a presentational *skeleton* shared by every module in the
 * suite (Finance, Calendar, Radio, Doc, …) and the root (welcome) page. The
 * shell mounts `<Navbar />` once, above the page outlet; each route fills the
 * two slots declaratively via `useNavbar()`.
 *
 * The skeleton owns *only* the bar layout — border, padding, and the two flex
 * regions. It renders nothing by default: every route composes its own left and
 * right content from the building blocks it needs (`SearchBar`, `NavbarClock`,
 * `NavbarTitle`, or anything else).
 *
 * Layout:
 *
 *   [ leftAside ] ............................ [ rightAside ]
 *      ↑ useNavbar()                              ↑ useNavbar()
 */

/** What a route contributes to the shell navbar's two slots. */
export interface NavbarContent {
  /** Left-aligned slot — e.g. search, page title, breadcrumbs. */
  leftAside?: ReactNode;
  /** Right-aligned slot — e.g. module actions, the service menu, a clock. */
  rightAside?: ReactNode;
}

const EMPTY: NavbarContent = {};

// Two contexts on purpose: the value is read only by <Navbar />, while routes
// read only the (stable) setter. That split means a route calling useNavbar()
// updates the bar without re-rendering itself — so there's no update loop.
const NavbarContentContext = createContext<NavbarContent>(EMPTY);
const NavbarSetContext = createContext<(content: NavbarContent) => void>(() => {});

/** Wrap the shell so `<Navbar />` and the module routes share one navbar slot. */
export function NavbarProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<NavbarContent>(EMPTY);
  return (
    <NavbarSetContext.Provider value={setContent}>
      <NavbarContentContext.Provider value={content}>{children}</NavbarContentContext.Provider>
    </NavbarSetContext.Provider>
  );
}

/**
 * Declare this route's navbar content. Applied on mount and cleared on unmount,
 * so navigating away empties the bar for the next route to fill. Both slots are
 * plain `ReactNode`s, so anything from a string to live, stateful controls works.
 *
 * useLayoutEffect (not useEffect) so the bar's slots swap before paint — no
 * flash of the previous route's content when navigating between modules. This is
 * a client-only SPA, so there is no SSR pass to guard against.
 *
 * ONE WRITER PER MODULE. The slot is last-write-wins with no precedence, and
 * React commits layout effects child-first — so when a module layout and a page
 * nested under it both call this, the *layout* always writes last and the page's
 * content never appears. Call it from the module layout only, and let that
 * layout read the location to decide what the bar shows for the current page.
 *
 * @example
 * useNavbar({
 *   leftAside: <SearchBar />,
 *   rightAside: <NavbarClock />,
 * });
 */
export function useNavbar({ leftAside, rightAside }: NavbarContent) {
  const setContent = useContext(NavbarSetContext);
  useLayoutEffect(() => {
    setContent({ leftAside, rightAside });
    return () => setContent(EMPTY);
  }, [setContent, leftAside, rightAside]);
}

/** Consistent module heading, sized to sit beside the search bar. */
export function NavbarTitle({ children }: { children: ReactNode }) {
  return (
    <span className="truncate text-xs font-medium tabular-nums tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

/** One segment of a `<NavbarBreadcrumb />` trail. */
export interface NavbarCrumb {
  /** Segment text. Uppercased by the bar's type style, so pass it in normal case. */
  label: string;
  /**
   * Where this segment navigates. Omit on the final segment — the current page
   * is never a link. Ancestors without a `to` render as plain text.
   */
  to?: LinkProps["to"];
  /** Path params for `to`, when the target route takes any. */
  params?: LinkProps["params"];
  /**
   * Optional mark shown before the label, naming the segment's *kind* where the
   * label alone reads as a bare value ("August 2026" → a ledger for August 2026).
   * Size it to the bar's text (`size-3.5`); it inherits the segment's color and,
   * on a linked segment, sits inside the click target.
   */
  icon?: ReactNode;
}

/**
 * A breadcrumb trail sized for the navbar's left slot — the depth-aware sibling
 * of `<NavbarTitle />`, styled to match it so the bar reads as one register.
 *
 * Use it only where a module actually has depth to show. A module whose page is
 * one level under its root has nothing to say beyond its own name: it should
 * keep `<NavbarTitle />` and leave the trail to routes that earn it.
 *
 * The final segment is the current page (`aria-current`, never a link);
 * everything before it links back up.
 *
 * @example
 * useNavbar({
 *   leftAside: (
 *     <NavbarBreadcrumb
 *       items={[
 *         { label: "Finance", to: "/finance" },
 *         { label: "August 2026", icon: <NotebookText className="size-3.5" /> },
 *       ]}
 *     />
 *   ),
 * });
 */
export function NavbarBreadcrumb({ items }: { items: readonly NavbarCrumb[] }) {
  return (
    // `min-w-0` at both levels so a long trail truncates inside the bar rather
    // than pushing the right slot off-screen; `flex-nowrap` keeps it on one line
    // (the primitive wraps by default, which would grow the bar's height).
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap gap-1.5 text-xs font-medium uppercase tabular-nums tracking-wide sm:gap-2">
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1;
          return (
            <Fragment key={item.label}>
              <BreadcrumbItem className="min-w-0">
                {isCurrent || !item.to ? (
                  <BreadcrumbPage className="inline-flex min-w-0 items-center gap-1.5 font-medium">
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link
                      to={item.to}
                      params={item.params}
                      className="inline-flex min-w-0 items-center gap-1.5"
                    >
                      {item.icon}
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isCurrent && <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/**
 * The current time on the client, re-read at the top of each minute. Returns
 * `null` until mounted so the first render is stable, then flips to the live
 * clock once the effect runs.
 */
function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    // Re-read the clock, then reschedule for the next minute boundary — the
    // display has minute precision, so this flips the minute on time without
    // re-rendering once a second.
    function tick() {
      setNow(new Date());
      timeoutId = setTimeout(tick, 60_000 - (Date.now() % 60_000));
    }
    tick();
    return () => clearTimeout(timeoutId);
  }, []);

  return now;
}

/**
 * Live date + time building block, e.g. `THU · 15 MAY · 09:42AM`. Lowest-priority
 * bar content: hidden below `sm` so the narrow (mobile) bar spends its width on
 * search + actions rather than the clock.
 */
export function NavbarClock() {
  const now = useNow();

  return (
    <span className="hidden whitespace-nowrap text-xs font-medium tabular-nums tracking-wide text-muted-foreground sm:inline">
      {now && formatDate(now, "EEE · d MMM · hh:mma").toUpperCase()}
    </span>
  );
}

/**
 * Global search building block (display-only prototype). Composes the shared
 * `TextInput` so it stays visually identical to every other search field in the
 * shell across light and dark mode — rather than re-styling a raw `<input>`.
 */
export function SearchBar() {
  return (
    <div className="w-64 max-w-[40vw]">
      <TextInput
        type="text"
        placeholder="Search…"
        aria-label="Search"
        className="bg-secondary border-transparent"
        iconRight={<Search />}
        autoComplete="off"
        autoCorrect="off"
      />
    </div>
  );
}

/**
 * The shell navbar skeleton. Render exactly once, inside a `<NavbarProvider>`.
 * It draws the bar and drops each route's `leftAside`/`rightAside` into place;
 * it owns no chrome of its own.
 */
export function Navbar() {
  const { leftAside, rightAside } = useContext(NavbarContentContext);

  return (
    // `shrink-0`: the bar is a fixed band in the shell column — it must not be
    // compressed by a tall page below it; the page scrolls instead.
    <nav className="flex shrink-0 items-center gap-2 border-b border-border/50 px-4 py-3 sm:gap-4 sm:px-6">
      {/* Left slot: takes the slack and yields first. `min-w-0` lets its
          contents shrink below their intrinsic width instead of overflowing
          the bar — the flexbox default (`min-width: auto`) would not. */}
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        {/* Below `md` the rail collapses to an off-canvas sheet; this is the
            only way to open it, so it's the sole element shown at that width. */}
        <SidebarTrigger className="md:hidden" />
        {leftAside}
      </div>
      {/* Right slot: intrinsic width, never squeezed — module actions and the
          user/account chrome stay legible as the bar narrows. */}
      <div className="flex shrink-0 items-center gap-2 sm:gap-4">{rightAside}</div>
    </nav>
  );
}
