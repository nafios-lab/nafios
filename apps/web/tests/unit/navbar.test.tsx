import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  Navbar,
  NavbarClock,
  type NavbarContent,
  NavbarProvider,
  NavbarTitle,
  SearchBar,
  UserMenu,
  useNavbar,
} from "../../src/components/navbar.tsx";
import { navigate, resetServerFnMocks, signOut } from "../setup.ts";

// UserMenu's logout calls the real signOutFn server fn (which builds against the
// process-wide createServerFn/auth-core stubs in tests/setup.ts) and then
// navigates. We assert on the shared `signOut` and `navigate` spies.

beforeEach(resetServerFnMocks);
afterEach(cleanup);

/** Mount the shell skeleton with a route declaring its slots via useNavbar(). */
function renderNavbar(content: NavbarContent) {
  function Route() {
    useNavbar(content);
    return null;
  }
  return render(
    <NavbarProvider>
      <Navbar />
      <Route />
    </NavbarProvider>,
  );
}

describe("Navbar skeleton", () => {
  test("renders whatever a route drops into the left and right slots", () => {
    renderNavbar({
      leftAside: <span>left-content</span>,
      rightAside: <span>right-content</span>,
    });
    expect(screen.getByText("left-content")).toBeDefined();
    expect(screen.getByText("right-content")).toBeDefined();
  });

  test("owns no chrome of its own — empty when a route declares nothing", () => {
    renderNavbar({});
    // The bar still renders, but holds no default search/title/user content.
    expect(screen.queryByText(/@/)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("SearchBar building block", () => {
  test("renders an accessible search input", () => {
    render(<SearchBar />);
    const input = screen.getByRole("searchbox", { name: /search/i });
    expect(input).toBeDefined();
  });
});

describe("NavbarTitle building block", () => {
  test("renders its children as the heading", () => {
    render(<NavbarTitle>Finance</NavbarTitle>);
    expect(screen.getByText("Finance")).toBeDefined();
  });
});

describe("NavbarClock building block", () => {
  // Pin the system clock so the rendered value is deterministic; restore the
  // real clock afterwards so other suites see the true time.
  afterEach(() => setSystemTime());

  test("renders today's date and the current time, e.g. THU · 15 MAY · 09:42AM", async () => {
    // Thu 15 May 2025, 09:42 local time — built in local time so the assertion
    // holds regardless of the machine's timezone.
    setSystemTime(new Date(2025, 4, 15, 9, 42, 0));

    render(<NavbarClock />);

    // The clock fills in on mount (it starts empty to avoid an SSR mismatch).
    expect(await screen.findByText("THU · 15 MAY · 09:42AM")).toBeDefined();
  });
});

describe("UserMenu building block", () => {
  test("renders the user email when provided", () => {
    render(<UserMenu email="user@nafios.local" />);
    expect(screen.getByText("user@nafios.local")).toBeDefined();
  });

  test("omits the email element when no email is supplied", () => {
    render(<UserMenu email={undefined} />);
    expect(screen.queryByText(/@/)).toBeNull();
  });

  test("logout signs out and redirects to the login page", async () => {
    render(<UserMenu email="user@nafios.local" />);

    fireEvent.click(screen.getByRole("button", { name: /Logout/ }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/auth/login" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
