import type { Meta, StoryObj } from "@storybook/react";
import { BlobBackground } from "./blob-background.tsx";

const meta: Meta<typeof BlobBackground> = {
  title: "Primitives/BlobBackground",
  component: BlobBackground,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof BlobBackground>;

export const Default: Story = {
  render: () => (
    <BlobBackground className="w-full h-75 items-center justify-center rounded-xl">
      <p className="text-2xl font-display font-semibold text-foreground">NafiOS</p>
    </BlobBackground>
  ),
};

export const Subtle: Story = {
  render: () => (
    <BlobBackground
      intensity="subtle"
      className="flex h-250 items-center justify-center rounded-xl"
    >
      <p className="text-lg text-foreground/80">Subtle intensity</p>
    </BlobBackground>
  ),
};

export const Vivid: Story = {
  render: () => (
    <BlobBackground intensity="vivid" className="flex h-250 items-center justify-center rounded-xl">
      <p className="text-lg font-display font-semibold text-foreground">Vivid intensity</p>
    </BlobBackground>
  ),
};

export const DarkCard: Story = {
  render: () => (
    <BlobBackground className="flex h-75 w-125 flex-col items-center justify-center gap-4 rounded-2xl bg-card">
      <h2 className="text-xl font-display font-bold text-foreground">Welcome back</h2>
      <p className="text-sm text-muted-foreground">Your AI workspace is ready</p>
    </BlobBackground>
  ),
};

export const FullPage: Story = {
  render: () => (
    <BlobBackground className="flex h-150 flex-col items-center justify-center gap-6">
      <h1 className="text-2xl font-display font-bold text-foreground">NafiOS</h1>
      <p className="max-w-md text-center text-muted-foreground">
        A suite of AI-native apps — Finance, Budgeting, Documents, Drive, Calendar, and more —
        connected by an AI assistant that can operate any app in the suite.
      </p>
    </BlobBackground>
  ),
};
