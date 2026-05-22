import type { Meta, StoryObj } from "@storybook/html";
import { createBarbarianOverlay } from "@client/client-map-3d-barbarian-overlay.js";
import { createStage, forEachGridCell, wrapWithCleanup } from "../three-stage.js";

type Args = {
  gridRadius: number;
  spacing: number;
  cameraDistance: number;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#1a1410" });
  const maxTiles = (args.gridRadius * 2 + 1) ** 2;
  const overlay = createBarbarianOverlay(stage.scene, maxTiles);
  forEachGridCell({ radius: args.gridRadius, spacing: args.spacing }, (x, z) => {
    overlay.addInstance(x, z, 0);
  });
  overlay.commit();
  return wrapWithCleanup(stage, [overlay.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/BarbarianOverlay",
  argTypes: {
    gridRadius: { control: { type: "range", min: 0, max: 6, step: 1 } },
    spacing: { control: { type: "range", min: 1, max: 3, step: 0.25 } },
    cameraDistance: { control: { type: "range", min: 3, max: 30, step: 1 } }
  },
  args: { gridRadius: 2, spacing: 1.5, cameraDistance: 10 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Default: Story = {};
export const Single: Story = { args: { gridRadius: 0, cameraDistance: 4 } };
export const Horde: Story = { args: { gridRadius: 5, spacing: 1, cameraDistance: 20 } };
