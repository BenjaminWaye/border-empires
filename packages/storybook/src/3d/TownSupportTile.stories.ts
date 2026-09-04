import type { Meta, StoryObj } from "@storybook/html-vite";
import { createTownSupportTileOverlay } from "@client/client-map-3d-town-support-tile/client-map-3d-town-support-tile.js";
import { createStage, wrapWithCleanup, createGrassGround } from "../three-stage.js";

type Args = {
  cameraDistance: number;
  showSingle: "none" | "north" | "northeast" | "south" | "southwest" | "east";
  settled: boolean;
};

const CARDINAL_ORDER: ReadonlyArray<readonly [number, number]> = [
  [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]
];

const SINGLE_MAP: Record<Args["showSingle"], readonly [number, number]> = {
  none: [0, 0],
  north: [0, -1],
  northeast: [1, -1],
  south: [0, 1],
  southwest: [-1, 1],
  east: [1, 0]
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#161a22" });
  const overlay = createTownSupportTileOverlay(stage.scene, 64);
  const ground = createGrassGround(2, 0);

  if (args.showSingle === "none") {
    for (const [dx, dz] of CARDINAL_ORDER) {
      overlay.addInstance(dx, dz, 0, dx, dz, args.settled);
    }
  } else {
    const [dx, dz] = SINGLE_MAP[args.showSingle];
    overlay.addInstance(dx, dz, 0, dx, dz, args.settled);
  }

  if (args.showSingle !== "none") {
    const [dx, dz] = SINGLE_MAP[args.showSingle];
    // Centre the camera on the single tile so the hatch glow reads clearly.
    const horizontal = Math.sin(0.6) * args.cameraDistance;
    const vertical = Math.cos(0.6) * args.cameraDistance;
    stage.camera.position.set(dx, vertical + dz * 0.15, dz + horizontal);
    stage.camera.lookAt(dx, 0, dz);
  }

  overlay.commit();
  stage.scene.add(ground.group);
  return wrapWithCleanup(stage, [overlay.dispose, ground.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/TownSupportTile",
  parameters: {
    docs: {
      description: {
        component:
          "The eight supporting tiles around each steampunk town. Each tile is minimal and unobtrusive: just a single recessed hatch sunk into the ground, like an illuminated service well in a garage floor. A hollow dark shaft drops below the surface with a glowing base, and seated flat inside sits a single glowing ionic battery cell — a soft luminous disc flush with the floor — waiting to attach to the economic building that will be placed on top. The battery glow and glowing hatch rim are the only elements that show, keeping the prepared plots quiet until a building lands on them."
      }
    }
  },
  argTypes: {
    cameraDistance: { control: { type: "range", min: 3, max: 14, step: 0.5 } },
    showSingle: {
      control: "inline-radio",
      options: ["none", "north", "northeast", "east", "south", "southwest"]
    },
    settled: { control: "boolean" }
  },
  args: { cameraDistance: 6, showSingle: "none", settled: true },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const FullRing: Story = {};
export const FullRingUnsettled: Story = { args: { settled: false } };
export const NorthTile: Story = { args: { showSingle: "north", cameraDistance: 3 } };
export const NortheastTile: Story = { args: { showSingle: "northeast", cameraDistance: 3 } };
export const EastTile: Story = { args: { showSingle: "east", cameraDistance: 3 } };
export const SouthTile: Story = { args: { showSingle: "south", cameraDistance: 3 } };
export const SouthwestTile: Story = { args: { showSingle: "southwest", cameraDistance: 3 } };
export const NorthTileUnsettled: Story = { args: { showSingle: "north", cameraDistance: 3, settled: false } };
