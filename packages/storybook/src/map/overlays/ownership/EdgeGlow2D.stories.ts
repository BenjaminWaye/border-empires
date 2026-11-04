import type { Meta, StoryObj } from "@storybook/html-vite";
import type { Tile } from "@client/client-types.js";
import { drawLiveOwnershipTint2D } from "@client/client-map-render/client-map-render-live-ownership-tint.js";
import { settledEdgeMaskForOwner } from "@client/client-settled-edge-glow/client-settled-edge-glow.js";
import { drawExposedTileBorder } from "@client/client-tile-borders/client-tile-borders.js";
import { EDGE_GLOW_OWNER_COLORS, EDGE_GLOW_WORLD_HEIGHT, EDGE_GLOW_WORLD_WIDTH, edgeGlowWorld } from "../../../fixtures/edge-glow-world.js";

// 2D canvas parity for the settled edge glow: the real live-ownership tint
// (client-map-render-live-ownership-tint.ts) plus the existing exposed-side
// border stroke, over a plain grass fill, on the same world as the 3D story.

type Args = { look: "flat" | "edge-glow"; tileSize: number };

const ORIGIN = 0;
const world = edgeGlowWorld(ORIGIN, ORIGIN);

const render = (args: Args): HTMLElement => {
  const size = args.tileSize;
  const canvas = document.createElement("canvas");
  canvas.width = EDGE_GLOW_WORLD_WIDTH * size;
  canvas.height = EDGE_GLOW_WORLD_HEIGHT * size;
  canvas.style.maxWidth = "100%";
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  for (let y = 0; y < EDGE_GLOW_WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < EDGE_GLOW_WORLD_WIDTH; x += 1) {
      ctx.fillStyle = (x * 7 + y * 3) % 5 === 0 ? "#6b8a46" : "#71904b";
      ctx.fillRect(x * size, y * size, size, size);
    }
  }
  const asTile = (t: { x: number; y: number; ownerId: string; ownershipState: "SETTLED" | "FRONTIER" }): Tile => ({ ...t, terrain: "LAND" });
  const tiles = new Map<string, Tile>([...world.tiles].map(([key, t]) => [key, asTile(t)]));
  for (const tile of tiles.values()) {
    const ownerId = tile.ownerId as string;
    const mask = args.look === "edge-glow" && tile.ownershipState === "SETTLED" ? settledEdgeMaskForOwner(tile.x, tile.y, ownerId, world.neighbourDeps) : undefined;
    drawLiveOwnershipTint2D(ctx, tile, EDGE_GLOW_OWNER_COLORS[ownerId] ?? "#ffffff", tile.x, tile.y, tile.x * size, tile.y * size, size, 0, mask);
  }
  for (const tile of tiles.values()) {
    ctx.strokeStyle = EDGE_GLOW_OWNER_COLORS[tile.ownerId as string] ?? "#ffffff";
    ctx.lineWidth = 2;
    drawExposedTileBorder(ctx, tile, tile.x * size, tile.y * size, size, { ...world.neighbourDeps, tiles });
  }
  return canvas;
};

const meta: Meta<Args> = {
  title: "Map/Overlays/Ownership/Edge Glow 2D",
  argTypes: {
    look: { control: "inline-radio", options: ["flat", "edge-glow"] },
    tileSize: { control: { type: "range", min: 16, max: 64, step: 4 } }
  },
  args: { look: "edge-glow", tileSize: 44 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const EdgeGlow2D: Story = {};
export const FlatToday2D: Story = { args: { look: "flat" } };
