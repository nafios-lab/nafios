import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { SelectField, type SelectFieldProps } from "./select-field.tsx";

const fruitOptions = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry" },
  { value: "grape", label: "Grape" },
  { value: "mango", label: "Mango" },
  { value: "orange", label: "Orange" },
  { value: "peach", label: "Peach" },
  { value: "strawberry", label: "Strawberry" },
];

const countryOptions = [
  { value: "au", label: "Australia" },
  { value: "br", label: "Brazil" },
  { value: "ca", label: "Canada" },
  { value: "cn", label: "China" },
  { value: "de", label: "Germany" },
  { value: "fr", label: "France" },
  { value: "gb", label: "United Kingdom" },
  { value: "id", label: "Indonesia" },
  { value: "in", label: "India" },
  { value: "jp", label: "Japan" },
  { value: "kr", label: "South Korea" },
  { value: "mx", label: "Mexico" },
  { value: "my", label: "Malaysia" },
  { value: "ng", label: "Nigeria" },
  { value: "ph", label: "Philippines" },
  { value: "sg", label: "Singapore" },
  { value: "th", label: "Thailand" },
  { value: "us", label: "United States" },
  { value: "vn", label: "Vietnam" },
  { value: "za", label: "South Africa" },
];

const meta: Meta<SelectFieldProps> = {
  title: "Composites/SelectField",
  component: SelectField,
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
    searchable: { control: "boolean" },
    multiple: { control: "boolean" },
    maxVisibleItems: { control: "number" },
    emptyMessage: { control: "text" },
  },
  args: {
    options: fruitOptions,
  },
};

export default meta;
type Story = StoryObj<SelectFieldProps>;

export const Default: Story = {
  args: { placeholder: "Pick a fruit..." },
};

export const WithLabel: Story = {
  args: { label: "Favourite Fruit", placeholder: "Pick a fruit..." },
};

export const WithHelperText: Story = {
  args: {
    label: "Favourite Fruit",
    placeholder: "Pick a fruit...",
    helperText: "Choose the fruit you like the most.",
  },
};

export const WithError: Story = {
  args: {
    label: "Favourite Fruit",
    placeholder: "Pick a fruit...",
    error: "Please select a fruit.",
  },
};

export const Disabled: Story = {
  args: {
    label: "Favourite Fruit",
    placeholder: "Pick a fruit...",
    disabled: true,
  },
};

export const WithDisabledOptions: Story = {
  args: {
    label: "Favourite Fruit",
    placeholder: "Pick a fruit...",
    options: fruitOptions.map((o) =>
      o.value === "banana" || o.value === "grape" ? { ...o, disabled: true } : o,
    ),
  },
};

export const Controlled: Story = {
  render: () => {
    const [value, setValue] = useState("cherry");
    return (
      <SelectField
        value={value}
        onValueChange={setValue}
        label="Favourite Fruit"
        placeholder="Pick a fruit..."
        options={fruitOptions}
      />
    );
  },
};

export const Searchable: Story = {
  args: {
    label: "Country",
    placeholder: "Select a country...",
    searchable: true,
    options: countryOptions,
  },
};

export const SearchableControlled: Story = {
  render: () => {
    const [value, setValue] = useState("sg");
    return (
      <SelectField
        value={value}
        onValueChange={setValue}
        label="Country"
        placeholder="Select a country..."
        searchable
        options={countryOptions}
      />
    );
  },
};

export const SearchableWithError: Story = {
  args: {
    label: "Country",
    placeholder: "Select a country...",
    searchable: true,
    options: countryOptions,
    error: "Country is required.",
  },
};

export const MaxVisibleItems: Story = {
  args: {
    label: "Country",
    placeholder: "Select a country...",
    options: countryOptions,
    maxVisibleItems: 5,
  },
};

export const SearchableMaxVisibleItems: Story = {
  args: {
    label: "Country",
    placeholder: "Select a country...",
    searchable: true,
    options: countryOptions,
    maxVisibleItems: 5,
  },
};

/* ------------------------------------------------------------------ */
/*  Multi-select stories                                               */
/* ------------------------------------------------------------------ */

export const MultiSelect: Story = {
  render: () => {
    const [value, setValue] = useState<string[]>([]);
    return (
      <SelectField
        value={value}
        onValueChange={setValue}
        label="Favourite Fruits"
        placeholder="Pick fruits..."
        multiple
        options={fruitOptions}
      />
    );
  },
};

export const MultiSelectPreSelected: Story = {
  render: () => {
    const [value, setValue] = useState(["apple", "cherry"]);
    return (
      <SelectField
        value={value}
        onValueChange={setValue}
        label="Favourite Fruits"
        placeholder="Pick fruits..."
        multiple
        options={fruitOptions}
      />
    );
  },
};

export const MultiSelectSearchable: Story = {
  render: () => {
    const [value, setValue] = useState<string[]>([]);
    return (
      <SelectField
        value={value}
        onValueChange={setValue}
        label="Countries"
        placeholder="Select countries..."
        multiple
        searchable
        options={countryOptions}
      />
    );
  },
};

export const MultiSelectWithError: Story = {
  render: () => {
    const [value, setValue] = useState<string[]>([]);
    return (
      <SelectField
        value={value}
        onValueChange={setValue}
        label="Favourite Fruits"
        placeholder="Pick fruits..."
        multiple
        options={fruitOptions}
        error="Please select at least one fruit."
      />
    );
  },
};

export const MultiSelectDisabled: Story = {
  render: () => {
    const [value] = useState(["apple", "banana"]);
    return (
      <SelectField
        value={value}
        label="Favourite Fruits"
        placeholder="Pick fruits..."
        multiple
        disabled
        options={fruitOptions}
      />
    );
  },
};
