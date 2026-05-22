import type { Preview } from "@storybook/html";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    backgrounds: {
      default: "game",
      values: [
        { name: "game", value: "#0a0e14" },
        { name: "light", value: "#ffffff" }
      ]
    },
    controls: { expanded: true }
  }
};

export default preview;
