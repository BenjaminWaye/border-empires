import type { Meta, StoryObj } from "@storybook/html-vite";
import { createWatchtowerOverlay } from "@client/client-map-3d-watchtower-overlay.js";
import { createStage, forEachGridCell, wrapWithCleanup } from "../three-stage.js";

type Args = {
  gridRadius: number;
  spacing: number;
  cameraDistance: number;
  activated: boolean;
  revealing: boolean;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#0d1018" });
  const maxTiles = (args.gridRadius * 2 + 1) ** 2;
  const overlay = createWatchtowerOverlay(stage.scene, maxTiles);
  forEachGridCell({ radius: args.gridRadius, spacing: args.spacing }, (x, z) => {
    overlay.addInstance(x, z, 0, x, z, {
      activated: args.activated,
      ...(args.revealing ? { revealUntil: performance.now() + 60_000 } : {})
    });
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
  title: "3D Library/WatchtowerOverlay",
  parameters: {
    docs: {
      description: {
        component:
          "Watchtower site: a small stone tower + roof, always drawn. While `revealing` is true (the ~10s window right after a player expands onto the tile), a pulsing blue ring appears on the ground beneath it, matching the 2D minimap's flicker."
      }
    }
  },
  argTypes: {
    gridRadius: { control: { type: "range", min: 0, max: 5, step: 1 } },
    spacing: { control: { type: "range", min: 1, max: 3, step: 0.25 } },
    cameraDistance: { control: { type: "range", min: 2, max: 30, step: 1 } },
    activated: { control: "boolean" },
    revealing: { control: "boolean" }
  },
  args: { gridRadius: 2, spacing: 1.5, cameraDistance: 10, activated: false, revealing: false },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Dormant: Story = {};
export const Single: Story = { args: { gridRadius: 0, cameraDistance: 4 } };
export const Revealing: Story = { args: { gridRadius: 0, cameraDistance: 4, activated: true, revealing: true } };
export const Field: Story = { args: { gridRadius: 4, spacing: 1.5, cameraDistance: 20, revealing: true } };
