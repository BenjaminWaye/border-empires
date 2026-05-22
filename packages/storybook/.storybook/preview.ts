import type { Preview } from "@storybook/html-vite";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    backgrounds: {
      options: {
        game: { name: "game", value: "#0a0e14" },
        light: { name: "light", value: "#ffffff" }
      }
    },
    controls: { expanded: true }
  },

  initialGlobals: {
    backgrounds: {
      value: "game"
    }
  }
};

export default preview;
