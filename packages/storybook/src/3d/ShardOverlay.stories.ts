import type { Meta, StoryObj } from "@storybook/html-vite";
import { createShardOverlay } from "@client/client-map-3d-shard-overlay.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = { variantOffset: number; count: number; cameraDistance: number };

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#102030" });
  const overlay = createShardOverlay(stage.scene, Math.max(args.count, 1));
  for (let i = 0; i < args.count; i += 1) {
    const x = (i - (args.count - 1) / 2) * 1.5;
    overlay.addInstance(x, 0, 0, i + args.variantOffset, 0);
  }
  overlay.commit();
  return wrapWithCleanup(stage, [overlay.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/ShardOverlay",
  args: { variantOffset: 0, count: 1, cameraDistance: 4.5 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Spire: Story = { args: { variantOffset: 0, count: 1 } };
export const Cluster: Story = { args: { variantOffset: 1, count: 1 } };
export const Shattered: Story = { args: { variantOffset: 2, count: 1 } };
export const Row: Story = { args: { variantOffset: 0, count: 3, cameraDistance: 7 } };
