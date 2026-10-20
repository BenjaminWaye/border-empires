import type { Meta, StoryObj } from "@storybook/html-vite";
import { setWorldSeed } from "@border-empires/shared";
import { isTropicalForestLatitude } from "../../../client/src/client-constants.js";
import { drawForestOverlay } from "../../../client/src/client-map-render/client-map-render-forest-overlay.js";

// The 2D-canvas fallback renderer's forest (client-map-render-forest-overlay.ts):
// a block of forest tiles whose species come from the same world-tile hash the
// 3D forest uses (pine/spruce draw as conifers, leaf as broadleaf), plus a row
// of tropical palms from the equatorial belt.

type Args = {
  tileSize: number;
};

const GRASS_LIGHT = "#778e42";
const GRASS_DARK = "#5e7c30";
const COLUMNS = 8;
const TEMPERATE_ROWS = [40, 41, 42];

const tropicalRow = (): number => {
  for (let y = 0; y < 450; y += 1) if (isTropicalForestLatitude(y)) return y;
  return 225;
};

const render = (args: Args): HTMLElement => {
  // Palms need a worldgen v7+ world (isTropicalForestLatitudeAt).
  setWorldSeed(1, "continents", 7);
  const rows = [...TEMPERATE_ROWS, tropicalRow()];
  const canvas = document.createElement("canvas");
  canvas.width = COLUMNS * args.tileSize;
  canvas.height = rows.length * args.tileSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  rows.forEach((wy, row) => {
    for (let column = 0; column < COLUMNS; column += 1) {
      const wx = 100 + column;
      const px = column * args.tileSize;
      const py = row * args.tileSize;
      ctx.fillStyle = (column + row) % 2 === 0 ? GRASS_LIGHT : GRASS_DARK;
      ctx.fillRect(px, py, args.tileSize, args.tileSize);
      drawForestOverlay(ctx, wx, wy, px, py, args.tileSize, undefined, () => true);
    }
  });
  return canvas;
};

const meta: Meta<Args> = {
  title: "2D/Forest",
  argTypes: {
    tileSize: { control: { type: "range", min: 12, max: 96, step: 4 } }
  },
  args: { tileSize: 64 },
  render
};

export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};
export const SmallTiles: Story = { args: { tileSize: 28 } };
