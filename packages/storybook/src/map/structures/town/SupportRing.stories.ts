import type { Meta, StoryObj } from "@storybook/html-vite";
import { createTownOverlay, type TownTier } from "@client/client-map-3d-town-overlay.js";
import { createTownSupportPreview, supportPreviewOffsets } from "../../../fixtures/town-support-preview.js";
import { createGrassGround, createStage, wrapWithCleanup } from "../../../fixtures/three-stage.js";

type Args = {
  tier: TownTier;
  camera: "perspective" | "orthographic";
  cameraDistance: number;
  orthoHalfHeight: number;
  biome: "none" | "grass";
  highlighted: boolean;
};

// The preview follows the shipped tier-dependent support radius.
const build = (tier: TownTier, args: Args): HTMLElement => {
  const stage = createStage({
    cameraDistance: args.cameraDistance,
    background: "#1e2538",
    camera: args.camera,
    orthoHalfHeight: args.orthoHalfHeight
  });

  const town = createTownOverlay(stage.scene, 2);
  town.clear();
  town.addInstance(0, 0, 0, tier);
  town.commit();

  const support = createTownSupportPreview(stage.scene, supportPreviewOffsets(tier), args.highlighted);

  const cleanups: Array<() => void> = [town.dispose, support.dispose];
  if (args.biome === "grass") {
    const ground = createGrassGround(2);
    stage.scene.add(ground.group);
    cleanups.push(ground.dispose);
  }

  return wrapWithCleanup(stage, cleanups);
};

const meta: Meta<Args> = {
  title: "Map/Structures/Town/Support Ring",
  parameters: {
    docs: {
      description: {
        component:
          "Town-selection build plots: ivory corner brackets leave the ground open, with a small brass diamond at each centre. One hovered plot turns amber. Settlements have no support plots, Towns and Cities have eight, and Great Cities and Metropolises have twenty-four."
      }
    }
  },
  argTypes: {
    tier: {
      control: "inline-radio",
      options: ["SETTLEMENT", "TOWN", "CITY", "GREAT_CITY", "METROPOLIS"]
    },
    camera: { control: { type: "select", labels: { perspective: "Perspective", orthographic: "Orthographic (isometric)" } } },
    cameraDistance: { control: { type: "range", min: 4, max: 24, step: 0.5 } },
    orthoHalfHeight: { control: { type: "range", min: 2, max: 6, step: 0.1 } },
    biome: { control: { type: "select", labels: { none: "None", grass: "Grass tile" } } },
    highlighted: { control: "boolean" }
  },
  args: { tier: "TOWN", camera: "orthographic", cameraDistance: 12, orthoHalfHeight: 3.2, biome: "grass", highlighted: false },
  render: (args) => build(args.tier, args)
};

export default meta;

type Story = StoryObj<Args>;

export const SettlementRing: Story = { args: { tier: "SETTLEMENT" } };
export const TownRing: Story = { args: { tier: "TOWN" } };
export const TownRingUnhighlighted: Story = { args: { tier: "TOWN", highlighted: true } };
export const CityRing: Story = { args: { tier: "CITY" } };
export const GreatCityRing: Story = { args: { tier: "GREAT_CITY" } };
export const MetropolisRing: Story = { args: { tier: "METROPOLIS", orthoHalfHeight: 3.6 } };
