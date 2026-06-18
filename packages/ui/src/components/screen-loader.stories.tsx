import type { Meta, StoryObj } from "@storybook/react";
import { useScreenLoader } from "../hooks/use-screen-loader.ts";
import { ScreenLoader } from "./screen-loader.tsx";
import { Button } from "./ui/button.tsx";

const meta = {
  title: "Composites/ScreenLoader",
  component: ScreenLoader,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Global, portal-rendered loading overlay. Mount once at the app root and drive it imperatively with `useScreenLoader`. Click a button to toggle the overlay; it auto-hides after a short delay so the story stays usable.",
      },
    },
  },
} satisfies Meta<typeof ScreenLoader>;

export default meta;
type Story = StoryObj<typeof meta>;

function DemoControls() {
  const { show, hide } = useScreenLoader();
  const custom = useScreenLoader({
    renderLoader: () => (
      <div className="rounded-lg bg-background px-6 py-4 font-body text-foreground shadow-lg">
        Loading your dashboard…
      </div>
    ),
  });

  const flash = (controls: { show: () => void; hide: () => void }) => {
    controls.show();
    setTimeout(controls.hide, 1500);
  };

  return (
    <div className="flex gap-3">
      <Button onClick={() => flash({ show, hide })}>Default spinner</Button>
      <Button variant="outline" onClick={() => flash(custom)}>
        Custom loader
      </Button>
    </div>
  );
}

export const Default: Story = {
  render: () => (
    <>
      <DemoControls />
      <ScreenLoader />
    </>
  ),
};
