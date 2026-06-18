import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OtpInput } from "../../src/components/otp-input.tsx";

afterEach(cleanup);

// input-otp renders a single real <input> overlaying the slot UI; driving it
// directly is how the user "types" into the OTP field.
function otpField(): HTMLInputElement {
  const input = document.querySelector("input[data-input-otp]") as HTMLInputElement | null;
  if (!input) throw new Error("OTP input not found");
  return input;
}

function slots(): NodeListOf<Element> {
  return document.querySelectorAll('[data-slot="input-otp-slot"]');
}

describe("OtpInput", () => {
  test("renders the default of six slots in two groups of three", () => {
    render(<OtpInput />);
    expect(slots().length).toBe(6);
    // Default groupSize = floor(6/2) = 3 → one separator between the two groups.
    expect(document.querySelectorAll('[data-slot="input-otp-separator"]').length).toBe(1);
  });

  test("honours a custom length", () => {
    render(<OtpInput length={4} />);
    expect(slots().length).toBe(4);
    expect(otpField().maxLength).toBe(4);
  });

  test("renders a single group with no separators when groupSize is 0", () => {
    render(<OtpInput length={6} groupSize={0} />);
    expect(slots().length).toBe(6);
    expect(document.querySelectorAll('[data-slot="input-otp-separator"]').length).toBe(0);
  });

  test("creates the expected number of separators for a custom groupSize", () => {
    // length 6, groupSize 2 → groups [0,1][2,3][4,5] → 2 separators (before groups 1 and 2).
    render(<OtpInput length={6} groupSize={2} />);
    expect(document.querySelectorAll('[data-slot="input-otp-separator"]').length).toBe(2);
  });

  test("fires onChange as characters are entered", () => {
    const onChange = mock((_: string) => {});
    render(<OtpInput onChange={onChange} />);
    const field = otpField();

    fireEvent.change(field, { target: { value: "123" } });
    expect(onChange).toHaveBeenCalledWith("123");
  });

  test("fires onComplete when every slot is filled", () => {
    const onComplete = mock((_: string) => {});
    render(<OtpInput length={6} onComplete={onComplete} />);
    const field = otpField();

    fireEvent.change(field, { target: { value: "123456" } });
    expect(onComplete).toHaveBeenCalledWith("123456");
  });

  test("rejects non-matching characters under the default digits-only pattern", () => {
    const onChange = mock((_: string) => {});
    render(<OtpInput onChange={onChange} />);
    const field = otpField();

    fireEvent.change(field, { target: { value: "abc" } });
    // Letters violate REGEXP_ONLY_DIGITS → value stays empty, onChange not called.
    expect(field.value).toBe("");
    expect(onChange).not.toHaveBeenCalled();
  });

  test("accepts letters when a custom pattern allows them", () => {
    const onChange = mock((_: string) => {});
    render(<OtpInput onChange={onChange} pattern="^[a-zA-Z0-9]*$" />);
    const field = otpField();

    fireEvent.change(field, { target: { value: "ab12" } });
    expect(onChange).toHaveBeenCalledWith("ab12");
  });

  test("reflects a controlled value into the slots", () => {
    render(<OtpInput value="42" />);
    const filled = Array.from(slots())
      .map((s) => s.textContent)
      .join("");
    expect(filled).toContain("4");
    expect(filled).toContain("2");
  });

  test("renders the label", () => {
    render(<OtpInput label="Verification code" />);
    expect(screen.getByText("Verification code")).toBeDefined();
  });

  test("renders helper text when there is no error", () => {
    render(<OtpInput helperText="Check your email" />);
    expect(screen.getByText("Check your email")).toBeDefined();
  });

  test("renders the error message instead of helper text and marks invalid", () => {
    render(<OtpInput label="Code" helperText="Check your email" error="Code is wrong" />);
    expect(screen.getByText("Code is wrong")).toBeDefined();
    // Error replaces helper text.
    expect(screen.queryByText("Check your email")).toBeNull();
    expect(otpField().getAttribute("aria-invalid")).toBe("true");
  });

  test("wires aria-describedby to the error element when in error", () => {
    render(<OtpInput error="Bad code" />);
    const describedBy = otpField().getAttribute("aria-describedby");
    expect(describedBy).toMatch(/-error$/);
  });

  test("wires aria-describedby to the helper element when only helperText is set", () => {
    render(<OtpInput helperText="Six digits" />);
    const describedBy = otpField().getAttribute("aria-describedby");
    expect(describedBy).toMatch(/-helper$/);
  });

  test("leaves aria-describedby unset when neither error nor helper is present", () => {
    render(<OtpInput />);
    expect(otpField().getAttribute("aria-describedby")).toBeNull();
  });

  test("disables the underlying input", () => {
    render(<OtpInput disabled />);
    expect(otpField().disabled).toBe(true);
  });

  test("forwards a custom className to the root wrapper", () => {
    const { container } = render(<OtpInput className="otp-root" />);
    expect(container.firstElementChild?.className).toContain("otp-root");
  });
});
