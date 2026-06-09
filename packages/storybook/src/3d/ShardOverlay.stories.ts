import type { Meta, StoryObj } from "@storybook/html-vite";
import { createShardOverlay } from "@client/client-map-3d-shard-overlay.js";
import { createStage, forEachGridCell, wrapWithCleanup } from "../three-stage.js";

type Args = {
  gridRadius: number;
  spacing: number;
  cameraDistance: number;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#0d1018" });
  const maxTiles = (args.gridRadius * 2 + 1) ** 2;
  const overlay = createShardOverlay(stage.scene, maxTiles);
  forEachGridCell({ radius: args.gridRadius, spacing: args.spacing }, (x, z) => {
    overlay.addInstance(x, z, 0, x, z);
  });
  overlay.commit();

  let rafId = 0;
  const animate = (): void => {
    overlay.update(performance.now());
    rafId = requestAnimationFrame(animate);
  };
  animate();

  return wrapWithCleanup(stage, [() => cancelAnimationFrame(rafId), overlay.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/ShardOverlay",
  parameters: {
    docs: { description: { component: "Animated crystal shard floating above a glowing platform ring. Bobs vertically and spins slowly." } }
  },
  argTypes: {
    gridRadius: { control: { type: "range", min: 0, max: 5, step: 1 } },
    spacing: { control: { type: "range", min: 1, max: 3, step: 0.25 } },
    cameraDistance: { control: { type: "range", min: 2, max: 30, step: 1 } }
  },
  args: { gridRadius: 2, spacing: 1.5, cameraDistance: 10 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Default: Story = {};
export const Single: Story = { args: { gridRadius: 0, cameraDistance: 4 } };
export const Field: Story = { args: { gridRadius: 4, spacing: 1.2, cameraDistance: 20 } };
