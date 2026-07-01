import type { Meta, StoryObj } from "@storybook/html-vite";
import { createUnfedBadgeOverlay } from "@client/client-map-3d-unfed-badge-overlay/client-map-3d-unfed-badge-overlay.js";
import { createStage, forEachGridCell, wrapWithCleanup } from "../three-stage.js";

type Args = {
  gridRadius: number;
  spacing: number;
  cameraDistance: number;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#2a1d12" });
  const maxTiles = (args.gridRadius * 2 + 1) ** 2;
  const overlay = createUnfedBadgeOverlay(stage.scene, maxTiles);
  forEachGridCell({ radius: args.gridRadius, spacing: args.spacing }, (x, z) => {
    overlay.addInstance(x, z, 0);
  });
  overlay.commit();
  return wrapWithCleanup(stage, [overlay.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/UnfedBadgeOverlay",
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
