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
          "The shipped procedural town overlay (createTownOverlay): one sunlit low-poly town growing through five tiers,",
          "in the same flat-shaded, vertex-coloured language as the rest of the map -- cream plaster, terracotta and slate",
          "roofs, pale stone walls, timber, with brass clock faces, verdigris copper domes and lit windows as the steampunk",
          "accents. See TownOnTerrain for the towns on the real terrain at the game's camera tilt.",
          "",
          "SETTLEMENT · a farming hamlet: cottages, a barn and haystacks round a well.",
          "TOWN · a market town: terraces round a square with a fountain, market stalls and a clock-towered town hall.",
          "CITY · a walled city: curtain wall, corner towers and gatehouse, church spire, domed guild hall, workshop stack.",
          "GREAT_CITY · taller walls ringed with towers, a domed palace, cathedral, clock tower and an industrial corner.",
          "METROPOLIS · a central citadel spire crowned with an aether crystal, copper domes, an aether-lit avenue and",
          "dense three-storey districts."
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
