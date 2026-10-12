import type { Meta, StoryObj } from "@storybook/html-vite";
import { mountainNeighbourhoodAt } from "../../../client/src/client-map-mountain-variation/client-map-mountain-variation.js";
import { drawMountainPeaksLayout, mountainPeaksLayout } from "../../../client/src/client-map-render/client-map-render-mountain-peaks.js";

type Args = {
  tileSize: number;
  coldCountry: boolean;
};

const GRASS = "#6d8a3f";
const ROCK = "#7e7e81";

// A lone mountain, a pair, an L-shaped ridge and a block range, on grass.
const MAP = [
  "..........",
  ".M...MM...",
  "..........",
  "..M.......",
  "..MMM..MMM",
  "......MMMM",
  ".M.....MM.",
  ".........."
];

const isMountain = (x: number, y: number): boolean => MAP[y]?.[x] === "M";

const render = (args: Args): HTMLElement => {
  const canvas = document.createElement("canvas");
  canvas.width = MAP[0]!.length * args.tileSize;
  canvas.height = MAP.length * args.tileSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  for (let y = 0; y < MAP.length; y += 1) {
    for (let x = 0; x < MAP[0]!.length; x += 1) {
      const px = x * args.tileSize;
      const py = y * args.tileSize;
      ctx.fillStyle = isMountain(x, y) ? ROCK : GRASS;
      ctx.fillRect(px, py, args.tileSize, args.tileSize);
      if (!isMountain(x, y)) continue;
      const neighbourhood = mountainNeighbourhoodAt(x, y, {
        isMountainAt: isMountain,
        isColdAt: () => args.coldCountry,
        wrapX: (v) => v,
        wrapY: (v) => v
      });
      drawMountainPeaksLayout(ctx, mountainPeaksLayout(x, y, neighbourhood), px, py, args.tileSize);
    }
  }
  return canvas;
};

const meta: Meta<Args> = {
  title: "2D/MountainPeaks",
  argTypes: {
    tileSize: { control: { type: "range", min: 16, max: 96, step: 4 } },
    coldCountry: { control: "boolean" }
  },
  args: { tileSize: 56, coldCountry: false },
  render
};

export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};
export const ColdCountry: Story = { args: { coldCountry: true } };
export const ZoomedOut: Story = { args: { tileSize: 20 } };
