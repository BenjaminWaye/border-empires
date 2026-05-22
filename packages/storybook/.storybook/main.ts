// This file has been automatically migrated to valid ESM format by Storybook.
import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/html-vite";
import { resolve, dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config: StorybookConfig = {
  framework: { name: "@storybook/html-vite", options: {} },
  stories: ["../src/**/*.stories.@(ts|mdx)"],
  addons: ["@storybook/addon-docs"],
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
