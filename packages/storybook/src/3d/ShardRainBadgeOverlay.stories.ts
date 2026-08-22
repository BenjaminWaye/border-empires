import type { Meta, StoryObj } from "@storybook/html-vite";
import { createResourceBadgeOverlay } from "@client/client-map-3d-unfed-badge-overlay/client-map-3d-unfed-badge-overlay.js";
import { drawShardGlyph } from "@client/client-persistent-alerts/client-persistent-alerts.js";
import { createStage, forEachGridCell, wrapWithCleanup } from "../three-stage.js";

/**
 * The real shard-rain impact-site badge (client-map-3d.ts's
 * shardRainBadgeOverlay) — the exact same bobbing shield-badge machinery as
 * UnfedBadgeOverlay, with `drawProhibitionSlash: false` (this points at
 * "something worth looking at", not a resource shortage) and a white shard
 * icon (drawShardGlyph, shared with the 2D off-screen locator) instead of
 * the CRYSTAL resource badge's blue gem emoji — a shard landing isn't a
 * Crystal shortage, and the icon matches the actual white shard-site model
 * (client-map-3d-shard-overlay.ts).
 */

type Args = {
  gridRadius: number;
  spacing: number;
  cameraDistance: number;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#0d1117" });
  const maxTiles = (args.gridRadius * 2 + 1) ** 2;
  const overlay = createResourceBadgeOverlay(stage.scene, maxTiles, "", {
    drawProhibitionSlash: false,
    customIconDraw: drawShardGlyph,
    shieldColors: { fill: "#26333d", stroke: "#5c7c8a" }
  });
  forEachGridCell({ radius: args.gridRadius, spacing: args.spacing }, (x, z) => {
    overlay.addInstance(x, z, 0);
  });
  overlay.commit();
  return wrapWithCleanup(stage, [overlay.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/ShardRainBadgeOverlay",
  argTypes: {
    gridRadius: { control: { type: "range", min: 0, max: 6, step: 1 } },
    spacing: { control: { type: "range", min: 1, max: 3, step: 0.25 } },
    cameraDistance: { control: { type: "range", min: 3, max: 30, step: 1 } }
  },
  args: { gridRadius: 2, spacing: 1.5, cameraDistance: 8 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Default: Story = {};
export const Single: Story = { args: { gridRadius: 0, cameraDistance: 3 } };
