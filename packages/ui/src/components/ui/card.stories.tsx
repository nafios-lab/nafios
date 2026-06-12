import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card.tsx";

const meta: Meta = {
  title: "Primitives/Card",
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card description goes here.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm">This is the card body content.</p>
      </CardContent>
      <CardFooter>
        <Button size="sm">Action</Button>
      </CardFooter>
    </Card>
  ),
};

export const StatsCard: Story = {
  render: () => (
    <Card className="w-64">
      <CardHeader>
        <CardDescription>Total Balance</CardDescription>
        <CardTitle className="text-2xl">$12,450.00</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">+2.5% from last month</p>
      </CardContent>
    </Card>
  ),
};

export const SimpleContent: Story = {
  render: () => (
    <Card className="w-72">
      <CardContent className="pt-6">
        <p className="text-sm">
          A card with only content — no header or footer.
        </p>
      </CardContent>
    </Card>
  ),
};

export const WithFooterActions: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Delete account</CardTitle>
        <CardDescription>
          This action is irreversible. All data will be lost.
        </CardDescription>
      </CardHeader>
      <CardFooter className="justify-end gap-2">
        <Button variant="outline" size="sm">
          Cancel
        </Button>
        <Button variant="destructive" size="sm">
          Delete
        </Button>
      </CardFooter>
    </Card>
  ),
};

export const GridLayout: Story = {
  render: () => (
    <div className="grid grid-cols-3 gap-4 w-[640px]">
      {["Finance", "Budgeting", "Documents"].map((app) => (
        <Card key={app}>
          <CardHeader>
            <CardTitle className="text-base">{app}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Manage your {app.toLowerCase()}.
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  ),
};
