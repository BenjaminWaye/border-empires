import type { Meta, StoryObj } from "@storybook/html-vite";
import { createDockOverlay } from "@client/client-map-3d-dock-overlay.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  rotationDegrees: number;
  count: number;
  cameraDistance: number;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#102030" });
  const overlay = createDockOverlay(stage.scene, Math.max(args.count, 1));
  const rad = (args.rotationDegrees * Math.PI) / 180;
  for (let i = 0; i < args.count; i += 1) {
    const x = (i - (args.count - 1) / 2) * 1.4;
    overlay.addInstance(x, 0, 0, rad, Math.round(x), 0);
  }
  overlay.commit();
  return wrapWithCleanup(stage, [overlay.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/DockOverlay",
  parameters: {
    docs: {
      description: {
        component:
          "Dock: the empire's ocean transport hub. A heavy timber-and-iron pier runs out from a compact industrial shore building toward the water. The centrepiece is a large brass cargo crane — a tall tapered mast with a jib over the pier, a counterweight jib over the shore, and a chain visibly suspending a cargo crate above the loading deck. The shore end holds a dockhouse (amber windows, chimney), a steam boiler and winch with brass drum and gear, and a pipe run with a pressure valve. Crates and barrels wait on the deck, mooring posts with chains tie off a small steampunk cargo barge (iron hull, wood deck, cabin, funnel), and small amber lamps dot the pier. No guns or fortifications. The model is built facing +z (south); rotate to face the adjacent water tile."
      }
    }
  },
  argTypes: {
    rotationDegrees: { control: { type: "range", min: 0, max: 360, step: 15 } },
    count: { control: { type: "range", min: 1, max: 5, step: 1 } },
    cameraDistance: { control: { type: "range", min: 2, max: 16, step: 0.5 } }
  },
  args: { rotationDegrees: 0, count: 1, cameraDistance: 4 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const FacingSouth: Story = {};
export const FacingNorth: Story = { args: { rotationDegrees: 180 } };
export const FacingEast: Story = { args: { rotationDegrees: 90 } };
export const Row: Story = { args: { count: 4, cameraDistance: 8 } };
