import type { Meta, StoryObj } from "@storybook/html-vite";
import { createBarbarianOverlay } from "@client/client-map-3d-barbarian-overlay.js";
import { createStage, forEachGridCell, wrapWithCleanup } from "../three-stage.js";

type Args = {
  gridRadius: number;
  spacing: number;
  cameraDistance: number;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#1a1410" });
  const maxTiles = (args.gridRadius * 2 + 1) ** 2;
  const overlay = createBarbarianOverlay(stage.scene, maxTiles);
  let index = 0;
  forEachGridCell({ radius: args.gridRadius, spacing: args.spacing }, (x, z) => {
    // Grid coordinates here are illustrative layout positions, not real
    // tile (wx, wy) — each cell gets a distinct synthetic key/grid position
    // so the overlay treats every instance as its own standing marker
    // rather than trying to pair them up as a capture transition.
    overlay.addInstance(`grid-${index}`, x, z, 0, index * 100, 0, false);
    index += 1;
  });
  overlay.commit();

  let rafId = 0;
  const animate = (): void => {
    overlay.tick(performance.now());
    rafId = requestAnimationFrame(animate);
  };
  animate();

  return wrapWithCleanup(stage, [overlay.dispose, () => cancelAnimationFrame(rafId)]);
};

const meta: Meta<Args> = {
  title: "3D Library/BarbarianOverlay",
  argTypes: {
    gridRadius: { control: { type: "range", min: 0, max: 6, step: 1 } },
    spacing: { control: { type: "range", min: 1, max: 3, step: 0.25 } },
    cameraDistance: { control: { type: "range", min: 3, max: 30, step: 1 } }
  },
  args: { gridRadius: 2, spacing: 1.5, cameraDistance: 10 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Default: Story = {};
export const Single: Story = { args: { gridRadius: 0, cameraDistance: 4 } };
export const Horde: Story = { args: { gridRadius: 5, spacing: 1, cameraDistance: 20 } };
