import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CurrencyInput } from "../../src/components/currency-input.tsx";

afterEach(cleanup);

function input(): HTMLInputElement {
  return screen.getByRole("textbox") as HTMLInputElement;
}

describe("CurrencyInput", () => {
  test("renders an uncontrolled default value grouped and label-prefixed at rest", () => {
    render(<CurrencyInput defaultValue={715235} />);
    expect(input().value).toBe("7,152.35");
    // The ISO code ("USD") is a leading adornment, not part of the input value.
    expect(screen.getByText("USD")).toBeDefined();
    // Left padding is widened past the default `pl-9` so the value clears the label.
    expect(input().className).toContain("pl-14");
  });

  test("renders an empty field for a null value", () => {
    render(<CurrencyInput value={null} />);
    expect(input().value).toBe("");
  });

  test("emits parsed minor units as the user types", () => {
    const onValueChange = mock((_: number | null) => {});
    render(<CurrencyInput onValueChange={onValueChange} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "12.34" } });
    expect(onValueChange).toHaveBeenLastCalledWith(1234);
  });

  test("emits null when the field is cleared", () => {
    const onValueChange = mock((_: number | null) => {});
    render(<CurrencyInput defaultValue={500} onValueChange={onValueChange} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "" } });
    expect(onValueChange).toHaveBeenLastCalledWith(null);
  });

  test("groups live while typing and pads the fraction on blur", () => {
    render(<CurrencyInput defaultValue={715235} />);
    fireEvent.focus(input());
    expect(input().value).toBe("7,152.35"); // grouped, ready to edit
    fireEvent.change(input(), { target: { value: "1234.5" } });
    expect(input().value).toBe("1,234.5"); // comma auto-inserted, fraction left as typed
    fireEvent.blur(input());
    expect(input().value).toBe("1,234.50"); // fraction padded at rest
  });

  test("auto-inserts grouping separators as digits are entered", () => {
    render(<CurrencyInput />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "1000" } });
    expect(input().value).toBe("1,000");
    fireEvent.change(input(), { target: { value: "1000000" } });
    expect(input().value).toBe("1,000,000");
  });

  test("keeps a trailing decimal point while the fraction is still being typed", () => {
    const onValueChange = mock((_: number | null) => {});
    render(<CurrencyInput onValueChange={onValueChange} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "1234." } });
    expect(input().value).toBe("1,234.");
    expect(onValueChange).toHaveBeenLastCalledWith(123400);
  });

  test("backspacing onto a grouping separator deletes the digit, not just the comma", () => {
    render(<CurrencyInput defaultValue={123400} />);
    fireEvent.focus(input());
    const el = input();
    expect(el.value).toBe("1,234.00");
    // Caret sits just after the comma (index 2); Backspace should drop the "1".
    el.setSelectionRange(2, 2);
    fireEvent.keyDown(el, { key: "Backspace" });
    expect(input().value).toBe("234.00");
  });

  test("reflects a controlled value and does not self-update", () => {
    const onValueChange = mock((_: number | null) => {});
    render(<CurrencyInput value={100} onValueChange={onValueChange} />);
    expect(input().value).toBe("1.00");
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "9.99" } });
    // Parent was notified, but the displayed value stays pinned to `value`.
    expect(onValueChange).toHaveBeenLastCalledWith(999);
    fireEvent.blur(input());
    expect(input().value).toBe("1.00");
  });

  test("rejects negatives by default and accepts them with allowNegative", () => {
    const onValueChange = mock((_: number | null) => {});
    const { rerender } = render(<CurrencyInput onValueChange={onValueChange} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "-5" } });
    expect(onValueChange).toHaveBeenLastCalledWith(500);

    rerender(<CurrencyInput allowNegative onValueChange={onValueChange} />);
    fireEvent.change(input(), { target: { value: "-5" } });
    expect(onValueChange).toHaveBeenLastCalledWith(-500);
  });

  test("clamps parsed values into [min, max]", () => {
    const onValueChange = mock((_: number | null) => {});
    render(<CurrencyInput max={100000} onValueChange={onValueChange} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "99999.99" } });
    expect(onValueChange).toHaveBeenLastCalledWith(100000);
  });

  test("hides the currency label when hideSymbol is set", () => {
    render(<CurrencyInput hideSymbol defaultValue={100} />);
    expect(screen.queryByText("USD")).toBeNull();
  });

  test("forwards label, error, and disabled to the underlying field", () => {
    render(<CurrencyInput label="Amount" error="Required" disabled />);
    expect(screen.getByText("Amount")).toBeDefined();
    expect(screen.getByText("Required")).toBeDefined();
    expect(input().disabled).toBe(true);
    expect(input().getAttribute("aria-invalid")).toBe("true");
  });

  test("invokes caller-supplied focus and blur handlers", () => {
    const onFocus = mock(() => {});
    const onBlur = mock(() => {});
    render(<CurrencyInput onFocus={onFocus} onBlur={onBlur} />);
    fireEvent.focus(input());
    fireEvent.blur(input());
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});
