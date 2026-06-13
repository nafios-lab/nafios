import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  type TableOptions,
  type Table as TanStackTable,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import type * as React from "react";
import { useMemo, useState } from "react";
import { cn } from "../lib/utils.ts";
import { SelectField, type SelectOption } from "./select-field.tsx";
import { Button } from "./ui/button.tsx";
import { Input } from "./ui/input.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table.tsx";

/* ------------------------------------------------------------------ */
/*  DataTable                                                          */
/* ------------------------------------------------------------------ */

export interface DataTableProps<TData, TValue> {
  /** TanStack column definitions. */
  columns: ColumnDef<TData, TValue>[];
  /** Row data. */
  data: TData[];
  /** Placeholder for the global filter input. */
  filterPlaceholder?: string;
  /**
   * Column id to use for the filter input. When set, the toolbar shows a
   * text input that filters this column. Omit to hide the filter input.
   */
  filterColumn?: string;
  /** Show the column visibility dropdown. @default true */
  showColumnVisibility?: boolean;
  /** Show pagination controls. @default true */
  showPagination?: boolean;
  /** Message shown when no rows match. @default "No results." */
  emptyMessage?: string;
  /** Additional class for the root wrapper. */
  className?: string;
  /** Override initial page size. @default 10 */
  pageSize?: number;
  /** Extra TanStack Table options merged in (escape hatch). */
  tableOptions?: Partial<Omit<TableOptions<TData>, "data" | "columns" | "getCoreRowModel">>;
}

function DataTable<TData, TValue>({
  columns,
  data,
  filterPlaceholder = "Filter...",
  filterColumn,
  showColumnVisibility = true,
  showPagination = true,
  emptyMessage = "No results.",
  className,
  pageSize = 10,
  tableOptions,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      ...tableOptions?.state,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(showPagination && {
      getPaginationRowModel: getPaginationRowModel(),
      initialState: { pagination: { pageSize } },
    }),
    ...tableOptions,
  });

  const showToolbar = filterColumn || showColumnVisibility;

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {showToolbar && (
        <DataTableToolbar
          table={table}
          filterColumn={filterColumn}
          filterPlaceholder={filterPlaceholder}
          showColumnVisibility={showColumnVisibility}
        />
      )}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {showPagination && <DataTablePagination table={table} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Toolbar                                                            */
/* ------------------------------------------------------------------ */

interface DataTableToolbarProps<TData> {
  table: TanStackTable<TData>;
  filterColumn?: string;
  filterPlaceholder: string;
  showColumnVisibility: boolean;
}

function DataTableToolbar<TData>({
  table,
  filterColumn,
  filterPlaceholder,
  showColumnVisibility,
}: DataTableToolbarProps<TData>) {
  const hideableColumns = table.getAllColumns().filter((col) => col.getCanHide());

  const columnOptions: SelectOption[] = useMemo(
    () => hideableColumns.map((col) => ({ value: col.id, label: col.id })),
    [hideableColumns],
  );

  const visibleColumnIds = hideableColumns.filter((col) => col.getIsVisible()).map((col) => col.id);

  function handleColumnVisibilityChange(next: string[]) {
    const nextSet = new Set(next);
    for (const col of hideableColumns) {
      col.toggleVisibility(nextSet.has(col.id));
    }
  }

  return (
    <div className="flex items-center gap-2">
      {filterColumn && (
        <Input
          placeholder={filterPlaceholder}
          value={(table.getColumn(filterColumn)?.getFilterValue() as string) ?? ""}
          onChange={(e) => table.getColumn(filterColumn)?.setFilterValue(e.target.value)}
          className="max-w-sm"
        />
      )}
      {showColumnVisibility && (
        <SelectField
          multiple
          searchable
          placeholder="Columns"
          options={columnOptions}
          value={visibleColumnIds}
          onValueChange={handleColumnVisibilityChange}
          className="ml-auto w-56"
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pagination                                                         */
/* ------------------------------------------------------------------ */

interface DataTablePaginationProps<TData> {
  table: TanStackTable<TData>;
}

function DataTablePagination<TData>({ table }: DataTablePaginationProps<TData>) {
  return (
    <div className="flex items-center justify-between px-2">
      <p className="text-sm text-muted-foreground">
        {table.getFilteredRowModel().rows.length} row(s) total
      </p>
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground">
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            aria-label="First page"
          >
            <ChevronsLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
            aria-label="Last page"
          >
            <ChevronsRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SortableHeader helper                                              */
/* ------------------------------------------------------------------ */

export interface SortableHeaderProps {
  column: { toggleSorting: (desc?: boolean) => void; getIsSorted: () => false | "asc" | "desc" };
  children: React.ReactNode;
  className?: string;
}

function SortableHeader({ column, children, className }: SortableHeaderProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("-ml-3 h-8", className)}
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      {children}
      <ArrowUpDown className="size-4" />
    </Button>
  );
}

export type { ColumnDef, ColumnFiltersState, SortingState, VisibilityState };
export { DataTable, SortableHeader };
