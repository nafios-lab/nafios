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

const PRODUCT_LISTING: ProductSwitcherProps["items"] = [
  { id: "finance", label: "Finance", icon: FinanceIcon },
  { id: "calendar", label: "Calendar", icon: CalendarIcon },
  { id: "doc", label: "Document", icon: DocIcon },
  { id: "storage", label: "Storage", icon: StorageIcon },
  { id: "budgeting", label: "Budgeting", icon: BudgetingIcon },
  { id: "notebook", label: "Notebook", icon: NotebookIcon },
  { id: "radio", label: "Radio", icon: RadioIcon },
];

export function ServiceMenu() {
  return (
    <ProductSwitcher
      items={PRODUCT_LISTING}
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
