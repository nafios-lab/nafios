import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { TimePicker, type TimePickerProps, type TimeValue } from "./time-picker.tsx";

const meta: Meta<TimePickerProps> = {
  title: "Primitives/TimePicker",
  component: TimePicker,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "brand"],
    },
    size: {
      control: "select",
      options: ["sm", "default", "lg"],
    },
    use12Hour: {
      control: "boolean",
    },
    disabled: {
      control: "boolean",
    },
    showIcon: {
      control: "boolean",
    },
  },
};

export default meta;
type Story = StoryObj<TimePickerProps>;

export const Default: Story = {
  render: () => {
    const [time, setTime] = useState<TimeValue>({
      hours: 10,
      minutes: 30,
      period: "AM",
    });
    return <TimePicker value={time} onChange={setTime} />;
  },
};

export const TwentyFourHour: Story = {
  render: () => {
    const [time, setTime] = useState<TimeValue>({
      hours: 14,
      minutes: 30,
    });
    return <TimePicker value={time} onChange={setTime} use12Hour={false} />;
  },
};

export const Brand: Story = {
  render: () => {
    const [time, setTime] = useState<TimeValue>({
      hours: 3,
      minutes: 45,
      period: "PM",
    });
    return <TimePicker value={time} onChange={setTime} variant="brand" />;
  },
};

export const WithLabel: Story = {
  render: () => {
    const [time, setTime] = useState<TimeValue>({
      hours: 9,
      minutes: 0,
      period: "AM",
    });
    return <TimePicker value={time} onChange={setTime} label="Start time" />;
  },
};

export const FifteenMinuteSteps: Story = {
  render: () => {
    const [time, setTime] = useState<TimeValue>({
      hours: 12,
      minutes: 0,
      period: "PM",
    });
    return <TimePicker value={time} onChange={setTime} minuteStep={15} />;
  },
};

export const Sizes: Story = {
  render: () => {
    const [time, setTime] = useState<TimeValue>({
      hours: 8,
      minutes: 15,
      period: "AM",
    });
    return (
      <div className="flex flex-col gap-4">
        <TimePicker value={time} onChange={setTime} size="sm" />
        <TimePicker value={time} onChange={setTime} size="default" />
        <TimePicker value={time} onChange={setTime} size="lg" />
      </div>
    );
  },
};

export const Disabled: Story = {
  render: () => (
    <TimePicker
      value={{ hours: 5, minutes: 30, period: "PM" }}
      disabled
    />
  ),
};
