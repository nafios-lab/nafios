import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { DateRangePicker, type DateRangePickerProps } from "./date-range-picker.tsx";

const meta: Meta<DateRangePickerProps> = {
  title: "Composites/DateRangePicker",
  component: DateRangePicker,
  tags: ["autodocs"],
  argTypes: {
    disabled: {
      control: "boolean",
    },
    placeholder: {
      control: "text",
    },
    label: {
      control: "text",
    },
    numberOfMonths: {
      control: "number",
    },
  },
};

export default meta;
type Story = StoryObj<DateRangePickerProps>;

export const Default: Story = {
  render: () => {
    const [range, setRange] = useState<DateRange | undefined>();
    return <DateRangePicker value={range} onChange={setRange} />;
  },
};

export const WithValue: Story = {
  render: () => {
    const [range, setRange] = useState<DateRange | undefined>({
      from: new Date(),
      to: new Date(Date.now() + 7 * 86400000),
    });
    return <DateRangePicker value={range} onChange={setRange} />;
  },
};

export const WithLabel: Story = {
  render: () => {
    const [range, setRange] = useState<DateRange | undefined>();
    return (
      <DateRangePicker
        value={range}
        onChange={setRange}
        label="Trip dates"
        placeholder="When are you traveling?"
      />
    );
  },
};

export const SingleMonth: Story = {
  render: () => {
    const [range, setRange] = useState<DateRange | undefined>();
    return <DateRangePicker value={range} onChange={setRange} numberOfMonths={1} />;
  },
};

export const Disabled: Story = {
  render: () => (
    <DateRangePicker
      value={{
        from: new Date(),
        to: new Date(Date.now() + 3 * 86400000),
      }}
      disabled
    />
  ),
};
