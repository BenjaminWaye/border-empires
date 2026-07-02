import type { Meta, StoryObj } from "@storybook/html-vite";
import { createStructurePieceBuilder } from "@client/client-map-3d-structure-builder.js";
import { registerCivicStructures } from "@client/client-map-3d-structure-civic.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

// Standalone focused story for Census Hall, same pattern as other
// single-structure stories (e.g. Farmstead's custom render).

type Args = {
  cameraDistance: number;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#1b1d22" });
  const { builder, commit, dispose } = createStructurePieceBuilder(stage.scene, 1);
  const civic = registerCivicStructures(builder);
  civic.layouts.CENSUS_HALL(0, 0, 0);
  commit();

  return wrapWithCleanup(stage, [dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/CensusHall",
  parameters: {
    docs: { description: { component: "Census Hall: a modest records office with a small brass tally drum, scaled like the other minor support structures (Customs House, Exchange House)." } }
  },
  argTypes: {
    cameraDistance: { control: { type: "range", min: 1.5, max: 8, step: 0.25 } }
  },
  args: { cameraDistance: 3 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Default: Story = {};
export const CloseUp: Story = { args: { cameraDistance: 2 } };
