import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  type ColumnDef,
  DataTable,
  SortableHeader,
} from "../../src/components/data-table.tsx";

afterEach(cleanup);

interface Person {
  id: number;
  name: string;
  age: number;
}

const PEOPLE: Person[] = [
  { id: 1, name: "Charlie", age: 30 },
  { id: 2, name: "Alice", age: 25 },
  { id: 3, name: "Bob", age: 40 },
];

/** Basic columns: a sortable name column + a plain age column. */
function basicColumns(): ColumnDef<Person, unknown>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
      cell: ({ row }) => <span>{row.getValue("name")}</span>,
    },
    {
      accessorKey: "age",
      header: "Age",
    },
  ];
}

/** Columns including a row-selection checkbox column. */
function selectableColumns(): ColumnDef<Person, unknown>[] {
  return [
    {
      id: "select",
      enableHiding: false,
      header: ({ table }) => (
        <input
          type="checkbox"
          aria-label="Select all"
          checked={table.getIsAllPageRowsSelected()}
          onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label={`Select ${row.getValue("name")}`}
          checked={row.getIsSelected()}
          onChange={(e) => row.toggleSelected(e.target.checked)}
        />
      ),
    },
    ...basicColumns(),
  ];
}

describe("DataTable", () => {
  test("renders headers and cell content", () => {
    render(<DataTable columns={basicColumns()} data={PEOPLE} />);
    expect(screen.getByRole("button", { name: /Name/ })).toBeDefined();
    expect(screen.getByText("Age")).toBeDefined();
    expect(screen.getByText("Charlie")).toBeDefined();
    expect(screen.getByText("Alice")).toBeDefined();
    expect(screen.getByText("Bob")).toBeDefined();
  });

  test("renders the empty-state message when data is empty", () => {
    render(<DataTable columns={basicColumns()} data={[]} />);
    expect(screen.getByText("No results.")).toBeDefined();
  });

  test("renders a custom empty-state message", () => {
    render(<DataTable columns={basicColumns()} data={[]} emptyMessage="Nothing here." />);
    expect(screen.getByText("Nothing here.")).toBeDefined();
  });

  test("applies a custom className to the root wrapper", () => {
    const { container } = render(
      <DataTable columns={basicColumns()} data={PEOPLE} className="my-custom-table" />,
    );
    expect(container.querySelector(".my-custom-table")).not.toBeNull();
  });

  test("sorts ascending then descending when a sortable header is clicked", () => {
    render(<DataTable columns={basicColumns()} data={PEOPLE} showPagination={false} />);

    function bodyNames() {
      const rows = screen.getAllByRole("row");
      // first row is the header
      return rows.slice(1).map((r) => within(r).getByText(/Charlie|Alice|Bob/).textContent);
    }

    // Initial (unsorted) order matches input.
    expect(bodyNames()).toEqual(["Charlie", "Alice", "Bob"]);

    const nameHeader = screen.getByRole("button", { name: /Name/ });

    // First click -> ascending.
    fireEvent.click(nameHeader);
    expect(bodyNames()).toEqual(["Alice", "Bob", "Charlie"]);

    // Second click -> descending.
    fireEvent.click(nameHeader);
    expect(bodyNames()).toEqual(["Charlie", "Bob", "Alice"]);
  });

  test("paginates with next / previous / first / last controls", () => {
    const many: Person[] = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      name: `Person ${String(i + 1).padStart(2, "0")}`,
      age: 20 + i,
    }));
    render(<DataTable columns={basicColumns()} data={many} pageSize={10} />);

    expect(screen.getByText("25 row(s) total")).toBeDefined();
    expect(screen.getByText("Page 1 of 3")).toBeDefined();
    expect(screen.getByText("Person 01")).toBeDefined();
    expect(screen.queryByText("Person 11")).toBeNull();

    const next = screen.getByRole("button", { name: "Next page" });
    const prev = screen.getByRole("button", { name: "Previous page" });
    const first = screen.getByRole("button", { name: "First page" });
    const last = screen.getByRole("button", { name: "Last page" });

    // On the first page, previous/first are disabled.
    expect(prev).toHaveProperty("disabled", true);
    expect(first).toHaveProperty("disabled", true);
    expect(next).toHaveProperty("disabled", false);

    fireEvent.click(next);
    expect(screen.getByText("Page 2 of 3")).toBeDefined();
    expect(screen.getByText("Person 11")).toBeDefined();

    fireEvent.click(prev);
    expect(screen.getByText("Page 1 of 3")).toBeDefined();
    expect(screen.getByText("Person 01")).toBeDefined();

    fireEvent.click(last);
    expect(screen.getByText("Page 3 of 3")).toBeDefined();
    expect(screen.getByText("Person 25")).toBeDefined();
    // On the last page, next/last are disabled.
    expect(next).toHaveProperty("disabled", true);
    expect(last).toHaveProperty("disabled", true);

    fireEvent.click(first);
    expect(screen.getByText("Page 1 of 3")).toBeDefined();
    expect(screen.getByText("Person 01")).toBeDefined();
  });

  test("hides pagination controls when showPagination is false", () => {
    render(<DataTable columns={basicColumns()} data={PEOPLE} showPagination={false} />);
    expect(screen.queryByRole("button", { name: "Next page" })).toBeNull();
    expect(screen.queryByText(/row\(s\) total/)).toBeNull();
  });

  test("selects a single row via its checkbox and marks the row selected", () => {
    render(
      <DataTable columns={selectableColumns()} data={PEOPLE} showColumnVisibility={false} />,
    );

    const aliceCheckbox = screen.getByRole("checkbox", { name: "Select Alice" });
    expect(aliceCheckbox).toHaveProperty("checked", false);

    fireEvent.click(aliceCheckbox);
    expect(aliceCheckbox).toHaveProperty("checked", true);

    // The row carries data-state="selected".
    const selectedRow = aliceCheckbox.closest("tr");
    expect(selectedRow?.getAttribute("data-state")).toBe("selected");
  });

  test("select-all checkbox toggles every row on the page", () => {
    render(
      <DataTable columns={selectableColumns()} data={PEOPLE} showColumnVisibility={false} />,
    );

    const selectAll = screen.getByRole("checkbox", { name: "Select all" });
    fireEvent.click(selectAll);

    for (const name of ["Charlie", "Alice", "Bob"]) {
      expect(screen.getByRole("checkbox", { name: `Select ${name}` })).toHaveProperty(
        "checked",
        true,
      );
    }

    fireEvent.click(selectAll);
    for (const name of ["Charlie", "Alice", "Bob"]) {
      expect(screen.getByRole("checkbox", { name: `Select ${name}` })).toHaveProperty(
        "checked",
        false,
      );
    }
  });

  test("filters rows via the toolbar filter input", () => {
    render(
      <DataTable
        columns={basicColumns()}
        data={PEOPLE}
        filterColumn="name"
        filterPlaceholder="Search names"
        showColumnVisibility={false}
      />,
    );

    const input = screen.getByPlaceholderText("Search names") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "ali" } });

    expect(input.value).toBe("ali");
    expect(screen.getByText("Alice")).toBeDefined();
    expect(screen.queryByText("Charlie")).toBeNull();
    expect(screen.queryByText("Bob")).toBeNull();
  });

  test("filter that matches nothing shows the empty-state row", () => {
    render(
      <DataTable
        columns={basicColumns()}
        data={PEOPLE}
        filterColumn="name"
        showColumnVisibility={false}
      />,
    );

    const input = screen.getByPlaceholderText("Filter...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "zzz-no-match" } });

    expect(screen.getByText("No results.")).toBeDefined();
  });

  test("renders the column-visibility control and toggles a column off", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={basicColumns()} data={PEOPLE} />);

    // The column-visibility control is the multi-select trigger. Both hideable
    // columns start visible, so they render as selected chips (no placeholder).
    // The "Clear all selections" button is a direct child of the trigger button,
    // so the trigger is its parent element.
    const clearAll = screen.getByLabelText("Clear all selections");
    const triggerButton = clearAll.parentElement as HTMLButtonElement;
    // Clicking the trigger opens the listbox.
    await user.click(triggerButton);

    // Both hideable columns appear as options in the multi-select listbox.
    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeDefined();
    });
    const listbox = screen.getByRole("listbox");
    const ageOption = within(listbox).getByRole("option", { name: "age" });
    expect(within(listbox).getByRole("option", { name: "name" })).toBeDefined();

    // Both columns start visible (selected).
    expect(ageOption.getAttribute("aria-selected")).toBe("true");

    // Toggling "age" off hides the Age column header.
    await user.click(ageOption);
    await waitFor(() => {
      expect(screen.queryByText("Age")).toBeNull();
    });
  });

  test("hides the toolbar entirely when no filter and no column visibility", () => {
    render(
      <DataTable
        columns={basicColumns()}
        data={PEOPLE}
        showColumnVisibility={false}
      />,
    );
    expect(screen.queryByText("Columns")).toBeNull();
    expect(screen.queryByPlaceholderText("Filter...")).toBeNull();
  });

  test("merges extra tableOptions (escape hatch) without breaking render", () => {
    const onStateChange = mock(() => {});
    render(
      <DataTable
        columns={basicColumns()}
        data={PEOPLE}
        showColumnVisibility={false}
        tableOptions={{ onStateChange, enableRowSelection: true }}
      />,
    );
    expect(screen.getByText("Charlie")).toBeDefined();
  });
});

describe("SortableHeader", () => {
  test("toggles sorting state on click using the column API", () => {
    const sortStates: Array<false | "asc" | "desc"> = ["asc"];
    const column = {
      toggleSorting: mock((desc?: boolean) => {}),
      getIsSorted: () => sortStates[0],
    };
    render(<SortableHeader column={column}>Header label</SortableHeader>);

    const btn = screen.getByRole("button", { name: /Header label/ });
    fireEvent.click(btn);
    // getIsSorted() === "asc" => toggleSorting called with true (go descending).
    expect(column.toggleSorting).toHaveBeenCalledWith(true);
  });

  test("requests ascending sort when not currently sorted ascending", () => {
    const column = {
      toggleSorting: mock((desc?: boolean) => {}),
      getIsSorted: () => false as const,
    };
    render(<SortableHeader column={column}>Col</SortableHeader>);

    fireEvent.click(screen.getByRole("button", { name: /Col/ }));
    expect(column.toggleSorting).toHaveBeenCalledWith(false);
  });

  test("applies a custom className", () => {
    const column = {
      toggleSorting: mock(() => {}),
      getIsSorted: () => false as const,
    };
    render(
      <SortableHeader column={column} className="extra-class">
        Col
      </SortableHeader>,
    );
    const btn = screen.getByRole("button", { name: /Col/ });
    expect(btn.className).toContain("extra-class");
  });
});
