import type { Meta, StoryObj } from "@storybook/html-vite";
import { createTownOverlay, type TownTier } from "@client/client-map-3d-town-overlay.js";
import { createGrassGround, createStage, wrapWithCleanup } from "../three-stage.js";

type Biome = "none" | "grass";

type Args = {
  showTiers: TownTier[];
  cameraDistance: number;
  spacing: number;
  camera: "perspective" | "orthographic";
  orthoHalfHeight: number;
  biome: Biome;
};

const TIERS: ReadonlyArray<TownTier> = ["SETTLEMENT", "TOWN", "CITY", "GREAT_CITY", "METROPOLIS"];

const render = (args: Args): HTMLElement => {
  const stage = createStage({
    cameraDistance: args.cameraDistance,
    background: "#1e2538",
    camera: args.camera,
    orthoHalfHeight: args.orthoHalfHeight
  });

  const overlay = createTownOverlay(stage.scene, Math.max(1, args.showTiers.length));

  overlay.clear();
  args.showTiers.forEach((tier, idx) => {
    const x = (idx - (args.showTiers.length - 1) / 2) * args.spacing;
    overlay.addInstance(x, 0, 0, tier);
  });
  overlay.commit();

  const cleanups: Array<() => void> = [overlay.dispose];
  if (args.biome === "grass") {
    const radius = Math.max(1, Math.ceil((args.spacing * args.showTiers.length) / 2) + 1);
    const ground = createGrassGround(radius);
    stage.scene.add(ground.group);
    cleanups.push(ground.dispose);
  }

  return wrapWithCleanup(stage, cleanups);
};

const meta: Meta<Args> = {
  title: "3D Library/Town",
  parameters: {
    docs: {
      description: {
        component: [
          "The shipped procedural town overlay (createTownOverlay): a lived-in steampunk town growing through five tiers --",
          "sandstone, brick and plaster townhouses under copper, slate and terracotta roofs, with the AFC's brass, blackened",
          "iron and cyan aether rising out of them in sandstone towers, skybridges and airships. See TownOnTerrain for the",
          "towns on the real terrain beside an AFC.",
          "",
          "SETTLEMENT · a hamlet of cottages round an aether lamp, with a greenhouse, water condenser and wind turbine.",
          "TOWN · a crescent of townhouses round a fountain square and market under a geared clock tower.",
          "CITY · terraces ringing a copper-spired sandstone tower, two skybridged towers, a greenhouse and an airship.",
          "GREAT_CITY · twin towers joined by skybridges behind a terraced garden arcology, a clock tower, a moored airship.",
          "METROPOLIS · a rooftop monorail circling three-storey terraces round a brass-haloed megaspire, two airships."
        ].join("\n")
      }
    }
  },
  argTypes: {
    showTiers: { control: "check", options: TIERS as unknown as string[] },
    cameraDistance: { control: { type: "range", min: 2, max: 24, step: 0.5 } },
    spacing: { control: { type: "range", min: 1, max: 2.5, step: 0.1 } },
    camera: { control: { type: "select", labels: { perspective: "Perspective", orthographic: "Orthographic (isometric)" } } },
    orthoHalfHeight: { control: { type: "range", min: 1, max: 4, step: 0.1 } },
    biome: { control: { type: "select", labels: { none: "None", grass: "Grass tile" } } }
  },
  args: { showTiers: [...TIERS], cameraDistance: 6, spacing: 1.3, camera: "perspective", orthoHalfHeight: 2, biome: "none" },
  render
};

export default meta;

type Story = StoryObj<Args>;

export const AllTiers: Story = {};
export const Progression: Story = { args: { showTiers: [...TIERS], cameraDistance: 4, spacing: 1.5 } };
export const Isometric: Story = {
  args: { showTiers: ["METROPOLIS"], camera: "orthographic", orthoHalfHeight: 2.4, cameraDistance: 8, biome: "grass" }
};
export const Settlement: Story = {
  args: { showTiers: ["SETTLEMENT"], camera: "orthographic", orthoHalfHeight: 1.1, cameraDistance: 8, spacing: 1, biome: "grass" }
};
export const Town: Story = {
  args: { showTiers: ["TOWN"], camera: "orthographic", orthoHalfHeight: 1.2, cameraDistance: 8, spacing: 1, biome: "grass" }
};
export const City: Story = {
  args: { showTiers: ["CITY"], camera: "orthographic", orthoHalfHeight: 1.4, cameraDistance: 8, spacing: 1, biome: "grass" }
};
export const GreatCity: Story = {
  args: { showTiers: ["GREAT_CITY"], camera: "orthographic", orthoHalfHeight: 1.6, cameraDistance: 8, spacing: 1, biome: "grass" }
};
export const Metropolis: Story = {
  args: { showTiers: ["METROPOLIS"], camera: "orthographic", orthoHalfHeight: 2.4, cameraDistance: 8, spacing: 1, biome: "grass" }
};
