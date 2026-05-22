import type { StorybookConfig } from "@storybook/html-vite";
import { resolve } from "node:path";

const config: StorybookConfig = {
  framework: { name: "@storybook/html-vite", options: {} },
  stories: ["../src/**/*.stories.@(ts|mdx)"],
  addons: ["@storybook/addon-essentials"],
  staticDirs: [
    { from: "../../client/public/overlays", to: "/overlays" }
  ],
  viteFinal: async (cfg) => {
    cfg.resolve = cfg.resolve ?? {};
    cfg.resolve.alias = {
      ...(cfg.resolve.alias ?? {}),
      "@client": resolve(__dirname, "../../client/src")
    };
    return cfg;
  }
};

export default config;
