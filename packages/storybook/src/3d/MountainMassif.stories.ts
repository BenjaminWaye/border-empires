import type { Meta, StoryObj } from "@storybook/html-vite";
import { createMountainMassifs } from "@client/client-map-3d-mountain-massif.js";
import { createStage, forEachGridCell, wrapWithCleanup } from "../three-stage.js";

type Args = {
  gridRadius: number;
  spacing: number;
  cameraDistance: number;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#2a2030" });
  const maxInstances = (args.gridRadius * 2 + 1) ** 2;
  const massifs = createMountainMassifs(stage.scene, maxInstances);
  forEachGridCell({ radius: args.gridRadius, spacing: args.spacing }, (x, z) => {
    massifs.addInstance(x, z, 0);
  });
  massifs.commit();
  return wrapWithCleanup(stage, [massifs.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/MountainMassif",
  argTypes: {
    gridRadius: { control: { type: "range", min: 1, max: 6, step: 1 } },
    spacing: { control: { type: "range", min: 1, max: 3, step: 0.25 } },
    cameraDistance: { control: { type: "range", min: 6, max: 50, step: 2 } }
  },
  args: { gridRadius: 3, spacing: 1, cameraDistance: 18 },
  render
};

export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};
export const SinglePeak: Story = { args: { gridRadius: 1, spacing: 1, cameraDistance: 6 } };
export const Range: Story = { args: { gridRadius: 5, spacing: 1, cameraDistance: 32 } };
