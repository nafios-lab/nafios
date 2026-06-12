import type { Meta, StoryObj } from "@storybook/react";

const FEEDBACK_SWATCHES = [
  {
    name: "Success",
    bg: "bg-success",
    fg: "text-success-foreground",
    border: "border-success-subtle",
    description: "Confirmations, saved states, completed actions",
  },
  {
    name: "Error",
    bg: "bg-error",
    fg: "text-error-foreground",
    border: "border-error-subtle",
    description: "Failures, validation errors, destructive outcomes",
  },
  {
    name: "Warning",
    bg: "bg-warning",
    fg: "text-warning-foreground",
    border: "border-warning-subtle",
    description: "Caution states, budget limits, expiring items",
  },
  {
    name: "Info",
    bg: "bg-info",
    fg: "text-info-foreground",
    border: "border-info-subtle",
    description: "Informational hints, tips, neutral updates",
  },
  {
    name: "Note",
    bg: "bg-note",
    fg: "text-note-foreground",
    border: "border-note-subtle",
    description: "Annotations, comments, supplementary context",
  },
] as const;

function Swatch({
  name,
  bg,
  fg,
  border,
  description,
}: (typeof FEEDBACK_SWATCHES)[number]) {
  return (
    <div
      className={`${bg} ${fg} ${border} flex flex-col gap-3 rounded-lg border p-5`}
    >
      <div className="flex items-center justify-between">
        <span className="font-display text-lg font-semibold">{name}</span>
        <span className="font-mono text-xs opacity-70">{bg}</span>
      </div>
      <p className="text-sm leading-relaxed opacity-80">{description}</p>
      <div className="flex gap-2 pt-1">
        <div className="flex items-center gap-1.5 font-mono text-xs">
          <span
            className={`${bg} ${border} inline-block h-3 w-3 rounded-sm border`}
          />
          base
        </div>
        <div className="flex items-center gap-1.5 font-mono text-xs">
          <span
            className={`${border} inline-block h-3 w-3 rounded-sm border-2 bg-transparent`}
          />
          subtle
        </div>
        <div className="flex items-center gap-1.5 font-mono text-xs">
          <span className="inline-block h-3 w-3 rounded-sm bg-current" />
          foreground
        </div>
      </div>
    </div>
  );
}

const meta: Meta = {
  title: "Colors/Feedback",
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj;

export const AllSwatches: Story = {
  render: () => (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {FEEDBACK_SWATCHES.map((swatch) => (
        <Swatch key={swatch.name} {...swatch} />
      ))}
    </div>
  ),
};

export const Success: Story = {
  render: () => <Swatch {...FEEDBACK_SWATCHES[0]} />,
};

export const Error: Story = {
  render: () => <Swatch {...FEEDBACK_SWATCHES[1]} />,
};

export const Warning: Story = {
  render: () => <Swatch {...FEEDBACK_SWATCHES[2]} />,
};

export const Info: Story = {
  render: () => <Swatch {...FEEDBACK_SWATCHES[3]} />,
};

export const Note: Story = {
  render: () => <Swatch {...FEEDBACK_SWATCHES[4]} />,
};
