import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { useState } from "react";
import { Stepper } from "./stepper.tsx";

const defaultSteps = [
  { label: "Account" },
  { label: "Security" },
  { label: "Family" },
  { label: "Review" },
];

const meta = {
  title: "Primitives/Stepper",
  component: Stepper,
  tags: ["autodocs"],
  argTypes: {
    activeStep: { control: "number" },
    size: { control: "select", options: ["sm", "md", "lg"] },
  },
} satisfies Meta<typeof Stepper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Step1: Story = {
  args: {
    steps: defaultSteps,
    activeStep: 0,
    onStepClick: fn(),
  },
};

export const Step2: Story = {
  args: {
    steps: defaultSteps,
    activeStep: 1,
    onStepClick: fn(),
  },
};

export const Step3: Story = {
  args: {
    steps: defaultSteps,
    activeStep: 2,
    onStepClick: fn(),
  },
};

export const Step4: Story = {
  args: {
    steps: defaultSteps,
    activeStep: 3,
    onStepClick: fn(),
  },
};

export const Interactive: Story = {
  args: {
    steps: defaultSteps,
    activeStep: 0,
  },
  render: function InteractiveStepper(args) {
    const [active, setActive] = useState(args.activeStep);
    return <Stepper {...args} activeStep={active} onStepClick={setActive} />;
  },
};

export const ThreeSteps: Story = {
  args: {
    steps: [{ label: "Info" }, { label: "Payment" }, { label: "Confirm" }],
    activeStep: 1,
    onStepClick: fn(),
  },
};

export const FiveSteps: Story = {
  args: {
    steps: [
      { label: "Start" },
      { label: "Details" },
      { label: "Address" },
      { label: "Payment" },
      { label: "Done" },
    ],
    activeStep: 2,
    onStepClick: fn(),
  },
};

export const Small: Story = {
  args: {
    steps: defaultSteps,
    activeStep: 1,
    size: "sm",
    onStepClick: fn(),
  },
};

export const Large: Story = {
  args: {
    steps: defaultSteps,
    activeStep: 2,
    size: "lg",
    onStepClick: fn(),
  },
};
