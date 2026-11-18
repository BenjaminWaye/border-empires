import type { Meta, StoryObj } from "@storybook/html-vite";
import { createTownSupportPreview } from "../../../fixtures/town-support-preview.js";
import { createStage, wrapWithCleanup, createGrassGround } from "../../../fixtures/three-stage.js";

type Args = {
  cameraDistance: number;
  showSingle: "none" | "north" | "northeast" | "south" | "southwest" | "east";
  highlighted: boolean;
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
  const ground = createGrassGround(2, 0);

  const offsets = args.showSingle === "none" ? CARDINAL_ORDER : [SINGLE_MAP[args.showSingle]];
  const overlay = createTownSupportPreview(stage.scene, offsets, args.highlighted);

  if (args.showSingle !== "none") {
    const [dx, dz] = SINGLE_MAP[args.showSingle];
    // Centre the camera on the single tile so the corner markers read clearly.
    const horizontal = Math.sin(0.6) * args.cameraDistance;
    const vertical = Math.cos(0.6) * args.cameraDistance;
    stage.camera.position.set(dx, vertical + dz * 0.15, dz + horizontal);
    stage.camera.lookAt(dx, 0, dz);
  }

  stage.scene.add(ground.group);
  return wrapWithCleanup(stage, [overlay.dispose, ground.dispose]);
};

const meta: Meta<Args> = {
  title: "Map/Structures/Town/Support Tile",
  parameters: {
    docs: {
      description: {
        component:
          "Open building plots around a selected town: four ivory corner brackets and a brass centre diamond, with amber on the hovered plot. The ground remains visible; no hatches or raised pads."
      }
    }
  },
  argTypes: {
    cameraDistance: { control: { type: "range", min: 3, max: 14, step: 0.5 } },
    showSingle: {
      control: "inline-radio",
      options: ["none", "north", "northeast", "east", "south", "southwest"]
    },
    highlighted: { control: "boolean" }
  },
  args: { cameraDistance: 6, showSingle: "none", highlighted: false },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const FullRing: Story = {};
export const FullRingUnhighlighted: Story = { args: { highlighted: true } };
export const NorthTile: Story = { args: { showSingle: "north", cameraDistance: 3 } };
export const NortheastTile: Story = { args: { showSingle: "northeast", cameraDistance: 3 } };
export const EastTile: Story = { args: { showSingle: "east", cameraDistance: 3 } };
export const SouthTile: Story = { args: { showSingle: "south", cameraDistance: 3 } };
export const SouthwestTile: Story = { args: { showSingle: "southwest", cameraDistance: 3 } };
export const NorthTileUnhighlighted: Story = { args: { showSingle: "north", cameraDistance: 3, highlighted: true } };
