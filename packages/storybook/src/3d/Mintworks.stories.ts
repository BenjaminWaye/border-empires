import type { Meta, StoryObj } from "@storybook/html-vite";
import { createStructureOverlay } from "@client/client-map-3d-structure-overlay/client-map-3d-structure-overlay.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

// Focused story for the Mintworks industrial minting workshop. Renders the
// same generic StructureKind dispatch as StructureOverlay, centered on a
// single tile with a close camera so the coin press + flywheel read clearly.

type Args = {
  cameraDistance: number;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#1b1d22" });
  const overlay = createStructureOverlay(stage.scene, 1);
  overlay.addInstance(0, 0, 0, "MINTWORKS");
  overlay.commit();
  return wrapWithCleanup(stage, [overlay.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/Mintworks",
  parameters: {
    docs: {
      description: {
        component:
          "Mintworks: the empire's fundamental gold-minting workshop. A compact dark-iron hall whose centerpiece is a giant brass coin press — posts, crossbeam, stamping head, piston and die over an iron platform — flanked by a large brass flywheel, a brass gear train, a rear furnace with warm glow, ingot stocks, coin trays and wooden coin crates."
      }
    }
  },
  argTypes: {
    cameraDistance: { control: { type: "range", min: 1.5, max: 8, step: 0.25 } }
  },
  args: { cameraDistance: 3 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Default: Story = {};
export const CloseUp: Story = { args: { cameraDistance: 2 } };
export const FullView: Story = { args: { cameraDistance: 4.5 } };