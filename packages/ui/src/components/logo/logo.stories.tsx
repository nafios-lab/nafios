import type { Meta, StoryObj } from "@storybook/react";
import { Logo, type LogoProps } from "./logo.tsx";

const meta: Meta<LogoProps> = {
  title: "Logos/Logo",
  component: Logo,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "radio",
      options: ["mark", "word", "wordmark"],
    },
  },
};

export default meta;
type Story = StoryObj<LogoProps>;

export const Mark: Story = {
  args: {
    variant: "mark",
  },
};

export const Word: Story = {
  args: {
    variant: "word",
  },
};

export const Wordmark: Story = {
  args: {
    variant: "wordmark",
  },
};

export const CustomSize: Story = {
  args: {
    variant: "wordmark",
    className: "h-16",
  },
};
