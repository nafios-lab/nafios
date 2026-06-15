import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MaskInput } from "../../src/components/ui/masked-input.tsx";

afterEach(cleanup);

const SG_MOBILE_MASK = "(+65) 9999 9999";

describe("MaskInput", () => {
  test("renders a controlled input with the given value", () => {
    render(<MaskInput mask={SG_MOBILE_MASK} value="(+65) 9123 4567" placeholder="Mobile" />);
    const input = screen.getByPlaceholderText("Mobile") as HTMLInputElement;
    expect(input.value).toBe("(+65) 9123 4567");
  });

  test("does not warn that a controlled value is read-only", () => {
    // The no-op onChange exists precisely to silence React's
    // "value without onChange = read-only field" warning. Assert it stays quiet.
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    try {
      render(<MaskInput mask={SG_MOBILE_MASK} value="" placeholder="Mobile" />);
      const offending = errorSpy.mock.calls.some((args) =>
        args.some((a) => typeof a === "string" && /without an `onChange`|read-only/i.test(a)),
      );
      expect(offending).toBe(false);
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("fires onValueChange via the capture-phase input listener", () => {
    const onValueChange = mock((_: string) => {});
    render(
      <MaskInput
        mask={SG_MOBILE_MASK}
        value=""
        placeholder="Mobile"
        onValueChange={onValueChange}
      />,
    );
    const input = screen.getByPlaceholderText("Mobile") as HTMLInputElement;

    input.value = "(+65) 9123 4567";
    fireEvent.input(input);

    expect(onValueChange).toHaveBeenCalled();
    expect(typeof onValueChange.mock.calls[0]?.[0]).toBe("string");
  });

  test("works without an onValueChange handler", () => {
    render(<MaskInput mask={SG_MOBILE_MASK} value="" placeholder="Mobile" />);
    const input = screen.getByPlaceholderText("Mobile") as HTMLInputElement;
    // Should not throw when no handler is wired up.
    expect(() => fireEvent.input(input)).not.toThrow();
  });
});
