import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SaveDefaultsCheckbox } from "../../src/features/finance/components/create-ledger/save-defaults-checkbox.tsx";

afterEach(cleanup);

function checkbox(): HTMLElement {
  return screen.getByRole("checkbox");
}

describe("SaveDefaultsCheckbox", () => {
  test("renders the opt-in label, checked by default", () => {
    render(<SaveDefaultsCheckbox />);
    expect(screen.getByText("Update my saved defaults with these values")).toBeDefined();
    expect(checkbox().getAttribute("aria-checked")).toBe("true");
  });

  test("honours defaultChecked={false} for the initial uncontrolled state", () => {
    render(<SaveDefaultsCheckbox defaultChecked={false} />);
    expect(checkbox().getAttribute("aria-checked")).toBe("false");
  });

  test("toggles its own state and reports the new value when uncontrolled", () => {
    const onCheckedChange = mock((_: boolean) => {});
    render(<SaveDefaultsCheckbox onCheckedChange={onCheckedChange} />);

    fireEvent.click(checkbox());
    expect(onCheckedChange).toHaveBeenLastCalledWith(false);
    expect(checkbox().getAttribute("aria-checked")).toBe("false");

    fireEvent.click(checkbox());
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);
    expect(checkbox().getAttribute("aria-checked")).toBe("true");
  });

  test("stays controlled by the `checked` prop — it reports but doesn't self-update", () => {
    const onCheckedChange = mock((_: boolean) => {});
    render(<SaveDefaultsCheckbox checked={false} onCheckedChange={onCheckedChange} />);

    expect(checkbox().getAttribute("aria-checked")).toBe("false");
    fireEvent.click(checkbox());
    // Parent owns the value: the callback fires with the requested next state,
    // but the rendered state follows the (unchanged) prop, not internal state.
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);
    expect(checkbox().getAttribute("aria-checked")).toBe("false");
  });

  test("forwards className to the wrapper", () => {
    const { container } = render(<SaveDefaultsCheckbox className="mt-2" />);
    expect((container.firstChild as HTMLElement).className).toContain("mt-2");
  });
});
