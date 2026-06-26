import type { Meta, StoryObj } from "@storybook/react";
import { LayoutGrid } from "lucide-react";
import {
  BudgetingLogo,
  CalendarLogo,
  DocLogo,
  FinanceLogo,
  NotebookLogo,
  RadioLogo,
  StorageLogo,
} from "./logo/index.ts";
import { ProductSwitcher, type ProductSwitcherProps } from "./product-switcher.tsx";
import { Button } from "./ui/button.tsx";

const products: ProductSwitcherProps["items"] = [
  { id: "finance", label: "Finance", icon: FinanceLogo },
  { id: "calendar", label: "Calendar", icon: CalendarLogo },
  { id: "doc", label: "Doc", icon: DocLogo },
  { id: "storage", label: "Storage", icon: StorageLogo },
  { id: "budgeting", label: "Budgeting", icon: BudgetingLogo },
  { id: "notebook", label: "Notebook", icon: NotebookLogo },
  { id: "radio", label: "Radio", icon: RadioLogo },
];

type StoryArgs = ProductSwitcherProps;

const meta: Meta<StoryArgs> = {
  title: "Composites/ProductSwitcher",
  component: ProductSwitcher,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {
  args: {
    items: products,
    renderTrigger: ({ open }) => (
      <Button variant={open ? "outline" : "ghost"} size="icon">
        <LayoutGrid />
      </Button>
    ),
  },
};

export const WithActiveProduct: Story = {
  args: {
    items: products.map((p) => ({
      ...p,
      active: p.id === "finance",
    })),
    renderTrigger: ({ open }) => (
      <Button variant={open ? "outline" : "ghost"} size="icon">
        <LayoutGrid />
      </Button>
    ),
  },
};

export const WithLinks: Story = {
  args: {
    items: products.map((p) => ({ ...p, href: `/${p.id}` })),
    renderTrigger: ({ open }) => (
      <Button variant={open ? "outline" : "ghost"} size="icon">
        <LayoutGrid />
      </Button>
    ),
  },
};

export const CustomTrigger: Story = {
  args: {
    items: products,
    renderTrigger: ({ open }) => (
      <button
        type="button"
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${open ? "border-brand bg-brand/10" : "border-input hover:bg-muted"}`}
      >
        <LayoutGrid className="size-4" />
        Apps
      </button>
    ),
  },
};
