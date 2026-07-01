import type { Meta, StoryObj } from "@storybook/html-vite";
import { createRoadOverlay } from "@client/client-map-3d-road-overlay/client-map-3d-road-overlay.js";
import type { RoadDirections } from "@client/client-road-network/client-road-network.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  pattern: "horizontal" | "vertical" | "crossroads" | "star" | "ring" | "tee";
  cameraDistance: number;
};

const FLAT_CORNER_Y = (): number => 0;

type TileEntry = { readonly tx: number; readonly ty: number; readonly dirs: RoadDirections };

const tilesForPattern = (pattern: Args["pattern"]): TileEntry[] => {
  switch (pattern) {
    case "horizontal":
      return [
        { tx: -1, ty: 0, dirs: { east: true } },
        { tx: 0, ty: 0, dirs: { east: true, west: true } },
        { tx: 1, ty: 0, dirs: { west: true } }
      ];
    case "vertical":
      return [
        { tx: 0, ty: -1, dirs: { south: true } },
        { tx: 0, ty: 0, dirs: { north: true, south: true } },
        { tx: 0, ty: 1, dirs: { north: true } }
      ];
    case "crossroads":
      return [
        { tx: 0, ty: 0, dirs: { north: true, south: true, east: true, west: true } },
        { tx: 1, ty: 0, dirs: { west: true } },
        { tx: -1, ty: 0, dirs: { east: true } },
        { tx: 0, ty: 1, dirs: { north: true } },
        { tx: 0, ty: -1, dirs: { south: true } }
      ];
    case "star":
      return [
        {
          tx: 0, ty: 0,
          dirs: { north: true, northeast: true, east: true, southeast: true, south: true, southwest: true, west: true, northwest: true }
        }
      ];
    case "ring":
      return [
        { tx: -1, ty: -1, dirs: { east: true, south: true } },
        { tx: 0, ty: -1, dirs: { east: true, west: true } },
        { tx: 1, ty: -1, dirs: { south: true, west: true } },
        { tx: 1, ty: 0, dirs: { north: true, south: true } },
        { tx: 1, ty: 1, dirs: { north: true, west: true } },
        { tx: 0, ty: 1, dirs: { east: true, west: true } },
        { tx: -1, ty: 1, dirs: { north: true, east: true } },
        { tx: -1, ty: 0, dirs: { north: true, south: true } }
      ];
    case "tee":
      return [
        { tx: -1, ty: 0, dirs: { east: true } },
        { tx: 0, ty: 0, dirs: { east: true, west: true, south: true } },
        { tx: 1, ty: 0, dirs: { west: true } },
        { tx: 0, ty: 1, dirs: { north: true } }
      ];
  }
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#161410" });
  const overlay = createRoadOverlay(stage.scene);
  for (const tile of tilesForPattern(args.pattern)) {
    overlay.addInstance(tile.tx, tile.ty, tile.tx, tile.ty, FLAT_CORNER_Y, tile.dirs);
  }
  overlay.commit();
  return wrapWithCleanup(stage, [overlay.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/RoadOverlay",
  argTypes: {
    pattern: { control: "inline-radio", options: ["horizontal", "vertical", "crossroads", "star", "ring", "tee"] },
    cameraDistance: { control: { type: "range", min: 3, max: 20, step: 1 } }
  },
  args: { pattern: "crossroads", cameraDistance: 8 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Crossroads: Story = {};
export const Horizontal: Story = { args: { pattern: "horizontal", cameraDistance: 6 } };
export const Vertical: Story = { args: { pattern: "vertical", cameraDistance: 6 } };
export const StarHub: Story = { args: { pattern: "star", cameraDistance: 5 } };
export const Ring: Story = { args: { pattern: "ring", cameraDistance: 8 } };
export const TJunction: Story = { args: { pattern: "tee", cameraDistance: 6 } };
