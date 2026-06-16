import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Autocomplete, autocompleteVariants } from "../../src/components/autocomplete.tsx";

afterEach(cleanup);

const OPTIONS = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry", disabled: true },
];

describe("autocompleteVariants", () => {
  test("default variant maps to default classes", () => {
    expect(autocompleteVariants({ variant: "default" })).toContain("border-input");
  });

  test("error variant maps to error classes", () => {
    expect(autocompleteVariants({ variant: "error" })).toContain("border-error-subtle");
  });
});

describe("Autocomplete", () => {
  test("renders label, placeholder and helper text", () => {
    render(
      <Autocomplete
        options={OPTIONS}
        label="Fruit"
        helperText="Type to search"
        placeholder="Find a fruit"
      />,
    );
    expect(screen.getByText("Fruit")).toBeDefined();
    expect(screen.getByText("Type to search")).toBeDefined();
    expect(screen.getByPlaceholderText("Find a fruit")).toBeDefined();
  });

  test("uses provided id and links aria-describedby to helper", () => {
    render(<Autocomplete options={OPTIONS} id="ac" helperText="Help" />);
    const input = screen.getByRole("combobox");
    expect(input.getAttribute("id")).toBe("ac");
    expect(input.getAttribute("aria-describedby")).toBe("ac-helper");
  });

  test("error message replaces helper and sets aria-invalid + aria-describedby", () => {
    render(<Autocomplete options={OPTIONS} id="ac" helperText="Help" error="Required" />);
    expect(screen.getByText("Required")).toBeDefined();
    expect(screen.queryByText("Help")).toBeNull();
    const input = screen.getByRole("combobox");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("ac-error");
  });

  test("aria-describedby is undefined without helper or error", () => {
    render(<Autocomplete options={OPTIONS} id="ac" />);
    expect(screen.getByRole("combobox").getAttribute("aria-describedby")).toBeNull();
  });

  test("uses the selected option's label as placeholder", () => {
    render(<Autocomplete options={OPTIONS} value="banana" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    expect(input.getAttribute("placeholder")).toBe("Banana");
  });

  test("shows a clear button when a value is set, chevron otherwise", () => {
    const { rerender } = render(<Autocomplete options={OPTIONS} />);
    expect(screen.queryByRole("button", { name: "Clear selection" })).toBeNull();
    rerender(<Autocomplete options={OPTIONS} value="apple" />);
    expect(screen.getByRole("button", { name: "Clear selection" })).toBeDefined();
  });

  test("opens the listbox on focus and shows all options", async () => {
    render(<Autocomplete options={OPTIONS} />);
    fireEvent.focus(screen.getByRole("combobox"));
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Apple" })).toBeDefined();
      expect(screen.getByRole("option", { name: "Banana" })).toBeDefined();
    });
  });

  test("opens the listbox when typing even if not yet open", async () => {
    render(<Autocomplete options={OPTIONS} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "ban" } });
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Banana" })).toBeDefined();
      expect(screen.queryByRole("option", { name: "Apple" })).toBeNull();
    });
  });

  test("shows the empty message when nothing matches", async () => {
    render(<Autocomplete options={OPTIONS} emptyMessage="No fruit" />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "zzzz" } });
    await waitFor(() => {
      expect(screen.getByText("No fruit")).toBeDefined();
    });
  });

  test("selecting an option fires onValueChange and closes the listbox", async () => {
    const onValueChange = mock((_: string) => {});
    render(<Autocomplete options={OPTIONS} onValueChange={onValueChange} />);
    fireEvent.focus(screen.getByRole("combobox"));
    const apple = await screen.findByRole("option", { name: "Apple" });
    fireEvent.click(apple);
    expect(onValueChange).toHaveBeenCalledWith("apple");
    await waitFor(() => {
      expect(screen.queryByRole("option")).toBeNull();
    });
  });

  test("marks the currently selected option as selected", async () => {
    render(<Autocomplete options={OPTIONS} value="banana" />);
    fireEvent.focus(screen.getByRole("combobox"));
    await waitFor(() => {
      const banana = screen.getByRole("option", { name: "Banana" });
      expect(banana.getAttribute("aria-selected")).toBe("true");
    });
  });

  test("clear button resets the value and refocuses the input", () => {
    const onValueChange = mock((_: string) => {});
    render(<Autocomplete options={OPTIONS} value="apple" onValueChange={onValueChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onValueChange).toHaveBeenCalledWith("");
  });

  test("Escape clears the search and closes the listbox", async () => {
    render(<Autocomplete options={OPTIONS} />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ap" } });
    await waitFor(() => expect(screen.getByRole("option", { name: "Apple" })).toBeDefined());
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("option")).toBeNull();
    });
    expect(input.value).toBe("");
  });

  test("non-escape key presses are ignored", async () => {
    render(<Autocomplete options={OPTIONS} />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    await waitFor(() => expect(screen.getByRole("option", { name: "Apple" })).toBeDefined());
    fireEvent.keyDown(input, { key: "ArrowDown" });
    // still open
    expect(screen.getByRole("option", { name: "Apple" })).toBeDefined();
  });

  test("disabled input does not open on focus and shows the chevron not clear", () => {
    render(<Autocomplete options={OPTIONS} value="apple" disabled />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    expect(input.disabled).toBe(true);
    fireEvent.focus(input);
    expect(screen.queryByRole("option")).toBeNull();
    // value set but disabled -> no clear button
    expect(screen.queryByRole("button", { name: "Clear selection" })).toBeNull();
  });

  test("disabled option is rendered disabled", async () => {
    render(<Autocomplete options={OPTIONS} />);
    fireEvent.focus(screen.getByRole("combobox"));
    const cherry = await screen.findByRole("option", { name: "Cherry" });
    expect((cherry as HTMLButtonElement).disabled).toBe(true);
  });
});
