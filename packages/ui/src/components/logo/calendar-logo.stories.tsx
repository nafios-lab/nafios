import type { Meta, StoryObj } from "@storybook/react";
import { CalendarLogo, type CalendarLogoProps } from "./calendar-logo.tsx";

const meta: Meta<CalendarLogoProps> = {
  title: "Logos/CalendarLogo",
  component: CalendarLogo,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<CalendarLogoProps>;

export const Default: Story = {};

export const Large: Story = {
  args: { className: "h-16" },
};
