import type { Meta, StoryObj } from "@storybook/html-vite";
import { createMountainMassifs } from "@client/client-map-3d-mountain-massif.js";
import { createStage, forEachGridCell, wrapWithCleanup } from "../three-stage.js";

type Args = {
  gridRadius: number;
  spacing: number;
  cameraDistance: number;
  coldCountry: boolean;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#2a2030" });
  const maxInstances = (args.gridRadius * 2 + 1) ** 2;
  // The grid's own cells are the mountains, so at spacing 1 they join into
  // ranges (ridge saddles, taller spine) and further apart they stand alone.
  const r = args.gridRadius;
  const massifs = createMountainMassifs(stage.scene, maxInstances, {
    isMountainAt: (x, y) => args.spacing === 1 && Math.abs(x) <= r && Math.abs(y) <= r,
    isColdAt: () => args.coldCountry,
    wrapX: (x) => x,
    wrapY: (y) => y
  });
  forEachGridCell({ radius: args.gridRadius, spacing: args.spacing }, (x, z) => {
    massifs.addInstance(x, z, 0, Math.round(x / args.spacing), Math.round(z / args.spacing));
  });
  massifs.commit();
  return wrapWithCleanup(stage, [massifs.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/MountainMassif",
  argTypes: {
    gridRadius: { control: { type: "range", min: 1, max: 6, step: 1 } },
    spacing: { control: { type: "range", min: 1, max: 3, step: 0.25 } },
    cameraDistance: { control: { type: "range", min: 6, max: 50, step: 2 } },
    coldCountry: { control: "boolean" }
  },
  args: { gridRadius: 3, spacing: 1, cameraDistance: 18, coldCountry: false },
  render
};

export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};
export const SinglePeak: Story = { args: { gridRadius: 1, spacing: 1, cameraDistance: 6 } };
export const Range: Story = { args: { gridRadius: 5, spacing: 1, cameraDistance: 32 } };
export const LoneMountains: Story = { args: { gridRadius: 3, spacing: 2, cameraDistance: 24 } };
export const ColdRange: Story = { args: { gridRadius: 3, spacing: 1, cameraDistance: 18, coldCountry: true } };
