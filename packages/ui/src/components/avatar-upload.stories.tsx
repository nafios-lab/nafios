import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { useState } from "react";
import { AvatarUpload } from "./avatar-upload.tsx";

/** A self-contained sample image so the filled state needs no network. */
const SAMPLE_AVATAR =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='256'%20height='256'%3E%3Crect%20width='256'%20height='256'%20fill='%234f46e5'/%3E%3Ccircle%20cx='128'%20cy='100'%20r='48'%20fill='%23fff'/%3E%3Crect%20x='56'%20y='168'%20width='144'%20height='96'%20rx='48'%20fill='%23fff'/%3E%3C/svg%3E";

const meta = {
  title: "Composites/AvatarUpload",
  component: AvatarUpload,
  tags: ["autodocs"],
  argTypes: {
    label: { control: "text" },
    helperText: { control: "text" },
    fallback: { control: "text" },
    optional: { control: "boolean" },
    disabled: { control: "boolean" },
    size: { control: "select", options: ["sm", "default", "lg", "xl"] },
  },
  args: {
    onChange: fn(),
  },
} satisfies Meta<typeof AvatarUpload>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty state — pick a file to see auto crop + downscale in action. */
export const Default: Story = {
  render: (args) => {
    const [value, setValue] = useState<string | undefined>(undefined);
    return (
      <AvatarUpload
        {...args}
        value={value}
        onChange={(v) => {
          setValue(v);
          args.onChange?.(v);
        }}
      />
    );
  },
  args: {
    fallback: "HY",
    optional: true,
  },
};

export const Empty: Story = {
  args: {
    fallback: "HY",
  },
};

export const Filled: Story = {
  args: {
    value: SAMPLE_AVATAR,
    fallback: "HY",
  },
};

export const Optional: Story = {
  args: {
    fallback: "HY",
    optional: true,
  },
};

export const Disabled: Story = {
  args: {
    value: SAMPLE_AVATAR,
    fallback: "HY",
    disabled: true,
  },
};

export const ExtraLarge: Story = {
  args: {
    value: SAMPLE_AVATAR,
    fallback: "HY",
    size: "xl",
    label: "Profile photo",
    helperText: "Shown across NafiOS.",
  },
};
