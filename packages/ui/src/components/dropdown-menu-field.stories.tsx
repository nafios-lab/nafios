import type { Meta, StoryObj } from "@storybook/react";
import {
  Cloud,
  CreditCard,
  LogOut,
  Settings,
  Trash2,
  User,
} from "lucide-react";
import { Button } from "./ui/button.tsx";
import {
  DropdownMenuField,
  type DropdownMenuFieldProps,
} from "./dropdown-menu-field.tsx";

type StoryArgs = DropdownMenuFieldProps;

const meta: Meta<StoryArgs> = {
  title: "Composites/DropdownMenuField",
  component: DropdownMenuField,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {
  args: {
    trigger: <Button variant="outline">Open Menu</Button>,
    items: [
      { type: "label", label: "My Account" },
      { type: "separator" },
      {
        type: "group",
        items: [
          { label: "Profile", icon: User, shortcut: "⇧⌘P" },
          { label: "Billing", icon: CreditCard, shortcut: "⌘B" },
          { label: "Settings", icon: Settings, shortcut: "⌘S" },
        ],
      },
      { type: "separator" },
      { label: "API", icon: Cloud },
      { type: "separator" },
      { label: "Log out", icon: LogOut, shortcut: "⇧⌘Q" },
    ],
  },
};

export const Simple: Story = {
  args: {
    trigger: (
      <Button variant="ghost" size="icon">
        <Settings />
      </Button>
    ),
    items: [
      { label: "New file" },
      { label: "Open" },
      { label: "Save" },
      { type: "separator" },
      { label: "Export" },
    ],
  },
};

export const WithDisabledItems: Story = {
  args: {
    trigger: <Button variant="outline">Actions</Button>,
    items: [
      { label: "Edit" },
      { label: "Duplicate" },
      { type: "separator" },
      { label: "Archive", disabled: true },
      { label: "Delete", disabled: true },
    ],
  },
};

export const WithDestructiveItem: Story = {
  args: {
    trigger: <Button variant="outline">More</Button>,
    items: [
      { label: "Edit" },
      { label: "Duplicate" },
      { type: "separator" },
      { label: "Delete", icon: Trash2, destructive: true },
    ],
  },
};

export const WithGroups: Story = {
  args: {
    trigger: <Button variant="outline">Settings</Button>,
    items: [
      {
        type: "group",
        label: "Account",
        items: [
          { label: "Profile", icon: User },
          { label: "Billing", icon: CreditCard },
        ],
      },
      { type: "separator" },
      {
        type: "group",
        label: "Danger Zone",
        items: [
          { label: "Delete account", icon: Trash2, destructive: true },
        ],
      },
    ],
  },
};
