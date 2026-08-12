import { afterEach, describe, expect, mock, test } from "bun:test";
import { type Money, moneyFromCents, toCents } from "@nafios/finance";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MoneyInput } from "../../src/features/finance/components/shared/money-input.tsx";

afterEach(cleanup);

function input(): HTMLInputElement {
  return screen.getByRole("textbox") as HTMLInputElement;
}

describe("MoneyInput", () => {
  test("renders a Money default value as a formatted SGD amount", () => {
    render(<MoneyInput defaultValue={moneyFromCents(715235)} />);
    expect(input().value).toBe("7,152.35");
    // The ISO code ("SGD") is a leading adornment, not part of the input value.
    expect(screen.getByText("SGD")).toBeDefined();
  });

  test("transforms user input into Money on change", () => {
    const onValueChange = mock((_: Money | null) => {});
    render(<MoneyInput onValueChange={onValueChange} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "12.34" } });

    expect(onValueChange).toHaveBeenCalledTimes(1);
    const emitted = onValueChange.mock.calls[0]?.[0] as Money;
    expect(toCents(emitted)).toBe(1234);
  });

  test("emits null when the field is cleared", () => {
    const onValueChange = mock((_: Money | null) => {});
    render(<MoneyInput defaultValue={moneyFromCents(500)} onValueChange={onValueChange} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "" } });
    expect(onValueChange).toHaveBeenLastCalledWith(null);
  });

  test("accepts a controlled Money value", () => {
    render(<MoneyInput value={moneyFromCents(129900)} />);
    expect(input().value).toBe("1,299.00");
  });

  test("renders an empty field for a null controlled value", () => {
    render(<MoneyInput value={null} />);
    expect(input().value).toBe("");
  });

  test("clamps out-of-range input so Money construction never throws", () => {
    const onValueChange = mock((_: Money | null) => {});
    // 13 integer digits would exceed numeric(12,2) and throw in moneyFromCents;
    // the underlying max clamp keeps it inside the valid range.
    render(<MoneyInput onValueChange={onValueChange} />);
    fireEvent.focus(input());
    expect(() => fireEvent.change(input(), { target: { value: "99999999999999" } })).not.toThrow();
    const emitted = onValueChange.mock.calls.at(-1)?.[0] as Money;
    expect(toCents(emitted)).toBe(999_999_999_999);
  });

  test("supports negative Money when allowNegative is set", () => {
    const onValueChange = mock((_: Money | null) => {});
    render(<MoneyInput allowNegative onValueChange={onValueChange} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "-42" } });
    const emitted = onValueChange.mock.calls.at(-1)?.[0] as Money;
    expect(toCents(emitted)).toBe(-4200);
  });
});
