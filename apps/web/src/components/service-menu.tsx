import { ProductSwitcher, type ProductSwitcherProps } from "@nafios/ui/components/product-switcher";
import { IconButton } from "@nafios/ui/components/ui/icon-button";
import { type LinkProps, useNavigate } from "@tanstack/react-router";
import {
  Calculator as BudgetingIcon,
  Calendar1 as CalendarIcon,
  FileUser as DocIcon,
  Wallet as FinanceIcon,
  House as HomeIcon,
  LayoutGrid,
  BookCopy as NotebookIcon,
  AudioLines as RadioIcon,
  HardDrive as StorageIcon,
} from "lucide-react";
import { useState } from "react";

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

/**
 * The Home/dashboard entry, pinned above the product catalog. Not a product —
 * it's the suite's home base (`/welcome`), so it's kept out of PRODUCT_LISTING
 * and prepended at render time.
 */
const HOME_ITEM = {
  id: "home",
  label: "Home",
  description: "Your NafiOS dashboard",
  icon: HomeIcon,
} as const satisfies ProductSwitcherProps["items"][number];

/** Union of the real product ids, derived from the listing — no hand-kept string list. */
type ProductId = (typeof PRODUCT_LISTING)[number]["id"];

/** Every id the switcher can surface — the products plus the Home entry. */
type MenuId = ProductId | typeof HOME_ITEM.id;

/**
 * Menu ids with a mounted route today. Selecting one navigates there via SPA
 * nav; Home always routes to the welcome dashboard. Ids absent from this map
 * stay inert until their module mounts — so the switcher never links to a route
 * that would 404.
 */
const MENU_ROUTES: Partial<Record<MenuId, LinkProps["to"]>> = {
  home: "/welcome",
  finance: "/finance",
  calendar: "/calendar",
};

type ServiceMenuProps = {
  /** Id of the entry to highlight — a product id or the Home entry. */
  active?: MenuId;
};

export function ServiceMenu({ active }: ServiceMenuProps) {
  const navigate = useNavigate();
  // Control the popover so a selection can dismiss it: clicking a row inside a
  // Radix Popover doesn't auto-close it, so an uncontrolled menu would linger
  // open after navigating across modules.
  const [open, setOpen] = useState(false);

  // Home leads, then the product catalog. Inject an `onSelect` navigator only
  // for entries that have a route; the rest fall through as inert rows (the
  // switcher renders a plain button).
  const items = [HOME_ITEM, ...PRODUCT_LISTING].map((entry) => {
    const to = MENU_ROUTES[entry.id];
    return to
      ? {
          ...entry,
          // Keep the menu up as click feedback while the route resolves, then
          // close once navigation settles. `Promise.resolve` guards the case
          // where `navigate` returns void (e.g. under test).
          onSelect: () => {
            void Promise.resolve(navigate({ to })).finally(() => setOpen(false));
          },
        }
      : entry;
  });

  return (
    <ProductSwitcher
      items={items}
      activeItem={active}
      open={open}
      onOpenChange={setOpen}
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
