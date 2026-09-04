import type { Meta, StoryObj } from "@storybook/html-vite";
import { createTownOverlay, type TownTier } from "@client/client-map-3d-town-overlay.js";
import { createTownSupportTileOverlay } from "@client/client-map-3d-town-support-tile/client-map-3d-town-support-tile.js";
import { createGrassGround, createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  tier: TownTier;
  camera: "perspective" | "orthographic";
  cameraDistance: number;
  orthoHalfHeight: number;
  biome: "none" | "grass";
};

const RING: ReadonlyArray<readonly [number, number]> = [
  [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]
];

// Each supporting tile extends the settlement outward in every direction as a
// single quiet glowing hatch (an illuminated service well in the ground) with
// the ionic battery waiting inside. Together the town and its eight support
// tiles form one coherent circular district.
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

  const support = createTownSupportTileOverlay(stage.scene, 8);
  support.clear();
  for (const [dx, dz] of RING) {
    support.addInstance(dx, dz, 0, dx, dz);
  }
  support.commit();

  const cleanups: Array<() => void> = [town.dispose, support.dispose];
  if (args.biome === "grass") {
    const ground = createGrassGround(2);
    stage.scene.add(ground.group);
    cleanups.push(ground.dispose);
  }

  return wrapWithCleanup(stage, cleanups);
};

const meta: Meta<Args> = {
  title: "3D Library/TownSupportRing",
  parameters: {
    docs: {
      description: {
        component:
          "A full eight-tile support ring wrapped around each tier of town. The Town sits on its own tile at the centre while the eight surrounding supporting tiles each read as: a single recessed hatch sunk into the ground — like an illuminated service well in a garage floor — with a flat glowing ionic battery cell seated inside, ready to attach to a future building. The slim glowing crosses are evenly spaced around the town, reading as a quiet ring of prepared building sockets without bulky platforms."
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
    biome: { control: { type: "select", labels: { none: "None", grass: "Grass tile" } } }
  },
  args: { tier: "TOWN", camera: "orthographic", cameraDistance: 12, orthoHalfHeight: 3.2, biome: "grass" },
  render: (args) => build(args.tier, args)
};

export default meta;

type Story = StoryObj<Args>;

export const SettlementRing: Story = { args: { tier: "SETTLEMENT" } };
export const TownRing: Story = { args: { tier: "TOWN" } };
export const CityRing: Story = { args: { tier: "CITY" } };
export const GreatCityRing: Story = { args: { tier: "GREAT_CITY" } };
export const MetropolisRing: Story = { args: { tier: "METROPOLIS", orthoHalfHeight: 3.6 } };
