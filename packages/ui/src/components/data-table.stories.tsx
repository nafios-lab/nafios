import type { ColumnDef } from "@tanstack/react-table";
import type { Meta, StoryObj } from "@storybook/react";
import { DataTable, SortableHeader } from "./data-table.tsx";

/* ------------------------------------------------------------------ */
/*  Sample data                                                        */
/* ------------------------------------------------------------------ */

interface Payment {
  id: string;
  amount: number;
  status: "pending" | "processing" | "success" | "failed";
  email: string;
}

const payments: Payment[] = [
  { id: "pay_001", amount: 316, status: "success", email: "alice@example.com" },
  { id: "pay_002", amount: 242, status: "success", email: "bob@example.com" },
  { id: "pay_003", amount: 837, status: "processing", email: "charlie@example.com" },
  { id: "pay_004", amount: 874, status: "success", email: "diana@example.com" },
  { id: "pay_005", amount: 721, status: "failed", email: "eve@example.com" },
  { id: "pay_006", amount: 150, status: "pending", email: "frank@example.com" },
  { id: "pay_007", amount: 490, status: "success", email: "grace@example.com" },
  { id: "pay_008", amount: 203, status: "processing", email: "heidi@example.com" },
  { id: "pay_009", amount: 612, status: "success", email: "ivan@example.com" },
  { id: "pay_010", amount: 385, status: "pending", email: "judy@example.com" },
  { id: "pay_011", amount: 920, status: "success", email: "karl@example.com" },
  { id: "pay_012", amount: 175, status: "failed", email: "lara@example.com" },
  { id: "pay_013", amount: 445, status: "success", email: "mike@example.com" },
  { id: "pay_014", amount: 300, status: "processing", email: "nina@example.com" },
  { id: "pay_015", amount: 560, status: "pending", email: "oscar@example.com" },
];

const statusColors: Record<Payment["status"], string> = {
  pending: "text-status-pending",
  processing: "text-accent",
  success: "text-status-paid",
  failed: "text-destructive",
};

const columns: ColumnDef<Payment, unknown>[] = [
  {
    accessorKey: "id",
    header: "ID",
    cell: ({ row }) => <span className="font-mono text-xs">{row.getValue("id")}</span>,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as Payment["status"];
      return <span className={`capitalize font-medium ${statusColors[status]}`}>{status}</span>;
    },
  },
  {
    accessorKey: "email",
    header: ({ column }) => <SortableHeader column={column}>Email</SortableHeader>,
  },
  {
    accessorKey: "amount",
    header: ({ column }) => (
      <SortableHeader column={column} className="justify-end">
        Amount
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const amount = Number.parseFloat(row.getValue("amount"));
      const formatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(amount);
      return <div className="text-right font-medium">{formatted}</div>;
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Stories                                                             */
/* ------------------------------------------------------------------ */

const meta: Meta<typeof DataTable> = {
  title: "Composites/DataTable",
  component: DataTable,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof DataTable>;

export const Default: Story = {
  render: () => (
    <DataTable
      columns={columns}
      data={payments}
      filterColumn="email"
      filterPlaceholder="Filter emails..."
    />
  ),
};

export const WithoutFilter: Story = {
  render: () => <DataTable columns={columns} data={payments} />,
};

export const WithoutPagination: Story = {
  render: () => (
    <DataTable
      columns={columns}
      data={payments.slice(0, 5)}
      filterColumn="email"
      showPagination={false}
    />
  ),
};

export const WithoutColumnVisibility: Story = {
  render: () => (
    <DataTable
      columns={columns}
      data={payments}
      filterColumn="email"
      showColumnVisibility={false}
    />
  ),
};

export const CustomPageSize: Story = {
  render: () => (
    <DataTable
      columns={columns}
      data={payments}
      filterColumn="email"
      filterPlaceholder="Filter emails..."
      pageSize={5}
    />
  ),
};

export const Empty: Story = {
  render: () => <DataTable columns={columns} data={[]} filterColumn="email" />,
};

export const Minimal: Story = {
  render: () => (
    <DataTable
      columns={columns}
      data={payments.slice(0, 3)}
      showColumnVisibility={false}
      showPagination={false}
    />
  ),
};

/* ------------------------------------------------------------------ */
/*  Wide table — horizontal scroll                                     */
/* ------------------------------------------------------------------ */

interface Transaction {
  id: string;
  date: string;
  description: string;
  category: string;
  merchant: string;
  account: string;
  reference: string;
  method: string;
  currency: string;
  amount: number;
  balance: number;
  status: "cleared" | "pending" | "reconciled";
  notes: string;
}

const transactions: Transaction[] = Array.from({ length: 12 }, (_, i) => ({
  id: `TXN-${String(i + 1).padStart(4, "0")}`,
  date: `2026-0${(i % 3) + 1}-${String(10 + i).padStart(2, "0")}`,
  description: [
    "Monthly subscription renewal",
    "Office supplies purchase order",
    "Client invoice payment received",
    "Cloud hosting infrastructure",
    "Team lunch expense reimbursement",
    "Software license annual renewal",
  ][i % 6],
  category: ["Software", "Office", "Revenue", "Infrastructure", "Meals", "Software"][i % 6],
  merchant: ["Acme Corp", "OfficeMax", "Client Co", "AWS", "Restaurant", "Adobe"][i % 6],
  account: ["Operating", "Petty Cash", "Receivables", "Operating", "Expenses", "Operating"][i % 6],
  reference: `REF-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
  method: ["Card", "Transfer", "Invoice", "Card", "Card", "Card"][i % 6],
  currency: "USD",
  amount: [29.99, 142.5, 3500, 89.0, 67.8, 599.0][i % 6],
  balance: 12450.0 - i * 120,
  status: (["cleared", "pending", "reconciled"] as const)[i % 3],
  notes: i % 3 === 0 ? "Auto-renewed" : "",
}));

const wideColumns: ColumnDef<Transaction, unknown>[] = [
  { accessorKey: "id", header: "ID", size: 120 },
  { accessorKey: "date", header: "Date", size: 120 },
  {
    accessorKey: "description",
    header: ({ column }) => <SortableHeader column={column}>Description</SortableHeader>,
    size: 280,
  },
  { accessorKey: "category", header: "Category", size: 120 },
  { accessorKey: "merchant", header: "Merchant", size: 140 },
  { accessorKey: "account", header: "Account", size: 130 },
  { accessorKey: "reference", header: "Reference", size: 150 },
  { accessorKey: "method", header: "Method", size: 100 },
  { accessorKey: "currency", header: "Ccy", size: 60 },
  {
    accessorKey: "amount",
    header: ({ column }) => (
      <SortableHeader column={column} className="justify-end">
        Amount
      </SortableHeader>
    ),
    cell: ({ row }) => (
      <div className="text-right font-medium tabular-nums">
        ${Number(row.getValue("amount")).toFixed(2)}
      </div>
    ),
    size: 120,
  },
  {
    accessorKey: "balance",
    header: "Balance",
    cell: ({ row }) => (
      <div className="text-right tabular-nums">${Number(row.getValue("balance")).toFixed(2)}</div>
    ),
    size: 120,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const s = row.getValue("status") as Transaction["status"];
      const color = {
        cleared: "text-status-paid",
        pending: "text-status-pending",
        reconciled: "text-accent",
      }[s];
      return <span className={`capitalize font-medium ${color}`}>{s}</span>;
    },
    size: 110,
  },
  { accessorKey: "notes", header: "Notes", size: 160 },
];

export const HorizontalScroll: Story = {
  render: () => (
    <div className="max-w-3xl">
      <DataTable
        columns={wideColumns}
        data={transactions}
        filterColumn="description"
        filterPlaceholder="Filter transactions..."
        pageSize={8}
      />
    </div>
  ),
};
