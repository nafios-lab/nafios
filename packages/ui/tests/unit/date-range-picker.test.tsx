import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DateRange } from "react-day-picker";
import { DateRangePicker } from "../../src/components/date-range-picker.tsx";

afterEach(cleanup);

const JAN_10 = new Date(2026, 0, 10);
const JAN_20 = new Date(2026, 0, 20);

/** Open the popover by clicking the (single) trigger button and wait for a grid. */
async function openCalendar() {
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => {
    expect(screen.getAllByRole("grid").length).toBeGreaterThan(0);
  });
}

/** Click the day cell for the given YYYY-MM-DD across all rendered grids. */
function clickDay(isoDay: string) {
  const button = document.querySelector(`[data-day="${isoDay}"] button`);
  if (!button) throw new Error(`day cell ${isoDay} not found`);
  fireEvent.click(button as HTMLButtonElement);
}

describe("DateRangePicker", () => {
  test("shows the placeholder when no value is set", () => {
    render(<DateRangePicker onChange={() => {}} placeholder="Select span" />);
    expect(screen.getByText("Select span")).toBeDefined();
  });

  test("uses the default placeholder when none is provided", () => {
    render(<DateRangePicker onChange={() => {}} />);
    expect(screen.getByText("Pick a date range")).toBeDefined();
  });

  test("shows the placeholder when value has no `from`", () => {
    render(<DateRangePicker value={{ from: undefined, to: undefined }} onChange={() => {}} />);
    expect(screen.getByText("Pick a date range")).toBeDefined();
  });

  test("shows only the start date when `to` is missing", () => {
    render(<DateRangePicker value={{ from: JAN_10 }} onChange={() => {}} />);
    // Default format "MMM dd, yyyy"
    expect(screen.getByText("Jan 10, 2026")).toBeDefined();
  });

  test("shows the full range when both ends are set", () => {
    render(<DateRangePicker value={{ from: JAN_10, to: JAN_20 }} onChange={() => {}} />);
    expect(screen.getByText(/Jan 10, 2026/)).toBeDefined();
    expect(screen.getByText(/Jan 20, 2026/)).toBeDefined();
  });

  test("formats the range with a custom dateFormat", () => {
    render(
      <DateRangePicker
        value={{ from: JAN_10, to: JAN_20 }}
        onChange={() => {}}
        dateFormat="yyyy-MM-dd"
      />,
    );
    expect(screen.getByText(/2026-01-10/)).toBeDefined();
    expect(screen.getByText(/2026-01-20/)).toBeDefined();
  });

  test("renders a label", () => {
    render(<DateRangePicker value={{ from: JAN_10 }} onChange={() => {}} label="Trip dates" />);
    expect(screen.getByText("Trip dates")).toBeDefined();
  });

  test("renders without a label wrapper when label is omitted", () => {
    render(<DateRangePicker value={{ from: JAN_10 }} onChange={() => {}} />);
    expect(document.querySelector("label")).toBeNull();
  });

  test("disables the trigger when disabled", () => {
    render(<DateRangePicker onChange={() => {}} disabled />);
    expect(screen.getByRole("button")).toHaveProperty("disabled", true);
  });

  test("renders the requested number of months", async () => {
    render(<DateRangePicker value={{ from: JAN_10 }} onChange={() => {}} numberOfMonths={2} />);
    await openCalendar();
    expect(screen.getAllByRole("grid").length).toBe(2);
  });

  test("opens the calendar when the trigger is clicked", async () => {
    render(<DateRangePicker value={{ from: JAN_10 }} onChange={() => {}} />);
    await openCalendar();
    expect(screen.getAllByRole("grid").length).toBeGreaterThan(0);
  });

  test("clicking a start day fires onChange with that day as `from`", async () => {
    const onChange = mock((_r: DateRange | undefined) => {});
    render(<DateRangePicker value={{ from: JAN_10 }} onChange={onChange} />);
    await openCalendar();

    clickDay("2026-01-15");

    expect(onChange).toHaveBeenCalled();
    const range = onChange.mock.calls.at(-1)?.[0] as DateRange;
    expect(range.from).toBeDefined();
  });

  test("selecting an end date completes a from/to range", async () => {
    // Start with `from` already chosen so the visible month is deterministic
    // (January 2026) and day-picker computes `to` from the latest props.
    let current: DateRange | undefined = { from: JAN_10 };
    const onChange = mock((r: DateRange | undefined) => {
      current = r;
    });

    const { rerender } = render(<DateRangePicker value={current} onChange={onChange} />);
    await openCalendar();

    // Clicking a later day in the same month sets `to`.
    clickDay("2026-01-18");
    rerender(<DateRangePicker value={current} onChange={onChange} />);

    const final = current as unknown as DateRange;
    expect(final.from).toBeDefined();
    expect(final.to).toBeDefined();
    expect((final.from as Date).getDate()).toBe(10);
    expect((final.to as Date).getDate()).toBe(18);
  });

  test("works without an onChange handler", async () => {
    render(<DateRangePicker value={{ from: JAN_10 }} />);
    await openCalendar();
    expect(() => clickDay("2026-01-16")).not.toThrow();
  });
});
