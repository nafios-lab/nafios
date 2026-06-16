import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DobInput } from "../../src/components/dob-input.tsx";

afterEach(cleanup);

describe("DobInput", () => {
  test("renders with the default placeholder", () => {
    render(<DobInput aria-label="Date of birth" />);
    const input = screen.getByPlaceholderText("DD / MM / YYYY") as HTMLInputElement;
    expect(input).toBeDefined();
  });

  test("uses numeric input mode", () => {
    render(<DobInput placeholder="Birthday" />);
    const input = screen.getByPlaceholderText("Birthday") as HTMLInputElement;
    expect(input.getAttribute("inputmode")).toBe("numeric");
  });

  test("accepts a custom placeholder", () => {
    render(<DobInput placeholder="Your birthday" />);
    expect(screen.getByPlaceholderText("Your birthday")).toBeDefined();
  });

  test("accepts a custom formatHint without crashing", () => {
    render(<DobInput placeholder="Birthday" formatHint="MM / DD / YYYY" />);
    expect(screen.getByPlaceholderText("Birthday")).toBeDefined();
  });

  test("renders a controlled value", () => {
    render(<DobInput placeholder="Birthday" value="01 / 02 / 1990" />);
    const input = screen.getByPlaceholderText("Birthday") as HTMLInputElement;
    expect(input.value).toBe("01 / 02 / 1990");
  });

  test("fires onValueChange when the input changes", () => {
    const onValueChange = mock((_: string) => {});
    render(<DobInput placeholder="Birthday" value="" onValueChange={onValueChange} />);
    const input = screen.getByPlaceholderText("Birthday") as HTMLInputElement;

    input.value = "01 / 02 / 1990";
    fireEvent.input(input);

    expect(onValueChange).toHaveBeenCalled();
    expect(typeof onValueChange.mock.calls[0]?.[0]).toBe("string");
  });

  test("forwards label and error to the underlying input", () => {
    render(<DobInput placeholder="Birthday" label="Born on" error="Invalid date" />);
    expect(screen.getByText("Born on")).toBeDefined();
    expect(screen.getByText("Invalid date")).toBeDefined();
    const input = screen.getByPlaceholderText("Birthday") as HTMLInputElement;
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  test("disables the underlying input", () => {
    render(<DobInput placeholder="Birthday" disabled />);
    const input = screen.getByPlaceholderText("Birthday") as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });
});
