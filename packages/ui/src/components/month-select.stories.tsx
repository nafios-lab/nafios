import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { MonthSelect, type MonthSelectProps } from "./month-select.tsx";

const meta: Meta<MonthSelectProps> = {
  title: "Composites/MonthSelect",
  component: MonthSelect,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "brand"],
    },
    short: {
      control: "boolean",
    },
    disabled: {
      control: "boolean",
    },
  },
};

export default meta;
type Story = StoryObj<MonthSelectProps>;

export const Default: Story = {
  render: () => {
    const [month, setMonth] = useState(new Date().getMonth());
    return <MonthSelect value={month} onChange={setMonth} />;
  },
};

export const ShortLabels: Story = {
  render: () => {
    const [month, setMonth] = useState(new Date().getMonth());
    return <MonthSelect value={month} onChange={setMonth} short />;
  },
};

export const Brand: Story = {
  render: () => {
    const [month, setMonth] = useState(5);
    return <MonthSelect value={month} onChange={setMonth} variant="brand" />;
  },
};

export const DisabledMonths: Story = {
  render: () => {
    const [month, setMonth] = useState(0);
    return (
      <MonthSelect
        value={month}
        onChange={setMonth}
        disabledMonths={[6, 7, 8]}
      />
    );
  },
};

export const Disabled: Story = {
  render: () => <MonthSelect value={3} disabled />,
};
