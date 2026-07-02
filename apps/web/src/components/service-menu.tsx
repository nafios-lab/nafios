import { ProductSwitcher, type ProductSwitcherProps } from "@nafios/ui/components/product-switcher";
import { IconButton } from "@nafios/ui/components/ui/icon-button";
import {
  Calculator as BudgetingIcon,
  Calendar1 as CalendarIcon,
  FileUser as DocIcon,
  Wallet as FinanceIcon,
  LayoutGrid,
  BookCopy as NotebookIcon,
  AudioLines as RadioIcon,
  HardDrive as StorageIcon,
} from "lucide-react";

const PRODUCT_LISTING = [
  {
    id: "finance",
    label: "Finance",
    description: "Track income, expenses & net worth",
    icon: FinanceIcon,
  },
  {
    id: "calendar",
    label: "Calendar",
    description: "Plan events and shared schedules",
    icon: CalendarIcon,
  },
  {
    id: "doc",
    label: "Document",
    description: "Draft, sign & store documents",
    icon: DocIcon,
  },
  {
    id: "storage",
    label: "Storage",
    description: "Cloud drive for all your files",
    icon: StorageIcon,
  },
  {
    id: "budgeting",
    label: "Budgeting",
    description: "Set budgets and watch your spending",
    icon: BudgetingIcon,
  },
  {
    id: "notebook",
    label: "Notebook",
    description: "Capture notes and quick to-dos",
    icon: NotebookIcon,
  },
  {
    id: "radio",
    label: "Radio",
    description: "Your personal mini radio station",
    icon: RadioIcon,
  },
] as const satisfies ProductSwitcherProps["items"];

/** Union of the real product ids, derived from the listing — no hand-kept string list. */
type ProductId = (typeof PRODUCT_LISTING)[number]["id"];
type ServiceMenuProps = {
  /** Id of the product to highlight — constrained to the real product ids. */
  active?: ProductId;
};

export function ServiceMenu({ active }: ServiceMenuProps) {
  return (
    <ProductSwitcher
      items={PRODUCT_LISTING}
      activeItem={active}
      renderTrigger={({ open }) => (
        <IconButton
          variant={open ? "default" : "ghost"}
          icon={<LayoutGrid />}
          aria-label="Services Menu"
        />
      )}
    />
  );
}
