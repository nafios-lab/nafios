import type { Meta, StoryObj } from "@storybook/react";
import { Text } from "./text.tsx";

const meta: Meta<typeof Text> = {
  title: "Typography/Text",
  component: Text,
  tags: ["autodocs"],
  argTypes: {
    as: {
      control: "select",
      options: ["p", "span", "div"],
    },
    variant: {
      control: "select",
      options: ["default", "caption", "overline", "label"],
    },
    size: {
      control: "select",
      options: ["2xl", "xl", "lg", "md", "sm", "xs"],
    },
    weight: {
      control: "select",
      options: ["normal", "medium", "semibold", "bold"],
    },
    muted: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof Text>;

export const Default: Story = {
  args: { children: "The quick brown fox jumps over the lazy dog." },
};

export const AllSizes: Story = {
  render: () => (
    <div className="space-y-3">
      <Text size="2xl">2xl -- The quick brown fox</Text>
      <Text size="xl">xl -- The quick brown fox</Text>
      <Text size="lg">lg -- The quick brown fox</Text>
      <Text size="md">md -- The quick brown fox</Text>
      <Text size="sm">sm -- The quick brown fox</Text>
      <Text size="xs">xs -- The quick brown fox</Text>
    </div>
  ),
};

export const Weights: Story = {
  render: () => (
    <div className="space-y-2">
      <Text weight="normal">Normal weight</Text>
      <Text weight="medium">Medium weight</Text>
      <Text weight="semibold">Semibold weight</Text>
      <Text weight="bold">Bold weight</Text>
    </div>
  ),
};

export const Muted: Story = {
  args: {
    children: "This is muted helper text.",
    size: "sm",
    muted: true,
  },
};

export const Caption: Story = {
  render: () => (
    <div className="space-y-6">
      <div>
        <Text variant="caption">Account summary</Text>
        <p className="text-lg font-semibold">$12,340.56</p>
      </div>
      <div>
        <Text variant="caption">Status</Text>
        <p className="text-lg font-semibold">Active</p>
      </div>
      <div>
        <Text variant="caption" size="sm">Caption at sm size</Text>
      </div>
    </div>
  ),
};

export const Overline: Story = {
  render: () => (
    <div className="space-y-6">
      <div>
        <Text variant="overline">Section title</Text>
        <p className="text-md">Content underneath the overline heading.</p>
      </div>
      <div>
        <Text variant="overline">Category</Text>
        <p className="text-md">Another section with overline treatment.</p>
      </div>
    </div>
  ),
};

export const LabelVariant: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="space-y-1">
        <Text variant="label">Email address</Text>
        <div className="h-9 rounded-full border border-input bg-card px-3" />
      </div>
      <div className="space-y-1">
        <Text variant="label">Password</Text>
        <div className="h-9 rounded-full border border-input bg-card px-3" />
      </div>
    </div>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div className="space-y-4 max-w-md">
      <Text>Default body text at md size.</Text>
      <Text variant="caption">Caption -- uppercase widest tracking</Text>
      <Text variant="overline">Overline -- uppercase wider tracking</Text>
      <Text variant="label">Label -- medium weight, no line-height</Text>
      <Text muted size="sm">Muted small helper text.</Text>
    </div>
  ),
};

export const AsSpan: Story = {
  render: () => (
    <p>
      Inline{" "}
      <Text as="span" weight="bold" size="sm">
        bold span
      </Text>{" "}
      within a paragraph.
    </p>
  ),
};
