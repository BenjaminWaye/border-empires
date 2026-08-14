import type { Meta, StoryObj } from "@storybook/html-vite";
import { createTownOverlay, type TownTier } from "@client/client-map-3d-town-overlay.js";
import { createGrassGround, createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  showTiers: TownTier[];
  cameraDistance: number;
  spacing: number;
  camera: "perspective" | "orthographic";
  orthoHalfHeight: number;
};

const TIERS: ReadonlyArray<TownTier> = ["SETTLEMENT", "TOWN", "CITY", "GREAT_CITY", "METROPOLIS"];

const render = (args: Args): HTMLElement => {
  const stage = createStage({
    cameraDistance: args.cameraDistance,
    background: "#1e2538",
    camera: args.camera,
    orthoHalfHeight: args.orthoHalfHeight
  });

  const halfExtent = ((args.showTiers.length - 1) / 2) * args.spacing + 0.7;
  const ground = createGrassGround(Math.max(2, Math.ceil(halfExtent)), 0);
  stage.scene.add(ground.group);

  const overlay = createTownOverlay(stage.scene, args.showTiers.length);
  overlay.clear();
  args.showTiers.forEach((tier, idx) => {
    const x = (idx - (args.showTiers.length - 1) / 2) * args.spacing;
    overlay.addInstance(x, 0, 0, tier);
  });
  overlay.commit();

  return wrapWithCleanup(stage, [overlay.dispose, ground.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/Town",
  parameters: {
    docs: {
      description: {
        component:
          "The shipped town overlay (createTownOverlay) — five hand-built steampunk aether-civilization city tiers, each a distinct skyline rather than more houses:\n\n" +
          "· **SETTLEMENT · Frontier Spark** — a few dark timber/iron shacks around a brass aether pump with a glowing lamp and pipework.\n" +
          "· **TOWN · Growing Industry** — a central clockwork hall with an exposed gear, workshop chimneys, a walkway, a brass crane and street lamps.\n" +
          "· **CITY · Industrial Metropolis** — a tall civic-engine tower with dome and gear, factories, brass stacks, street-spanning pipes and elevated aether bridges.\n" +
          "· **GREAT_CITY · Imperial Powerhouse** — a domed civic complex flanked by twin brass towers, surrounded by a glowing elevated transit loop and spires.\n" +
          "· **METROPOLIS · Wonder of the World** — a colossal three-part Monument of brass pylons and aether orbs rising above radiating conduits and organized districts.\n\n" +
          "All pieces use shared instanced geometry (no textures, flat shading, per-instance color) so the overlay stays light on the GPU. Use the orthographic **Isometric** story to view them without perspective foreshortening."
      }
    }
  },
  argTypes: {
    showTiers: { control: "check", options: TIERS as unknown as string[] },
    cameraDistance: { control: { type: "range", min: 2, max: 24, step: 0.5 } },
    spacing: { control: { type: "range", min: 1, max: 2.5, step: 0.1 } },
    camera: { control: "radio", options: ["perspective", "orthographic"] },
    orthoHalfHeight: { control: { type: "range", min: 0.5, max: 6, step: 0.1 } }
  },
  args: { showTiers: [...TIERS], cameraDistance: 6, spacing: 1.3, camera: "perspective", orthoHalfHeight: 1.6 },
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
export const Isometric: Story = {
  args: { showTiers: [...TIERS], cameraDistance: 4, spacing: 1.3, camera: "orthographic", orthoHalfHeight: 1.6 }
};
