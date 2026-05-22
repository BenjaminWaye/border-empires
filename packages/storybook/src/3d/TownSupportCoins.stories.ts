import type { Meta, StoryObj } from "@storybook/html-vite";
import {
  createTownSupportCoinLayer,
  type TownSupportCoinEntry,
  type TownSupportCoinKind
} from "@client/client-map-3d-town-support-coins.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  ring: "gold" | "grey" | "mixed";
  cameraDistance: number;
};

const buildEntries = (ring: Args["ring"]): TownSupportCoinEntry[] => {
  const entries: TownSupportCoinEntry[] = [];
  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dz === 0) continue;
      let kind: TownSupportCoinKind;
      if (ring === "gold") kind = "gold";
      else if (ring === "grey") kind = "grey";
      else kind = (dx + dz) % 2 === 0 ? "gold" : "grey";
      entries.push({ worldX: dx * 1.4, worldZ: dz * 1.4, surfaceY: 0, kind });
    }
  }
  return entries;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#1d1f28" });
  const layer = createTownSupportCoinLayer(stage.scene);
  layer.sync(buildEntries(args.ring));
  return wrapWithCleanup(stage, [layer.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/TownSupportCoins",
  parameters: {
    docs: { description: { component: "Coins float over support tiles around a non-SETTLEMENT town. Gold = active support, grey = inactive/blocked." } }
  },
  argTypes: {
    ring: { control: "inline-radio", options: ["gold", "grey", "mixed"] },
    cameraDistance: { control: { type: "range", min: 3, max: 14, step: 0.5 } }
  },
  args: { ring: "gold", cameraDistance: 6 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const ActiveRing: Story = {};
export const InactiveRing: Story = { args: { ring: "grey" } };
export const MixedRing: Story = { args: { ring: "mixed" } };
