import type { Meta, StoryObj } from "@storybook/html-vite";
import { createClientThreeTownLayer } from "@client/client-map-3d-town/client-map-3d-town.js";
import type { Tile } from "@client/client-types.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type TownTier = NonNullable<NonNullable<Tile["town"]>["populationTier"]>;

type Args = {
  showTiers: TownTier[];
  cameraDistance: number;
  spacing: number;
};

const TIERS: ReadonlyArray<TownTier> = ["SETTLEMENT", "TOWN", "CITY", "GREAT_CITY", "METROPOLIS"];

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#1e2538" });
  const layer = createClientThreeTownLayer(stage.scene, args.showTiers.length);

  layer.beginFrame();
  args.showTiers.forEach((tier, idx) => {
    const x = (idx - (args.showTiers.length - 1) / 2) * args.spacing;
    layer.addTown(tier, x, 0);
  });
  layer.commitFrame();

  return wrapWithCleanup(stage, [layer.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/TownAlternativeLarger",
  parameters: {
    docs: {
      description: {
        component: "Legacy procedural town layer (createClientThreeTownLayer from client-map-3d-town.ts). Not wired into the shipped game — two regression tests explicitly guard against its reintroduction in client-map-3d.ts. Kept here as an alternative larger-building style for reference."
      }
    }
  },
  argTypes: {
    showTiers: { control: "check", options: TIERS as unknown as string[] },
    cameraDistance: { control: { type: "range", min: 4, max: 24, step: 1 } },
    spacing: { control: { type: "range", min: 1, max: 3, step: 0.1 } }
  },
  args: { showTiers: [...TIERS], cameraDistance: 10, spacing: 1.6 },
  render
};

export default meta;

type Story = StoryObj<Args>;

export const AllTiers: Story = {};
export const Settlement: Story = { args: { showTiers: ["SETTLEMENT"], cameraDistance: 4 } };
export const Metropolis: Story = { args: { showTiers: ["METROPOLIS"], cameraDistance: 5 } };
export const Progression: Story = { args: { showTiers: ["SETTLEMENT", "TOWN", "CITY"] } };
