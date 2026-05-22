import type { Meta, StoryObj } from "@storybook/html";
import { createClientThreeTownLayer } from "@client/client-map-3d-town.js";
import type { Tile } from "@client/client-types.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type TownTier = NonNullable<NonNullable<Tile["town"]>["populationTier"]>;

type Args = {
  showTiers: TownTier[];
  cameraDistance: number;
};

const TIERS: ReadonlyArray<TownTier> = ["SETTLEMENT", "TOWN", "CITY", "GREAT_CITY", "METROPOLIS"];

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#1e2538" });
  const layer = createClientThreeTownLayer(stage.scene, TIERS.length);

  layer.beginFrame();
  args.showTiers.forEach((tier, idx) => {
    const x = (idx - (args.showTiers.length - 1) / 2) * 2;
    layer.addTown(tier, x, 0);
  });
  layer.commitFrame();

  return wrapWithCleanup(stage, [layer.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/Town",
  argTypes: {
    showTiers: { control: "check", options: TIERS as unknown as string[] },
    cameraDistance: { control: { type: "range", min: 4, max: 24, step: 1 } }
  },
  args: { showTiers: [...TIERS], cameraDistance: 10 },
  render
};

export default meta;

type Story = StoryObj<Args>;

export const AllTiers: Story = {};
export const Settlement: Story = { args: { showTiers: ["SETTLEMENT"], cameraDistance: 4 } };
export const Metropolis: Story = { args: { showTiers: ["METROPOLIS"], cameraDistance: 5 } };
export const Progression: Story = { args: { showTiers: ["SETTLEMENT", "TOWN", "CITY"] } };
