import type { Meta, StoryObj } from "@storybook/html-vite";
import { createTownOverlay, type TownTier } from "@client/client-map-3d-town-overlay.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  showTiers: TownTier[];
  cameraDistance: number;
  spacing: number;
};

const TIERS: ReadonlyArray<TownTier> = ["SETTLEMENT", "TOWN", "CITY", "GREAT_CITY", "METROPOLIS"];

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#1e2538" });
  const overlay = createTownOverlay(stage.scene, args.showTiers.length);

  overlay.clear();
  args.showTiers.forEach((tier, idx) => {
    const x = (idx - (args.showTiers.length - 1) / 2) * args.spacing;
    overlay.addInstance(x, 0, 0, tier);
  });
  overlay.commit();

  return wrapWithCleanup(stage, [overlay.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/Town",
  parameters: {
    docs: {
      description: {
        component: "The shipped town overlay (createTownOverlay) — hut clusters tiered SETTLEMENT → METROPOLIS, with towers from CITY and a gold-tipped spire on METROPOLIS. METROPOLIS uses the 8-wedge pie layout with radial avenues."
      }
    }
  },
  argTypes: {
    showTiers: { control: "check", options: TIERS as unknown as string[] },
    cameraDistance: { control: { type: "range", min: 2, max: 24, step: 0.5 } },
    spacing: { control: { type: "range", min: 1, max: 2.5, step: 0.1 } }
  },
  args: { showTiers: [...TIERS], cameraDistance: 6, spacing: 1.3 },
  render
};

export default meta;

type Story = StoryObj<Args>;

export const AllTiers: Story = {};
export const Settlement: Story = { args: { showTiers: ["SETTLEMENT"], cameraDistance: 2.5, spacing: 1 } };
export const Town: Story = { args: { showTiers: ["TOWN"], cameraDistance: 2.5, spacing: 1 } };
export const City: Story = { args: { showTiers: ["CITY"], cameraDistance: 3, spacing: 1 } };
export const GreatCity: Story = { args: { showTiers: ["GREAT_CITY"], cameraDistance: 3.5, spacing: 1 } };
export const Metropolis: Story = { args: { showTiers: ["METROPOLIS"], cameraDistance: 4, spacing: 1 } };
export const Progression: Story = { args: { showTiers: ["SETTLEMENT", "TOWN", "CITY"], cameraDistance: 4 } };
