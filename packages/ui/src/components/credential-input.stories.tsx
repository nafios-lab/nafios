import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { CredentialInput } from "./credential-input.tsx";

const meta = {
  title: "Composites/CredentialInput",
  component: CredentialInput,
  tags: ["autodocs"],
  argTypes: {
    label: { control: "text" },
    helperText: { control: "text" },
    error: { control: "text" },
    placeholder: { control: "text" },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof CredentialInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Password",
    placeholder: "Enter password",
  },
};

export const WithHelperText: Story = {
  args: {
    label: "Password",
    placeholder: "Enter password",
    helperText: "Must be at least 8 characters.",
  },
};

export const WithError: Story = {
  args: {
    label: "Password",
    placeholder: "Enter password",
    error: "Password is too short.",
  },
};

export const ApiKey: Story = {
  args: {
    label: "API Key",
    placeholder: "sk-...",
    helperText: "Your secret API key.",
  },
};

export const Disabled: Story = {
  args: {
    label: "Token",
    placeholder: "••••••••",
    disabled: true,
  },
};

export const Controlled: Story = {
  args: {
    label: "Secret",
    placeholder: "Enter secret",
    visible: false,
    onVisibilityChange: fn(),
  },
};
