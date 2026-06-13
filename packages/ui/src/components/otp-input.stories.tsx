import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { OtpInput } from "./otp-input.tsx";

const meta = {
  title: "Composites/OtpInput",
  component: OtpInput,
  tags: ["autodocs"],
  argTypes: {
    length: { control: "number" },
    label: { control: "text" },
    helperText: { control: "text" },
    error: { control: "text" },
    disabled: { control: "boolean" },
    groupSize: { control: "number" },
  },
} satisfies Meta<typeof OtpInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Verification Code",
    helperText: "Enter the 6-digit code sent to your email.",
    onComplete: fn(),
  },
};

export const FourDigits: Story = {
  args: {
    label: "PIN",
    length: 4,
    groupSize: 4,
    helperText: "Enter your 4-digit PIN.",
    onComplete: fn(),
  },
};

export const WithError: Story = {
  args: {
    label: "Verification Code",
    error: "Invalid code. Please try again.",
    onComplete: fn(),
  },
};

export const CustomGroupSize: Story = {
  args: {
    label: "Activation Key",
    length: 8,
    groupSize: 4,
    helperText: "Enter the 8-character activation key.",
    onComplete: fn(),
  },
};

export const NoSeparator: Story = {
  args: {
    label: "Code",
    length: 4,
    groupSize: 0,
    onComplete: fn(),
  },
};

export const Disabled: Story = {
  args: {
    label: "Verification Code",
    disabled: true,
  },
};
