import { TextInput } from "@nafios/ui/components/text-input";
import { SidebarTrigger } from "@nafios/ui/components/ui/sidebar";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { Search } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import { signOutFn } from "../lib/auth-fns";

/**
 * Shell navbar — a presentational *skeleton* shared by every module in the
 * suite (Finance, Calendar, Radio, Doc, …) and the root (welcome) page. The
 * shell mounts `<Navbar />` once, above the page outlet; each route fills the
 * two slots declaratively via `useNavbar()`.
 *
 * The skeleton owns *only* the bar layout — border, padding, and the two flex
 * regions. It renders nothing by default: every route composes its own left and
 * right content from the building blocks it needs (`SearchBar`, `UserMenu`,
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
  /** Right-aligned slot — e.g. module actions, the user menu. */
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

// useLayoutEffect on the client (no flash when navigating between modules),
// useEffect on the server to avoid React's SSR useLayoutEffect warning.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Declare this route's navbar content. Applied on mount and cleared on unmount,
 * so navigating away empties the bar for the next route to fill. Both slots are
 * plain `ReactNode`s, so anything from a string to live, stateful controls works.
 *
 * @example
 * useNavbar({
 *   leftAside: <SearchBar />,
 *   rightAside: <UserMenu email={email} />,
 * });
 */
export function useNavbar({ leftAside, rightAside }: NavbarContent) {
  const setContent = useContext(NavbarSetContext);
  useIsomorphicLayoutEffect(() => {
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

/**
 * The current time on the client, re-read at the top of each minute. Returns
 * `null` until mounted: the server has no clock that matches the browser's, so
 * deferring the first value past hydration avoids a mismatch.
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
      {now && format(now, "EEE · d MMM · hh:mma").toUpperCase()}
    </span>
  );
}

/**
 * Global search building block (display-only prototype). Composes the shared
 * `TextInput` so it stays visually identical to every other search field in the
 * shell (e.g. the welcome bar) across light and dark mode — rather than
 * re-styling a raw `<input>`.
 */
export function SearchBar() {
  return (
    <div className="w-64 max-w-[40vw]">
      <TextInput
        type="search"
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

/** User email + logout building block. */
export function UserMenu({ email }: { email: string | undefined }) {
  const navigate = useNavigate();

  async function handleLogout() {
    await signOutFn();
    navigate({ to: "/auth/login" });
  }

  return (
    <div className="flex items-center gap-4">
      {email && <span className="text-sm text-muted-foreground">{email}</span>}
      <button
        type="button"
        onClick={handleLogout}
        className="rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
      >
        Logout
      </button>
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
    <nav className="flex items-center gap-2 border-b border-border/50 px-4 py-3 sm:gap-4 sm:px-6">
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
