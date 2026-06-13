import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./button.tsx";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet.tsx";
import { TextInput } from "../text-input.tsx";

const meta: Meta = {
  title: "Primitives/Sheet",
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Sheet</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Sheet Title</SheetTitle>
          <SheetDescription>This is a description of the sheet content.</SheetDescription>
        </SheetHeader>
        <div className="py-4">
          <p className="text-sm text-muted-foreground">Sheet content goes here.</p>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="outline">Cancel</Button>
          </SheetClose>
          <Button variant="brand">Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const Left: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Left</Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Browse the app sections.</SheetDescription>
        </SheetHeader>
        <nav className="grid gap-2 py-4">
          {["Dashboard", "Transactions", "Accounts", "Settings"].map((item) => (
            <Button key={item} variant="ghost" className="justify-start">
              {item}
            </Button>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  ),
};

export const Top: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Top</Button>
      </SheetTrigger>
      <SheetContent side="top">
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription>You have 3 unread notifications.</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  ),
};

export const Bottom: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Bottom</Button>
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Cookie Preferences</SheetTitle>
          <SheetDescription>Manage your cookie settings below.</SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="outline">Decline</Button>
          </SheetClose>
          <Button variant="brand">Accept All</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const WithForm: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button>Edit Profile</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit profile</SheetTitle>
          <SheetDescription>
            Make changes to your profile. Click save when you're done.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 py-4">
          <TextInput label="Name" defaultValue="Hanafi" />
          <TextInput label="Username" defaultValue="@hanafi" />
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="outline">Cancel</Button>
          </SheetClose>
          <Button variant="brand">Save changes</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};
