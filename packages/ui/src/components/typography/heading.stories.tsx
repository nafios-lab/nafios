import type { Meta, StoryObj } from "@storybook/react";
import { Heading } from "./heading.tsx";

const meta: Meta<typeof Heading> = {
  title: "Typography/Heading",
  component: Heading,
  tags: ["autodocs"],
  argTypes: {
    as: {
      control: "select",
      options: ["h1", "h2", "h3", "h4", "h5", "h6"],
    },
    size: {
      control: "select",
      options: ["2xl", "xl", "lg", "md", "sm", "xs"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Heading>;

export const Default: Story = {
  args: { children: "The quick brown fox" },
};

export const AllLevels: Story = {
  render: () => (
    <div className="space-y-4">
      <Heading as="h1">h1 -- The quick brown fox (2xl)</Heading>
      <Heading as="h2">h2 -- The quick brown fox (xl)</Heading>
      <Heading as="h3">h3 -- The quick brown fox (lg)</Heading>
      <Heading as="h4">h4 -- The quick brown fox (md)</Heading>
      <Heading as="h5">h5 -- The quick brown fox (sm)</Heading>
      <Heading as="h6">h6 -- The quick brown fox (xs)</Heading>
    </div>
  ),
};

export const CustomSize: Story = {
  render: () => (
    <Heading as="h3" size="2xl">
      h3 element rendered at 2xl size
    </Heading>
  ),
};
