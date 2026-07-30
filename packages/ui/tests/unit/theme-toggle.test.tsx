import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "../../src/components/theme-toggle.tsx";

beforeEach(() => {
  // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API unavailable in test env
  document.cookie = "nafios-theme=; max-age=0; path=/";
  document.documentElement.classList.remove("dark");
});

afterEach(cleanup);

/** Drive the toggle to a known light state (no `.dark` on <html>). */
async function toLight(user: ReturnType<typeof userEvent.setup>) {
  if (document.documentElement.classList.contains("dark")) {
    await user.click(screen.getByRole("button"));
  }
}

describe("ThemeToggle", () => {
  test("renders a labelled toggle button", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: /Switch to (light|dark) mode/ })).toBeDefined();
  });

  test("clicking flips the `.dark` class on the document element", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const button = screen.getByRole("button", { name: /Switch to (light|dark) mode/ });

    const before = document.documentElement.classList.contains("dark");
    await user.click(button);
    expect(document.documentElement.classList.contains("dark")).toBe(!before);
    await user.click(button);
    expect(document.documentElement.classList.contains("dark")).toBe(before);
  });

  test("label reflects the resolved theme", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await toLight(user);

    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeDefined();
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeDefined();
  });

  test("merges a custom className, overriding the default placement", () => {
    render(<ThemeToggle className="bottom-24" />);
    const button = screen.getByRole("button", { name: /Switch to (light|dark) mode/ });
    expect(button.className).toContain("bottom-24");
    expect(button.className).not.toContain("bottom-6");
    // Non-conflicting defaults survive the merge.
    expect(button.className).toContain("right-6");
    expect(button.className).toContain("fixed");
  });
});
