import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Autocomplete, type AutocompleteProps } from "./autocomplete.tsx";

const countryOptions = [
  { value: "au", label: "Australia" },
  { value: "br", label: "Brazil" },
  { value: "ca", label: "Canada" },
  { value: "de", label: "Germany" },
  { value: "fr", label: "France" },
  { value: "gb", label: "United Kingdom" },
  { value: "in", label: "India" },
  { value: "jp", label: "Japan" },
  { value: "kr", label: "South Korea" },
  { value: "my", label: "Malaysia" },
  { value: "ng", label: "Nigeria" },
  { value: "sg", label: "Singapore" },
  { value: "us", label: "United States" },
];

const meta: Meta<AutocompleteProps> = {
  title: "Composites/Autocomplete",
  component: Autocomplete,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "error"],
    },
    label: { control: "text" },
    helperText: { control: "text" },
    error: { control: "text" },
    placeholder: { control: "text" },
    disabled: { control: "boolean" },
    emptyMessage: { control: "text" },
  },
  args: {
    options: countryOptions,
  },
};

export default meta;
type Story = StoryObj<AutocompleteProps>;

export const Default: Story = {
  args: { placeholder: "Search countries..." },
};

export const WithLabel: Story = {
  args: { label: "Country", placeholder: "Search countries..." },
};

export const WithHelperText: Story = {
  args: {
    label: "Country",
    placeholder: "Search countries...",
    helperText: "Start typing to filter the list.",
  },
};

export const WithError: Story = {
  args: {
    label: "Country",
    placeholder: "Search countries...",
    error: "Please select a country.",
  },
};

export const Disabled: Story = {
  args: {
    label: "Country",
    placeholder: "Search countries...",
    disabled: true,
  },
};

export const Controlled: Story = {
  render: (args) => {
    const [value, setValue] = useState("sg");
    return (
      <Autocomplete
        {...args}
        value={value}
        onValueChange={setValue}
        label="Country"
        placeholder="Search countries..."
      />
    );
  },
};

export const CustomEmptyMessage: Story = {
  args: {
    label: "Country",
    placeholder: "Search countries...",
    emptyMessage: "No countries match your search.",
  },
};
