import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { YearSelect } from "../../src/components/year-select.tsx";

afterEach(cleanup);

function prevButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "Previous years" }) as HTMLButtonElement;
}
function nextButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "Next years" }) as HTMLButtonElement;
}

describe("YearSelect", () => {
  test("renders a page of years starting at the value's page boundary", () => {
    // value 1995 → page starts at 1992 (1995 - 1995 % 12 = 1992), spans 1992–2003.
    render(<YearSelect value={1995} min={1900} max={2100} />);
    expect(screen.getByText("1992 – 2003")).toBeDefined();
    expect(screen.getByRole("option", { name: "1992" })).toBeDefined();
    expect(screen.getByRole("option", { name: "2003" })).toBeDefined();
    expect(screen.queryByRole("option", { name: "2004" })).toBeNull();
  });

  test("marks the selected year via aria-selected", () => {
    render(<YearSelect value={1995} />);
    expect(screen.getByRole("option", { name: "1995" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("option", { name: "1994" }).getAttribute("aria-selected")).toBe(
      "false",
    );
  });

  test("fires onChange with the clicked year", () => {
    const onChange = mock((_: number) => {});
    render(<YearSelect value={1995} onChange={onChange} />);
    fireEvent.click(screen.getByRole("option", { name: "1998" }));
    expect(onChange).toHaveBeenCalledWith(1998);
  });

  test("does not throw without an onChange handler", () => {
    render(<YearSelect value={1995} />);
    expect(() => fireEvent.click(screen.getByRole("option", { name: "1996" }))).not.toThrow();
  });

  test("paginates forward and backward", () => {
    render(<YearSelect value={1995} min={1900} max={2100} />);
    expect(screen.getByText("1992 – 2003")).toBeDefined();

    fireEvent.click(nextButton());
    expect(screen.getByText("2004 – 2015")).toBeDefined();
    expect(screen.getByRole("option", { name: "2004" })).toBeDefined();

    fireEvent.click(prevButton());
    expect(screen.getByText("1992 – 2003")).toBeDefined();
  });

  test("disables the previous button at the lower boundary and ignores clicks", () => {
    // min 1992 == pageStart, so going back would fall below min → prev disabled.
    render(<YearSelect value={1995} min={1992} max={2100} />);
    expect(prevButton().disabled).toBe(true);

    // Clicking the disabled-state guard (canGoPrev false) must not change the page.
    fireEvent.click(prevButton());
    expect(screen.getByText("1992 – 2003")).toBeDefined();
  });

  test("disables the next button at the upper boundary and ignores clicks", () => {
    // max 2003 == last year of this page, so next page exceeds max → next disabled.
    render(<YearSelect value={1995} min={1900} max={2003} />);
    expect(nextButton().disabled).toBe(true);

    fireEvent.click(nextButton());
    expect(screen.getByText("1992 – 2003")).toBeDefined();
  });

  test("clamps the visible years to the min/max window", () => {
    // Page 1992–2003 but max is 1995 → only 1992..1995 should render.
    render(<YearSelect value={1995} min={1992} max={1995} />);
    expect(screen.getByRole("option", { name: "1992" })).toBeDefined();
    expect(screen.getByRole("option", { name: "1995" })).toBeDefined();
    expect(screen.queryByRole("option", { name: "1996" })).toBeNull();
  });

  test("defaults to the current year's page when no value is given", () => {
    const year = new Date().getFullYear();
    const expectedStart = year - (year % 12);
    render(<YearSelect />);
    expect(screen.getByText(`${expectedStart} – ${expectedStart + 11}`)).toBeDefined();
  });

  test("disables all options and nav buttons when `disabled`", () => {
    const onChange = mock((_: number) => {});
    render(<YearSelect value={1995} disabled onChange={onChange} />);
    const opt = screen.getByRole("option", { name: "1995" }) as HTMLButtonElement;
    expect(opt.disabled).toBe(true);
    expect(prevButton().disabled).toBe(true);
    expect(nextButton().disabled).toBe(true);
    fireEvent.click(opt);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("applies brand selected styling for the brand variant", () => {
    render(<YearSelect variant="brand" value={1995} />);
    expect(screen.getByRole("option", { name: "1995" }).className).toContain("bg-brand-darker");
  });

  test("applies default selected styling for the default variant", () => {
    render(<YearSelect value={1995} />);
    expect(screen.getByRole("option", { name: "1995" }).className).toContain("bg-primary");
  });

  test("forwards a custom className to the root container", () => {
    render(<YearSelect value={1995} className="year-root" />);
    const listbox = screen.getByRole("listbox", { name: "Select year" });
    // className is applied to the outer wrapper, which is the listbox's parent.
    expect(listbox.parentElement?.className).toContain("year-root");
  });
});
