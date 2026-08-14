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
          "The shipped town overlay (createTownOverlay) — a single steampunk civilization evolving through five tiers,",
          "from a frontier settlement around an aether workshop to a Monumental City crowned by a three-part brass wonder.",
          "Every tier shares one architectural language (dark iron, weathered brass, timber, stone, amber lamps and",
          "luminous aether), filling its strategic map tile with a cohesive miniature city rather than scattered huts.",
          "",
          "SETTLEMENT · Frontier Spark — a compact aether-powered workshop with brass machinery, pressure tanks,",
          "timber cottages and warm lamps.",
          "TOWN · Growing Industry — the aether hall rises with a clockwork turret, crane, elevated walkway and",
          "pipe networks.",
          "CITY · Industrial Metropolis — a dense civic engine, factories, brass towers, elevated bridges and",
          "steam vents.",
          "GREAT_CITY · Imperial Powerhouse — a domed civic complex with an elevated transit loop, beacon and",
          "clock tower.",
          "METROPOLIS · Wonder of the World — the colossal three-part Monument dominates districts, transit",
          "bridges and glowing aether conduits."
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
