import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { UserMenu } from "./user-menu.tsx";

const meta = {
  title: "Composites/UserMenu",
  component: UserMenu,
  tags: ["autodocs"],
  args: {
    onProfile: fn(),
    onSettings: fn(),
    onLogout: fn(),
  },
} satisfies Meta<typeof UserMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    user: {
      name: "Hanafi Yakub",
      email: "hanafi.yakub@fairpricegroup.sg",
      avatarUrl: "https://api.dicebear.com/9.x/initials/svg?seed=HY",
    },
  },
};

export const WithoutAvatarImage: Story = {
  args: {
    user: {
      name: "Hanafi Yakub",
      email: "hanafi.yakub@fairpricegroup.sg",
    },
  },
};

export const EmailOnly: Story = {
  args: {
    user: { email: "no.name@example.com" },
  },
};

export const NoIdentity: Story = {
  args: {
    user: {},
  },
};

export const NoCallbacks: Story = {
  args: {
    user: { name: "Read Only", email: "read.only@example.com" },
    onProfile: undefined,
    onSettings: undefined,
    onLogout: undefined,
  },
};
