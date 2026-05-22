import type { Meta, StoryObj } from "@storybook/html-vite";
import { createWaterSurface } from "@client/client-map-3d-water-surface.js";
import { createStage, forEachGridCell, wrapWithCleanup } from "../three-stage.js";

type Args = {
  gridRadius: number;
  spacing: number;
  shallowRadius: number;
  animate: boolean;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: 16, background: "#0a1320" });
  const maxTiles = (args.gridRadius * 2 + 1) ** 2;
  const water = createWaterSurface(stage.scene, maxTiles);
  forEachGridCell({ radius: args.gridRadius, spacing: args.spacing }, (x, z) => {
    const dist = Math.max(Math.abs(x), Math.abs(z));
    water.addTile(x, z, dist <= args.shallowRadius);
  });
  water.commit();

  let rafId = 0;
  if (args.animate) {
    const start = performance.now();
    const tickWater = (): void => {
      water.tick(performance.now() - start);
      rafId = requestAnimationFrame(tickWater);
    };
    tickWater();
  }

  return wrapWithCleanup(stage, [
    () => cancelAnimationFrame(rafId),
    water.dispose
  ]);
};

const meta: Meta<Args> = {
  title: "3D Library/WaterSurface",
  argTypes: {
    gridRadius: { control: { type: "range", min: 1, max: 8, step: 1 } },
    spacing: { control: { type: "range", min: 0.9, max: 1.2, step: 0.05 } },
    shallowRadius: { control: { type: "range", min: 0, max: 6, step: 1 } },
    animate: { control: "boolean" }
  },
  args: { gridRadius: 5, spacing: 1, shallowRadius: 2, animate: true },
  render
};

export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};
export const DeepOnly: Story = { args: { shallowRadius: 0 } };
export const Coastline: Story = { args: { gridRadius: 6, shallowRadius: 4 } };
export const Still: Story = { args: { animate: false } };
