import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CredentialInput } from "../../src/components/credential-input.tsx";

afterEach(cleanup);

function toggleButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /credential/i }) as HTMLButtonElement;
}

describe("CredentialInput", () => {
  test("masks the value by default (uncontrolled)", () => {
    render(<CredentialInput placeholder="Password" />);
    const input = screen.getByPlaceholderText("Password") as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(toggleButton().getAttribute("aria-label")).toBe("Show credential");
  });

  test("toggles visibility in uncontrolled mode", () => {
    render(<CredentialInput placeholder="Password" />);
    const input = screen.getByPlaceholderText("Password") as HTMLInputElement;

    fireEvent.click(toggleButton());
    expect(input.type).toBe("text");
    expect(toggleButton().getAttribute("aria-label")).toBe("Hide credential");

    fireEvent.click(toggleButton());
    expect(input.type).toBe("password");
    expect(toggleButton().getAttribute("aria-label")).toBe("Show credential");
  });

  test("respects the visible prop in controlled mode and does not flip internally", () => {
    const onVisibilityChange = mock((_: boolean) => {});
    render(
      <CredentialInput
        placeholder="Password"
        visible={false}
        onVisibilityChange={onVisibilityChange}
      />,
    );
    const input = screen.getByPlaceholderText("Password") as HTMLInputElement;
    expect(input.type).toBe("password");

    fireEvent.click(toggleButton());
    // Controlled: the callback fires with the requested next state, but the
    // component's own type stays put until the parent updates `visible`.
    expect(onVisibilityChange).toHaveBeenCalledWith(true);
    expect(input.type).toBe("password");
  });

  test("renders as text and offers Hide when controlled-visible", () => {
    const onVisibilityChange = mock((_: boolean) => {});
    render(
      <CredentialInput
        placeholder="Password"
        visible={true}
        onVisibilityChange={onVisibilityChange}
      />,
    );
    const input = screen.getByPlaceholderText("Password") as HTMLInputElement;
    expect(input.type).toBe("text");
    expect(toggleButton().getAttribute("aria-label")).toBe("Hide credential");

    fireEvent.click(toggleButton());
    expect(onVisibilityChange).toHaveBeenCalledWith(false);
  });

  test("does not throw when controlled without an onVisibilityChange handler", () => {
    render(<CredentialInput placeholder="Password" visible={false} />);
    expect(() => fireEvent.click(toggleButton())).not.toThrow();
  });

  test("forwards label, helperText, and value to the underlying TextInput", () => {
    render(
      <CredentialInput
        label="Secret"
        helperText="Keep it safe"
        defaultValue="hunter2"
        placeholder="Password"
      />,
    );
    expect(screen.getByText("Secret")).toBeDefined();
    expect(screen.getByText("Keep it safe")).toBeDefined();
    const input = screen.getByPlaceholderText("Password") as HTMLInputElement;
    expect(input.value).toBe("hunter2");
  });

  test("renders an error message and marks the input invalid", () => {
    render(<CredentialInput placeholder="Password" error="Too weak" />);
    expect(screen.getByText("Too weak")).toBeDefined();
    const input = screen.getByPlaceholderText("Password") as HTMLInputElement;
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  test("disables the underlying input", () => {
    render(<CredentialInput placeholder="Password" disabled />);
    const input = screen.getByPlaceholderText("Password") as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  test("applies a custom className to the input", () => {
    render(<CredentialInput placeholder="Password" className="custom-cred" />);
    const input = screen.getByPlaceholderText("Password") as HTMLInputElement;
    expect(input.className).toContain("custom-cred");
  });
});
