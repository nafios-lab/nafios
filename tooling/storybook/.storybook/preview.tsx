import type { Preview } from "@storybook/react";
import "@nafios/ui/globals.css";

const preview: Preview = {
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
        <div className="p-4">
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
