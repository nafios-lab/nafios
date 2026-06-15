import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { DobInput } from "./dob-input.tsx";

const meta = {
  title: "Composites/DobInput",
  component: DobInput,
  tags: ["autodocs"],
  argTypes: {
    label: { control: "text" },
    helperText: { control: "text" },
    error: { control: "text" },
    placeholder: { control: "text" },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof DobInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    placeholder: "DD / MM / YYYY",
    onValueChange: fn(),
  },
};

export const WithLabel: Story = {
  args: {
    label: "Date of birth",
    placeholder: "DD / MM / YYYY",
    onValueChange: fn(),
  },
};

export const WithHelperText: Story = {
  args: {
    label: "Date of birth",
    helperText: "Optional — used for age-based features",
    onValueChange: fn(),
  },
};

export const WithError: Story = {
  args: {
    label: "Date of birth",
    error: "Please enter a valid date",
    onValueChange: fn(),
  },
};

export const Disabled: Story = {
  args: {
    label: "Date of birth",
    placeholder: "DD / MM / YYYY",
    disabled: true,
  },
};
