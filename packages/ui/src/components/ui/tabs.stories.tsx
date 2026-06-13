import type { Meta, StoryObj } from "@storybook/react";
import { Landmark, LayoutDashboard, Receipt } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs.tsx";

const meta: Meta = {
  title: "Primitives/Tabs",
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="transactions">Transactions</TabsTrigger>
        <TabsTrigger value="accounts">Accounts</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <p className="text-sm text-muted-foreground">Summary of your financial overview.</p>
      </TabsContent>
      <TabsContent value="transactions">
        <p className="text-sm text-muted-foreground">Recent transactions will appear here.</p>
      </TabsContent>
      <TabsContent value="accounts">
        <p className="text-sm text-muted-foreground">Manage your linked accounts.</p>
      </TabsContent>
    </Tabs>
  ),
};

export const TwoTabs: Story = {
  render: () => (
    <Tabs defaultValue="login" className="w-[300px]">
      <TabsList className="w-full">
        <TabsTrigger value="login" className="flex-1">
          Login
        </TabsTrigger>
        <TabsTrigger value="register" className="flex-1">
          Register
        </TabsTrigger>
      </TabsList>
      <TabsContent value="login">
        <p className="text-sm text-muted-foreground">Sign in to your account.</p>
      </TabsContent>
      <TabsContent value="register">
        <p className="text-sm text-muted-foreground">Create a new account.</p>
      </TabsContent>
    </Tabs>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="overview" className="gap-1.5">
          <LayoutDashboard className="size-4" />
          Overview
        </TabsTrigger>
        <TabsTrigger value="transactions" className="gap-1.5">
          <Receipt className="size-4" />
          Transactions
        </TabsTrigger>
        <TabsTrigger value="accounts" className="gap-1.5">
          <Landmark className="size-4" />
          Accounts
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <p className="text-sm text-muted-foreground">Summary of your financial overview.</p>
      </TabsContent>
      <TabsContent value="transactions">
        <p className="text-sm text-muted-foreground">Recent transactions will appear here.</p>
      </TabsContent>
      <TabsContent value="accounts">
        <p className="text-sm text-muted-foreground">Manage your linked accounts.</p>
      </TabsContent>
    </Tabs>
  ),
};

export const CustomActiveColor: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="w-[400px]">
      <TabsList>
        <TabsTrigger
          value="overview"
          className="data-[state=active]:bg-brand data-[state=active]:text-white"
        >
          Overview
        </TabsTrigger>
        <TabsTrigger
          value="transactions"
          className="data-[state=active]:bg-brand data-[state=active]:text-white"
        >
          Transactions
        </TabsTrigger>
        <TabsTrigger
          value="accounts"
          className="data-[state=active]:bg-brand data-[state=active]:text-white"
        >
          Accounts
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <p className="text-sm text-muted-foreground">Brand-colored active tab.</p>
      </TabsContent>
      <TabsContent value="transactions">
        <p className="text-sm text-muted-foreground">Recent transactions will appear here.</p>
      </TabsContent>
      <TabsContent value="accounts">
        <p className="text-sm text-muted-foreground">Manage your linked accounts.</p>
      </TabsContent>
    </Tabs>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Tabs defaultValue="active" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="active">Active</TabsTrigger>
        <TabsTrigger value="disabled" disabled>
          Disabled
        </TabsTrigger>
        <TabsTrigger value="other">Other</TabsTrigger>
      </TabsList>
      <TabsContent value="active">
        <p className="text-sm text-muted-foreground">This tab is active.</p>
      </TabsContent>
      <TabsContent value="other">
        <p className="text-sm text-muted-foreground">Another tab.</p>
      </TabsContent>
    </Tabs>
  ),
};
