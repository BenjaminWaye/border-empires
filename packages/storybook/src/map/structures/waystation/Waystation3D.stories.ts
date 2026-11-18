import type { Meta, StoryObj } from "@storybook/html-vite";
import { createWaystationOverlay } from "@client/client-map-3d-waystation-overlay.js";
import { createStage, forEachGridCell, wrapWithCleanup } from "../../../fixtures/three-stage.js";

type Args = {
  gridRadius: number;
  spacing: number;
  cameraDistance: number;
  activated: boolean;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#0d1018" });
  const maxTiles = (args.gridRadius * 2 + 1) ** 2;
  const overlay = createWaystationOverlay(stage.scene, maxTiles);
  forEachGridCell({ radius: args.gridRadius, spacing: args.spacing }, (x, z) => {
    overlay.addInstance(x, z, 0, x, z, { activated: args.activated });
  });
  overlay.commit();

  let rafId = 0;
  const animate = (): void => {
    overlay.update(performance.now());
    rafId = requestAnimationFrame(animate);
  };
  animate();

  return wrapWithCleanup(stage, [() => cancelAnimationFrame(rafId), overlay.dispose]);
};

const meta: Meta<Args> = {
  title: "Map/Structures/Waystation/3D",
  parameters: {
    docs: {
      description: {
        component:
          "Portable Survey Rig: a splayed iron tripod, brass surveying head with a pulsing cyan lens, equipment case, canvas lean-to and bedroll. Human players claim the tile then press Activate; the live map hides consumed rigs. The activated study shows its dim static lens for historical state compatibility."
      }
    }
  },
  argTypes: {
    gridRadius: { control: { type: "range", min: 0, max: 5, step: 1 } },
    spacing: { control: { type: "range", min: 1, max: 3, step: 0.25 } },
    cameraDistance: { control: { type: "range", min: 2, max: 30, step: 1 } },
    activated: { control: "boolean" }
  },
  args: { gridRadius: 2, spacing: 1.5, cameraDistance: 10, activated: false },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Dormant: Story = {};
export const Single: Story = { args: { gridRadius: 0, cameraDistance: 4 } };
export const Activated: Story = { args: { gridRadius: 0, cameraDistance: 4, activated: true } };
export const Field: Story = { args: { gridRadius: 4, spacing: 1.5, cameraDistance: 20, activated: true } };
