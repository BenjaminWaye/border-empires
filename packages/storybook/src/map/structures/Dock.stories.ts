import type { Meta, StoryObj } from "@storybook/html-vite";
import { createDockOverlay } from "@client/client-map-3d-dock-overlay.js";
import { createStage, wrapWithCleanup } from "../../fixtures/three-stage.js";

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
  title: "Map/Structures/Dock",
  parameters: {
    docs: {
      description: {
        component:
          "Harbour quay (the dock tile; see Harbour for the full harbour with its landing slipways). A stone quay with an iron-capped edge and a timber pier on piles, a toll and harbourmaster's house with lit windows and a slate roof, a coal-fired steam derrick hoisting a crate, freight on the quay, a harbour lamp on the pier head and a paddle-steamer ferry moored alongside. Steam and iron, no aether and no guns (world bible §4, §10). Modelled facing +z (south); rotate to face the adjacent water tile."
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
