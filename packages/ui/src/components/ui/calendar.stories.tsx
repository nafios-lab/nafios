import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Calendar } from "./calendar.tsx";

const meta: Meta<typeof Calendar> = {
  title: "Primitives/Calendar",
  component: Calendar,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Calendar>;

export const Default: Story = {
  render: () => {
    const [date, setDate] = useState<Date | undefined>(new Date());
    return (
      <Calendar mode="single" selected={date} onSelect={setDate} />
    );
  },
};

export const Range: Story = {
  render: () => {
    const [range, setRange] = useState<{
      from: Date | undefined;
      to?: Date;
    }>({
      from: new Date(),
      to: new Date(Date.now() + 7 * 86400000),
    });
    return (
      <Calendar
        mode="range"
        selected={range.from ? range : undefined}
        onSelect={(r) => setRange(r ?? { from: undefined })}
        numberOfMonths={2}
      />
    );
  },
};

export const Multiple: Story = {
  render: () => {
    const [dates, setDates] = useState<Date[]>([new Date()]);
    return (
      <Calendar mode="multiple" selected={dates} onSelect={(d) => setDates(d ?? [])} />
    );
  },
};

export const DisabledDates: Story = {
  render: () => {
    const [date, setDate] = useState<Date | undefined>();
    return (
      <Calendar
        mode="single"
        selected={date}
        onSelect={setDate}
        disabled={[
          { dayOfWeek: [0, 6] },
        ]}
      />
    );
  },
};

export const WithoutOutsideDays: Story = {
  render: () => {
    const [date, setDate] = useState<Date | undefined>(new Date());
    return (
      <Calendar
        mode="single"
        selected={date}
        onSelect={setDate}
        showOutsideDays={false}
      />
    );
  },
};
