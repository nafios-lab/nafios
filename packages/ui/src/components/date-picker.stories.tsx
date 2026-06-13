import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { DatePicker, type DatePickerProps } from "./date-picker.tsx";

const meta: Meta<DatePickerProps> = {
  title: "Composites/DatePicker",
  component: DatePicker,
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
  },
};

export default meta;
type Story = StoryObj<DatePickerProps>;

export const Default: Story = {
  render: () => {
    const [date, setDate] = useState<Date | undefined>();
    return <DatePicker value={date} onChange={setDate} />;
  },
};

export const WithValue: Story = {
  render: () => {
    const [date, setDate] = useState<Date | undefined>(new Date());
    return <DatePicker value={date} onChange={setDate} />;
  },
};

export const WithLabel: Story = {
  render: () => {
    const [date, setDate] = useState<Date | undefined>();
    return (
      <DatePicker
        value={date}
        onChange={setDate}
        label="Date of birth"
        placeholder="Select your birth date"
      />
    );
  },
};

export const CustomFormat: Story = {
  render: () => {
    const [date, setDate] = useState<Date | undefined>(new Date());
    return <DatePicker value={date} onChange={setDate} dateFormat="dd/MM/yyyy" />;
  },
};

export const DisabledWeekends: Story = {
  render: () => {
    const [date, setDate] = useState<Date | undefined>();
    return (
      <DatePicker
        value={date}
        onChange={setDate}
        label="Appointment"
        calendarProps={{
          disabled: [{ dayOfWeek: [0, 6] }],
        }}
      />
    );
  },
};

export const Disabled: Story = {
  render: () => <DatePicker value={new Date()} disabled />,
};

export const FormLayout: Story = {
  render: () => {
    const [start, setStart] = useState<Date | undefined>();
    const [end, setEnd] = useState<Date | undefined>();
    return (
      <div className="grid gap-4 max-w-xs">
        <DatePicker value={start} onChange={setStart} label="Start date" />
        <DatePicker value={end} onChange={setEnd} label="End date" />
      </div>
    );
  },
};
