import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { DateTimePicker, type DateTimePickerProps } from "./date-time-picker.tsx";

const meta: Meta<DateTimePickerProps> = {
  title: "Composites/DateTimePicker",
  component: DateTimePicker,
  tags: ["autodocs"],
  argTypes: {
    disabled: {
      control: "boolean",
    },
    use12Hour: {
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
type Story = StoryObj<DateTimePickerProps>;

export const Default: Story = {
  render: () => {
    const [date, setDate] = useState<Date | undefined>();
    return <DateTimePicker value={date} onChange={setDate} />;
  },
};

export const WithValue: Story = {
  render: () => {
    const [date, setDate] = useState<Date | undefined>(new Date());
    return <DateTimePicker value={date} onChange={setDate} />;
  },
};

export const TwentyFourHour: Story = {
  render: () => {
    const [date, setDate] = useState<Date | undefined>(new Date());
    return (
      <DateTimePicker value={date} onChange={setDate} use12Hour={false} dateFormat="PPP HH:mm" />
    );
  },
};

export const WithLabel: Story = {
  render: () => {
    const [date, setDate] = useState<Date | undefined>();
    return <DateTimePicker value={date} onChange={setDate} label="Event date & time" />;
  },
};

export const FifteenMinuteSteps: Story = {
  render: () => {
    const [date, setDate] = useState<Date | undefined>(new Date());
    return <DateTimePicker value={date} onChange={setDate} minuteStep={15} label="Meeting time" />;
  },
};

export const Disabled: Story = {
  render: () => <DateTimePicker value={new Date()} disabled />,
};
