import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { YearSelect, type YearSelectProps } from "./year-select.tsx";

const meta: Meta<YearSelectProps> = {
  title: "Primitives/YearSelect",
  component: YearSelect,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "brand"],
    },
    disabled: {
      control: "boolean",
    },
  },
};

export default meta;
type Story = StoryObj<YearSelectProps>;

export const Default: Story = {
  render: () => {
    const [year, setYear] = useState(new Date().getFullYear());
    return <YearSelect value={year} onChange={setYear} />;
  },
};

export const Brand: Story = {
  render: () => {
    const [year, setYear] = useState(2026);
    return <YearSelect value={year} onChange={setYear} variant="brand" />;
  },
};

export const CustomRange: Story = {
  render: () => {
    const [year, setYear] = useState(2025);
    return (
      <YearSelect value={year} onChange={setYear} min={2020} max={2030} />
    );
  },
};

export const Disabled: Story = {
  render: () => <YearSelect value={2026} disabled />,
};
