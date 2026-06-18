import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MonthSelect, monthShort, months } from "../../src/components/month-select.tsx";

afterEach(cleanup);

describe("MonthSelect", () => {
  test("renders all twelve full month labels by default", () => {
    render(<MonthSelect />);
    for (const label of months) {
      expect(screen.getByRole("option", { name: label })).toBeDefined();
    }
  });

  test("renders short month labels when `short` is set", () => {
    render(<MonthSelect short />);
    for (const label of monthShort) {
      expect(screen.getByRole("option", { name: label })).toBeDefined();
    }
    // Full names should no longer be present.
    expect(screen.queryByRole("option", { name: "January" })).toBeNull();
  });

  test("fires onChange with the zero-based month index when clicked", () => {
    const onChange = mock((_: number) => {});
    render(<MonthSelect onChange={onChange} />);

    fireEvent.click(screen.getByRole("option", { name: "March" }));
    expect(onChange).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByRole("option", { name: "December" }));
    expect(onChange).toHaveBeenLastCalledWith(11);
  });

  test("does not throw when no onChange handler is supplied", () => {
    render(<MonthSelect />);
    expect(() => fireEvent.click(screen.getByRole("option", { name: "April" }))).not.toThrow();
  });

  test("marks the selected month via aria-selected", () => {
    render(<MonthSelect value={5} />);
    expect(screen.getByRole("option", { name: "June" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("option", { name: "May" }).getAttribute("aria-selected")).toBe("false");
  });

  test("disables every option when `disabled`", () => {
    const onChange = mock((_: number) => {});
    render(<MonthSelect disabled onChange={onChange} />);
    const jan = screen.getByRole("option", { name: "January" }) as HTMLButtonElement;
    expect(jan.disabled).toBe(true);
    fireEvent.click(jan);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("disables only the months listed in disabledMonths", () => {
    render(<MonthSelect disabledMonths={[0, 11]} />);
    expect((screen.getByRole("option", { name: "January" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole("option", { name: "December" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole("option", { name: "June" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  test("applies brand selected styling for the brand variant", () => {
    render(<MonthSelect variant="brand" value={0} />);
    const jan = screen.getByRole("option", { name: "January" });
    expect(jan.className).toContain("bg-brand-darker");
  });

  test("applies default selected styling for the default variant", () => {
    render(<MonthSelect value={0} />);
    const jan = screen.getByRole("option", { name: "January" });
    expect(jan.className).toContain("bg-primary");
  });

  test("forwards a custom className to the listbox container", () => {
    render(<MonthSelect className="my-grid" />);
    const listbox = screen.getByRole("listbox", { name: "Select month" });
    expect(listbox.className).toContain("my-grid");
  });
});
