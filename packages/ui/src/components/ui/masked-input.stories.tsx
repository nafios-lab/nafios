import type { Meta, StoryObj } from "@storybook/react";
import { MaskInput, type MaskInputProps } from "./masked-input.tsx";

const meta: Meta<MaskInputProps> = {
  title: "Primitives/MaskInput",
  component: MaskInput,
  tags: ["autodocs"],
  argTypes: {
    mask: { control: "text" },
    placeholder: { control: "text" },
    disabled: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<MaskInputProps>;

export const Default: Story = {
  args: {
    mask: "AA99 AAA",
    placeholder: "AB12 CDE",
  },
};

export const PhoneNumber: Story = {
  args: {
    mask: "(999) 999-9999",
    placeholder: "(555) 123-4567",
  },
};

export const Date: Story = {
  args: {
    mask: "99/99/9999",
    placeholder: "DD/MM/YYYY",
  },
};

export const CreditCard: Story = {
  args: {
    mask: "9999 9999 9999 9999",
    placeholder: "0000 0000 0000 0000",
  },
};

export const PostalCode: Story = {
  args: {
    mask: "A9A 9A9",
    placeholder: "K1A 0B1",
  },
};

export const Disabled: Story = {
  args: {
    mask: "(999) 999-9999",
    placeholder: "(555) 123-4567",
    disabled: true,
  },
};

export const AllMasks: Story = {
  render: () => (
    <div className="grid gap-4 max-w-sm">
      <div className="grid gap-1">
        <label className="text-sm font-medium text-foreground">UK Plate</label>
        <MaskInput mask="AA99 AAA" placeholder="AB12 CDE" />
      </div>
      <div className="grid gap-1">
        <label className="text-sm font-medium text-foreground">Phone</label>
        <MaskInput mask="(999) 999-9999" placeholder="(555) 123-4567" />
      </div>
      <div className="grid gap-1">
        <label className="text-sm font-medium text-foreground">Date</label>
        <MaskInput mask="99/99/9999" placeholder="DD/MM/YYYY" />
      </div>
      <div className="grid gap-1">
        <label className="text-sm font-medium text-foreground">Credit Card</label>
        <MaskInput mask="9999 9999 9999 9999" placeholder="0000 0000 0000 0000" />
      </div>
    </div>
  ),
};
