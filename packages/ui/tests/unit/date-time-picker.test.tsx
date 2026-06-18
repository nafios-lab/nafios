import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DateTimePicker } from "../../src/components/date-time-picker.tsx";

afterEach(cleanup);

// 2026-01-15, 14:30 local time — exercises both date and time branches.
const JAN_15_1430 = new Date(2026, 0, 15, 14, 30);

/** Open the popover by clicking the (single) trigger button and wait for the grid. */
async function openCalendar() {
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => {
    expect(screen.getByRole("grid")).toBeDefined();
  });
}

describe("DateTimePicker", () => {
  test("shows the placeholder when no value is set", () => {
    render(<DateTimePicker onChange={() => {}} placeholder="When?" />);
    expect(screen.getByText("When?")).toBeDefined();
  });

  test("uses the default placeholder when none is provided", () => {
    render(<DateTimePicker onChange={() => {}} />);
    expect(screen.getByText("Pick date and time")).toBeDefined();
  });

  test("formats the value with the default format", () => {
    render(<DateTimePicker value={JAN_15_1430} onChange={() => {}} />);
    // "PPP p" => "January 15th, 2026 at 2:30 PM"
    expect(screen.getByText(/January 15th, 2026/)).toBeDefined();
    expect(screen.getByText(/2:30 PM/)).toBeDefined();
  });

  test("formats the value with a custom dateFormat", () => {
    render(
      <DateTimePicker value={JAN_15_1430} onChange={() => {}} dateFormat="yyyy-MM-dd HH:mm" />,
    );
    expect(screen.getByText("2026-01-15 14:30")).toBeDefined();
  });

  test("renders a label", () => {
    render(<DateTimePicker value={JAN_15_1430} onChange={() => {}} label="Due" />);
    expect(screen.getByText("Due")).toBeDefined();
  });

  test("renders without a label wrapper when label is omitted", () => {
    render(<DateTimePicker value={JAN_15_1430} onChange={() => {}} />);
    expect(document.querySelector("label")).toBeNull();
  });

  test("disables the trigger when disabled", () => {
    render(<DateTimePicker onChange={() => {}} disabled />);
    expect(screen.getByRole("button")).toHaveProperty("disabled", true);
  });

  test("opens the calendar and the time picker", async () => {
    render(<DateTimePicker value={JAN_15_1430} onChange={() => {}} />);
    await openCalendar();
    expect(screen.getByRole("grid")).toBeDefined();
    expect(screen.getByLabelText("Hours")).toBeDefined();
    expect(screen.getByLabelText("Minutes")).toBeDefined();
  });

  test("selecting a day preserves the existing time on the new date", async () => {
    const onChange = mock((_d: Date | undefined) => {});
    render(<DateTimePicker value={JAN_15_1430} onChange={onChange} />);
    await openCalendar();

    // NOTE: the date-time-picker's Calendar does not pin its visible month to
    // the selected value (no `month`/`defaultMonth` prop), so it opens on the
    // current month rather than January. Pick a day that is actually rendered,
    // and assert that the *time* (14:30) is preserved onto the new date.
    const grid = screen.getByRole("grid");
    const anyDay = grid.querySelector("[data-day] button") as HTMLButtonElement;
    fireEvent.click(anyDay);

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]?.[0] as Date;
    expect(next).toBeInstanceOf(Date);
    // Time (14:30) carried over from the previous value.
    expect(next.getHours()).toBe(14);
    expect(next.getMinutes()).toBe(30);
  });

  test("deselecting the currently selected day clears the value", async () => {
    // The calendar opens on the current month, so put the value's day inside it
    // (day 1 of the current month always exists). Clicking the already-selected
    // day toggles it off, driving handleDateSelect(undefined).
    const now = new Date();
    const valueInView = new Date(now.getFullYear(), now.getMonth(), 1, 8, 0);
    const onChange = mock((_d: Date | undefined) => {});
    render(<DateTimePicker value={valueInView} onChange={onChange} />);
    await openCalendar();

    const grid = screen.getByRole("grid");
    // The selected day cell is rendered (it is in the visible month). Click its
    // inner day button to toggle the single-mode selection off.
    const selectedBtn = grid.querySelector(
      '[aria-selected="true"] button, button[aria-selected="true"]',
    ) as HTMLButtonElement | null;
    expect(selectedBtn).not.toBeNull();
    fireEvent.click(selectedBtn as HTMLButtonElement);

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  test("selecting a day when no value exists yields a date (no prior time)", async () => {
    const onChange = mock((_d: Date | undefined) => {});
    render(<DateTimePicker onChange={onChange} />);
    await openCalendar();

    // With no value, the visible month is the current month — pick any rendered
    // day cell so the assertion stays clock-independent.
    const grid = screen.getByRole("grid");
    const anyDay = grid.querySelector("[data-day] button") as HTMLButtonElement;
    fireEvent.click(anyDay);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toBeInstanceOf(Date);
  });

  test("changing the time updates the value (12-hour mode, PM preserved)", async () => {
    const onChange = mock((_d: Date | undefined) => {});
    render(<DateTimePicker value={JAN_15_1430} onChange={onChange} />);
    await openCalendar();

    // Increment the hours spinner. With a PM value (2 PM), incrementing to 3
    // and converting back to 24h must give 15:00.
    const hoursContainer = screen.getByLabelText("Hours").closest("div") as HTMLElement;
    fireEvent.click(within(hoursContainer).getAllByLabelText("Increment")[0] as HTMLElement);

    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)?.[0] as Date;
    expect(next.getDate()).toBe(15);
    expect(next.getHours()).toBe(15); // 3 PM
    expect(next.getMinutes()).toBe(30);
  });

  test("changing the time works in 24-hour mode", async () => {
    const onChange = mock((_d: Date | undefined) => {});
    render(<DateTimePicker value={JAN_15_1430} onChange={onChange} use12Hour={false} />);
    await openCalendar();

    // In 24h mode there's no AM/PM toggle.
    expect(screen.queryByLabelText(/Switch to/)).toBeNull();

    // Type a new hour and commit via blur.
    const hours = screen.getByLabelText("Hours") as HTMLInputElement;
    fireEvent.change(hours, { target: { value: "9" } });
    fireEvent.blur(hours);

    const next = onChange.mock.calls.at(-1)?.[0] as Date;
    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(30);
  });

  test("changing the time with no prior value falls back to now", async () => {
    const onChange = mock((_d: Date | undefined) => {});
    render(<DateTimePicker onChange={onChange} />);
    await openCalendar();

    const minutes = screen.getByLabelText("Minutes") as HTMLInputElement;
    fireEvent.change(minutes, { target: { value: "45" } });
    fireEvent.blur(minutes);

    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)?.[0] as Date;
    expect(next).toBeInstanceOf(Date);
    expect(next.getMinutes()).toBe(45);
  });

  test("formats AM times correctly (to12Hour AM branch + midnight)", () => {
    // 09:05 -> "9:05 AM"
    render(<DateTimePicker value={new Date(2026, 0, 15, 9, 5)} onChange={() => {}} />);
    expect(screen.getByText(/9:05 AM/)).toBeDefined();
  });

  test("renders a midnight value (hours24 % 12 || 12 => 12 AM)", async () => {
    const onChange = mock((_d: Date | undefined) => {});
    render(<DateTimePicker value={new Date(2026, 0, 15, 0, 0)} onChange={onChange} />);
    // "12:00 AM"
    expect(screen.getByText(/12:00 AM/)).toBeDefined();

    // Exercise the 12 AM -> 24h conversion: incrementing the hours from 12 (AM)
    // clamps within 1..12 and converts AM/12 to 0.
    await openCalendar();
    const hours = screen.getByLabelText("Hours") as HTMLInputElement;
    fireEvent.change(hours, { target: { value: "12" } });
    fireEvent.blur(hours);
    const next = onChange.mock.calls.at(-1)?.[0] as Date;
    // 12 AM -> 0 hours
    expect(next.getHours()).toBe(0);
  });

  test("toggling AM/PM updates the value via to24Hour", async () => {
    const onChange = mock((_d: Date | undefined) => {});
    // 9:00 AM value; toggling to PM should yield 21:00.
    render(<DateTimePicker value={new Date(2026, 0, 15, 9, 0)} onChange={onChange} />);
    await openCalendar();

    fireEvent.click(screen.getByLabelText("Switch to PM"));

    const next = onChange.mock.calls.at(-1)?.[0] as Date;
    expect(next.getHours()).toBe(21);
  });

  test("respects use12Hour=false for the trigger display value source", () => {
    // 24h value rendered with a 24h format string.
    render(
      <DateTimePicker
        value={new Date(2026, 0, 15, 23, 15)}
        onChange={() => {}}
        use12Hour={false}
        dateFormat="HH:mm"
      />,
    );
    expect(screen.getByText("23:15")).toBeDefined();
  });
});
