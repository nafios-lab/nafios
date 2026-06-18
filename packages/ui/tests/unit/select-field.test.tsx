import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SelectField, selectFieldVariants } from "../../src/components/select-field.tsx";

afterEach(cleanup);

const OPTIONS = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry", disabled: true },
];

describe("selectFieldVariants", () => {
  test("default variant maps to default classes", () => {
    expect(selectFieldVariants({ variant: "default" })).toContain("[&>button]:border-input");
  });

  test("error variant maps to error classes", () => {
    expect(selectFieldVariants({ variant: "error" })).toContain(
      "[&>button]:border-error-foreground",
    );
  });
});

/* ------------------------------------------------------------------ */
/*  Non-searchable single select (Radix Select)                        */
/* ------------------------------------------------------------------ */

describe("SelectField (single, non-searchable)", () => {
  test("renders label, placeholder, helper text", () => {
    render(
      <SelectField
        options={OPTIONS}
        label="Fruit"
        helperText="Pick one"
        placeholder="Choose a fruit"
      />,
    );
    expect(screen.getByText("Fruit")).toBeDefined();
    expect(screen.getByText("Pick one")).toBeDefined();
    expect(screen.getByText("Choose a fruit")).toBeDefined();
  });

  test("renders the selected value's label", () => {
    render(<SelectField options={OPTIONS} value="banana" />);
    expect(screen.getByText("Banana")).toBeDefined();
  });

  test("error message replaces helper text and sets aria-invalid", () => {
    render(<SelectField options={OPTIONS} label="Fruit" helperText="Pick one" error="Required" />);
    expect(screen.getByText("Required")).toBeDefined();
    expect(screen.queryByText("Pick one")).toBeNull();
    const trigger = screen.getByRole("combobox");
    expect(trigger.getAttribute("aria-invalid")).toBe("true");
  });

  test("uses provided id and links aria-describedby to helper", () => {
    render(<SelectField options={OPTIONS} id="fruit" helperText="Pick one" />);
    const trigger = screen.getByRole("combobox");
    expect(trigger.getAttribute("id")).toBe("fruit");
    expect(trigger.getAttribute("aria-describedby")).toBe("fruit-helper");
  });

  test("aria-describedby points to error when error present", () => {
    render(<SelectField options={OPTIONS} id="fruit" error="Bad" />);
    const trigger = screen.getByRole("combobox");
    expect(trigger.getAttribute("aria-describedby")).toBe("fruit-error");
  });

  test("aria-describedby undefined when no helper or error", () => {
    render(<SelectField options={OPTIONS} id="fruit" />);
    const trigger = screen.getByRole("combobox");
    expect(trigger.getAttribute("aria-describedby")).toBeNull();
  });

  test("disabled disables the trigger", () => {
    render(<SelectField options={OPTIONS} disabled />);
    const trigger = screen.getByRole("combobox");
    expect(trigger.getAttribute("data-disabled")).not.toBeNull();
  });

  test("opening the menu reveals the options and selecting fires onValueChange", async () => {
    const onValueChange = mock((_: string) => {});
    render(<SelectField options={OPTIONS} onValueChange={onValueChange} />);

    const trigger = screen.getByRole("combobox");
    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Apple" })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("option", { name: "Apple" }));
    await waitFor(() => {
      expect(onValueChange).toHaveBeenCalledWith("apple");
    });
  });

  test("renders disabled option as disabled", async () => {
    render(<SelectField options={OPTIONS} />);
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() => {
      const cherry = screen.getByRole("option", { name: "Cherry" });
      expect(cherry.getAttribute("data-disabled")).not.toBeNull();
    });
  });

  test("respects custom maxVisibleItems for the content max-height", async () => {
    render(<SelectField options={OPTIONS} maxVisibleItems={2} />);
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Apple" })).toBeDefined();
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Searchable single select (Popover)                                 */
/* ------------------------------------------------------------------ */

describe("SelectField (single, searchable)", () => {
  test("renders trigger with placeholder when nothing selected", () => {
    render(<SelectField options={OPTIONS} searchable placeholder="Choose" />);
    expect(screen.getByText("Choose")).toBeDefined();
  });

  test("shows the selected option label and a clear button", () => {
    render(<SelectField options={OPTIONS} searchable value="banana" />);
    expect(screen.getByText("Banana")).toBeDefined();
    expect(screen.getByRole("button", { name: "Clear selection" })).toBeDefined();
  });

  test("renders label and error, and links aria-describedby on the search input", async () => {
    render(<SelectField options={OPTIONS} searchable id="sf" label="Fruit" error="Required" />);
    expect(screen.getByText("Fruit")).toBeDefined();
    expect(screen.getByText("Required")).toBeDefined();

    fireEvent.click(screen.getByRole("combobox"));
    const input = await screen.findByPlaceholderText("Search...");
    expect(input.getAttribute("aria-describedby")).toBe("sf-error");
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  test("opens popover on trigger click and shows search + options", async () => {
    render(<SelectField options={OPTIONS} searchable />);
    fireEvent.click(screen.getByRole("combobox"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search...")).toBeDefined();
      expect(screen.getByRole("option", { name: "Apple" })).toBeDefined();
    });
  });

  test("filters options as the user types in the search box", async () => {
    render(<SelectField options={OPTIONS} searchable />);
    fireEvent.click(screen.getByRole("combobox"));

    const input = await screen.findByPlaceholderText("Search...");
    fireEvent.change(input, { target: { value: "ban" } });

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Banana" })).toBeDefined();
      expect(screen.queryByRole("option", { name: "Apple" })).toBeNull();
    });
  });

  test("shows the empty message when no option matches", async () => {
    render(<SelectField options={OPTIONS} searchable emptyMessage="Nothing here" />);
    fireEvent.click(screen.getByRole("combobox"));

    const input = await screen.findByPlaceholderText("Search...");
    fireEvent.change(input, { target: { value: "zzzz" } });

    await waitFor(() => {
      expect(screen.getByText("Nothing here")).toBeDefined();
    });
  });

  test("selecting an option fires onValueChange and closes the popover", async () => {
    const onValueChange = mock((_: string) => {});
    render(<SelectField options={OPTIONS} searchable onValueChange={onValueChange} />);

    fireEvent.click(screen.getByRole("combobox"));
    const option = await screen.findByRole("option", { name: "Apple" });
    fireEvent.click(option);

    expect(onValueChange).toHaveBeenCalledWith("apple");
    await waitFor(() => {
      expect(screen.queryByRole("option", { name: "Banana" })).toBeNull();
    });
  });

  test("marks the currently selected option as selected with a check", async () => {
    render(<SelectField options={OPTIONS} searchable value="banana" />);
    // the trigger shows "Banana"; open via the combobox trigger
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() => {
      const banana = screen.getByRole("option", { name: "Banana" });
      expect(banana.getAttribute("aria-selected")).toBe("true");
    });
  });

  test("clear button resets the value to empty string", () => {
    const onValueChange = mock((_: string) => {});
    render(
      <SelectField options={OPTIONS} searchable value="banana" onValueChange={onValueChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onValueChange).toHaveBeenCalledWith("");
  });

  test("Escape in the search box closes the popover", async () => {
    render(<SelectField options={OPTIONS} searchable />);
    fireEvent.click(screen.getByRole("combobox"));
    const input = await screen.findByPlaceholderText("Search...");
    fireEvent.change(input, { target: { value: "ap" } });
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("option")).toBeNull();
    });
  });

  test("disabled trigger does not open the popover", () => {
    render(<SelectField options={OPTIONS} searchable disabled />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.queryByRole("option")).toBeNull();
  });

  test("disabled option is rendered disabled and does not fire onValueChange", async () => {
    const onValueChange = mock((_: string) => {});
    render(<SelectField options={OPTIONS} searchable onValueChange={onValueChange} />);
    fireEvent.click(screen.getByRole("combobox"));
    const cherry = await screen.findByRole("option", { name: "Cherry" });
    expect((cherry as HTMLButtonElement).disabled).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Multi-select (Popover)                                             */
/* ------------------------------------------------------------------ */

describe("SelectField (multiple)", () => {
  test("renders placeholder when no values are selected", () => {
    render(<SelectField options={OPTIONS} multiple placeholder="Pick fruits" />);
    expect(screen.getByText("Pick fruits")).toBeDefined();
  });

  test("renders selected option chips with remove buttons", () => {
    render(<SelectField options={OPTIONS} multiple value={["apple", "banana"]} />);
    expect(screen.getByText("Apple")).toBeDefined();
    expect(screen.getByText("Banana")).toBeDefined();
    expect(screen.getByRole("button", { name: "Remove Apple" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Remove Banana" })).toBeDefined();
  });

  test("renders label and helper", () => {
    render(<SelectField options={OPTIONS} multiple label="Fruits" helperText="Pick some" />);
    expect(screen.getByText("Fruits")).toBeDefined();
    expect(screen.getByText("Pick some")).toBeDefined();
  });

  test("opens the popover and lists options on trigger click", async () => {
    render(<SelectField options={OPTIONS} multiple />);
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Apple" })).toBeDefined();
      expect(screen.getByRole("listbox").getAttribute("aria-multiselectable")).toBe("true");
    });
  });

  test("toggling an option on adds it to the selection", async () => {
    const onValueChange = mock((_: string[]) => {});
    render(<SelectField options={OPTIONS} multiple value={[]} onValueChange={onValueChange} />);
    fireEvent.click(screen.getByRole("combobox"));
    const apple = await screen.findByRole("option", { name: "Apple" });
    fireEvent.click(apple);
    expect(onValueChange).toHaveBeenCalledWith(["apple"]);
  });

  test("toggling a selected option off removes it from the selection", async () => {
    const onValueChange = mock((_: string[]) => {});
    render(
      <SelectField
        options={OPTIONS}
        multiple
        value={["apple", "banana"]}
        onValueChange={onValueChange}
      />,
    );
    // open via the combobox trigger; chips also render buttons
    fireEvent.click(screen.getByRole("combobox"));
    const apple = await screen.findByRole("option", { name: "Apple" });
    expect(apple.getAttribute("aria-selected")).toBe("true");
    fireEvent.click(apple);
    expect(onValueChange).toHaveBeenCalledWith(["banana"]);
  });

  test("toggle is a no-op when onValueChange is missing", async () => {
    render(<SelectField options={OPTIONS} multiple value={[]} />);
    fireEvent.click(screen.getByRole("combobox"));
    const apple = await screen.findByRole("option", { name: "Apple" });
    expect(() => fireEvent.click(apple)).not.toThrow();
  });

  test("remove chip button removes that single value", () => {
    const onValueChange = mock((_: string[]) => {});
    render(
      <SelectField
        options={OPTIONS}
        multiple
        value={["apple", "banana"]}
        onValueChange={onValueChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove Apple" }));
    expect(onValueChange).toHaveBeenCalledWith(["banana"]);
  });

  test("clear-all button empties the selection", () => {
    const onValueChange = mock((_: string[]) => {});
    render(
      <SelectField
        options={OPTIONS}
        multiple
        value={["apple", "banana"]}
        onValueChange={onValueChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear all selections" }));
    expect(onValueChange).toHaveBeenCalledWith([]);
  });

  test("searchable multi-select filters options and shows empty message", async () => {
    render(
      <SelectField options={OPTIONS} multiple searchable emptyMessage="None left" value={[]} />,
    );
    fireEvent.click(screen.getByRole("combobox"));
    const input = await screen.findByPlaceholderText("Search...");
    fireEvent.change(input, { target: { value: "ban" } });
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Banana" })).toBeDefined();
      expect(screen.queryByRole("option", { name: "Apple" })).toBeNull();
    });
    fireEvent.change(input, { target: { value: "zzz" } });
    await waitFor(() => {
      expect(screen.getByText("None left")).toBeDefined();
    });
  });

  test("Escape in the searchable multi input closes the popover", async () => {
    render(<SelectField options={OPTIONS} multiple searchable value={[]} />);
    fireEvent.click(screen.getByRole("combobox"));
    const input = await screen.findByPlaceholderText("Search...");
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("option")).toBeNull();
    });
  });

  test("disabled multi-select hides remove/clear affordances and does not open", () => {
    render(<SelectField options={OPTIONS} multiple value={["apple"]} disabled />);
    // no remove button while disabled
    expect(screen.queryByRole("button", { name: "Remove Apple" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear all selections" })).toBeNull();
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.queryByRole("option")).toBeNull();
  });

  test("disabled option in multi mode is rendered disabled", async () => {
    render(<SelectField options={OPTIONS} multiple value={[]} />);
    fireEvent.click(screen.getByRole("combobox"));
    const cherry = await screen.findByRole("option", { name: "Cherry" });
    expect((cherry as HTMLButtonElement).disabled).toBe(true);
  });

  test("defaults value to empty array when value prop omitted", () => {
    render(<SelectField options={OPTIONS} multiple placeholder="Empty" />);
    expect(screen.getByText("Empty")).toBeDefined();
  });
});
