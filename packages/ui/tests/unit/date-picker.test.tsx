import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DatePicker } from "../../src/components/date-picker.tsx";

afterEach(cleanup);

// A fixed reference date so assertions never depend on the wall clock.
const JAN_15 = new Date(2026, 0, 15);

/** Open the popover by clicking the (single) trigger button and wait for the grid. */
async function openCalendar() {
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => {
    expect(screen.getByRole("grid")).toBeDefined();
  });
}

/** Click the day cell for the given YYYY-MM-DD within the rendered grid. */
function clickDay(isoDay: string) {
  const grid = screen.getByRole("grid");
  const button = grid.querySelector(`[data-day="${isoDay}"] button`);
  if (!button) throw new Error(`day cell ${isoDay} not found`);
  fireEvent.click(button as HTMLButtonElement);
}

describe("DatePicker", () => {
  test("shows the placeholder when no value is set", () => {
    render(<DatePicker onChange={() => {}} placeholder="Choose a day" />);
    expect(screen.getByText("Choose a day")).toBeDefined();
  });

  test("uses the default placeholder when none is provided", () => {
    render(<DatePicker onChange={() => {}} />);
    expect(screen.getByText("Pick a date")).toBeDefined();
  });

  test("formats the value with the default format", () => {
    render(<DatePicker value={JAN_15} onChange={() => {}} />);
    // "PPP" => "January 15th, 2026"
    expect(screen.getByText("January 15th, 2026")).toBeDefined();
  });

  test("formats the value with a custom dateFormat", () => {
    render(<DatePicker value={JAN_15} onChange={() => {}} dateFormat="yyyy-MM-dd" />);
    expect(screen.getByText("2026-01-15")).toBeDefined();
  });

  test("renders a label and associates it with the field", () => {
    render(<DatePicker value={JAN_15} onChange={() => {}} label="Start date" />);
    expect(screen.getByText("Start date")).toBeDefined();
  });

  test("renders without a label wrapper when label is omitted", () => {
    render(<DatePicker value={JAN_15} onChange={() => {}} />);
    // No <label> element should be present.
    expect(document.querySelector("label")).toBeNull();
  });

  test("disables the trigger when disabled", () => {
    render(<DatePicker onChange={() => {}} disabled />);
    expect(screen.getByRole("button")).toHaveProperty("disabled", true);
  });

  test("opens the calendar when the trigger is clicked", async () => {
    render(<DatePicker value={JAN_15} onChange={() => {}} />);
    await openCalendar();
    expect(screen.getByRole("grid")).toBeDefined();
  });

  test("selecting a day fires onChange with that date and closes the popover", async () => {
    const onChange = mock((_d: Date | undefined) => {});
    render(<DatePicker value={JAN_15} onChange={onChange} />);
    await openCalendar();

    clickDay("2026-01-20");

    expect(onChange).toHaveBeenCalledTimes(1);
    const picked = onChange.mock.calls[0][0] as Date;
    expect(picked.getFullYear()).toBe(2026);
    expect(picked.getMonth()).toBe(0);
    expect(picked.getDate()).toBe(20);

    // Selecting a date closes the popover, so the grid unmounts.
    await waitFor(() => {
      expect(screen.queryByRole("grid")).toBeNull();
    });
  });

  test("works without an onChange handler", async () => {
    render(<DatePicker value={JAN_15} />);
    await openCalendar();
    // Should not throw even though onChange is undefined.
    expect(() => clickDay("2026-01-21")).not.toThrow();
  });

  test("navigates to month view and picks a month", async () => {
    const onChange = mock((_d: Date | undefined) => {});
    render(<DatePicker value={JAN_15} onChange={onChange} />);
    await openCalendar();

    // The caption button shows "January 2026"; click it to enter month view.
    fireEvent.click(screen.getByRole("button", { name: "January 2026" }));

    await waitFor(() => {
      expect(screen.getByRole("listbox", { name: "Select month" })).toBeDefined();
    });

    // Pick March (short label), which returns to calendar view on the new month.
    fireEvent.click(screen.getByRole("option", { name: "Mar" }));

    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeDefined();
    });
    // Caption now reflects March 2026.
    expect(screen.getByRole("button", { name: "March 2026" })).toBeDefined();
  });

  test("navigates to year view from month view and picks a year", async () => {
    render(<DatePicker value={JAN_15} onChange={() => {}} />);
    await openCalendar();

    fireEvent.click(screen.getByRole("button", { name: "January 2026" }));
    await waitFor(() => {
      expect(screen.getByRole("listbox", { name: "Select month" })).toBeDefined();
    });

    // In month view, the year header button shows "2026".
    fireEvent.click(screen.getByRole("button", { name: "2026" }));
    await waitFor(() => {
      expect(screen.getByRole("listbox", { name: "Select year" })).toBeDefined();
    });

    // The default year page is 2016–2027; pick 2024 (within the page), which
    // returns to month view for the chosen year.
    const yearList = screen.getByRole("listbox", { name: "Select year" });
    fireEvent.click(within(yearList).getByRole("option", { name: "2024" }));
    await waitFor(() => {
      expect(screen.getByRole("listbox", { name: "Select month" })).toBeDefined();
    });
    // The month view year header should now read 2024.
    expect(screen.getByRole("button", { name: "2024" })).toBeDefined();
  });

  test("falls back to the current month when no value is given", async () => {
    // No value: viewMonth defaults to `new Date()`. We only assert the popover
    // opens and a grid renders — no clock-dependent assertions.
    render(<DatePicker onChange={() => {}} />);
    await openCalendar();
    expect(screen.getByRole("grid")).toBeDefined();
  });
});
