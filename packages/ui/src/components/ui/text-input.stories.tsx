import type { Meta, StoryObj } from "@storybook/react";
import { Eye, Mail } from "lucide-react";
import { TextInput, type TextInputProps } from "./text-input.tsx";

type StoryArgs = Omit<TextInputProps, "iconLeft" | "iconRight"> & {
  iconLeft?: boolean;
  iconRight?: boolean;
};

const meta: Meta<StoryArgs> = {
  title: "Primitives/TextInput",
  component: TextInput,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "error"],
    },
    label: {
      control: "text",
    },
    helperText: {
      control: "text",
    },
    error: {
      control: "text",
    },
    placeholder: {
      control: "text",
    },
    disabled: {
      control: "boolean",
    },
    iconLeft: {
      control: "boolean",
    },
    iconRight: {
      control: "boolean",
    },
    borderLess: {
      control: "boolean",
    },
  },
  render: ({ iconLeft, iconRight, ...args }) => (
    <TextInput
      {...args}
      iconLeft={iconLeft ? <Mail /> : undefined}
      iconRight={iconRight ? <Eye /> : undefined}
    />
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {
  args: { placeholder: "Enter text..." },
};

export const WithLabel: Story = {
  args: { label: "Email", placeholder: "you@example.com" },
};

export const WithHelperText: Story = {
  args: {
    label: "Username",
    placeholder: "johndoe",
    helperText: "This will be your public display name.",
  },
};

export const WithError: Story = {
  args: {
    label: "Email",
    placeholder: "you@example.com",
    error: "Please enter a valid email address.",
  },
};

export const WithIconLeft: Story = {
  args: {
    label: "Search",
    placeholder: "Search...",
    iconLeft: true,
  },
};

export const WithIconRight: Story = {
  args: {
    label: "Password",
    placeholder: "Enter password",
    type: "password",
    iconRight: true,
  },
};

export const WithBothIcons: Story = {
  args: {
    label: "Email",
    placeholder: "you@example.com",
    iconLeft: true,
    iconRight: true,
  },
};

export const Disabled: Story = {
  args: {
    label: "Disabled",
    placeholder: "Cannot type here",
    disabled: true,
  },
};
