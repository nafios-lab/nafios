import type { Preview } from "@storybook/react";
import { themes } from "@storybook/theming";
import "@nafios/ui/globals.css";

const preview: Preview = {
  parameters: {
    docs: {
      theme: themes.dark,
    },
  },
  globalTypes: {
    theme: {
      description: "NafiOS theme",
      toolbar: {
        title: "Theme",
        icon: "mirror",
        items: [
          { value: "light", title: "Light", icon: "sun" },
          { value: "dark", title: "Dark", icon: "moon" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: "dark",
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme ?? "dark";
      document.documentElement.classList.toggle("dark", theme === "dark");
      return (
        <div className="bg-background text-foreground  p-4">
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
