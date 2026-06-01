import type { Meta, StoryObj } from "@storybook/html-vite";
import { createAetherBridgePylonOverlay } from "@client/client-map-3d-aether-bridge-pylon-overlay.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

// The real 3D anchor pylons that stand at each end of an active Aether
// Bridge (see client-map-3d-aether-bridge-pylon-overlay.ts). In the live
// 3D map the bridge lane is still painted as a flat 2D sea-lane, but the
// flat anchor glyphs are swapped for these perspective pylons. Two are
// placed here facing each other across the gap, driven on their own RAF so
// the energy-core pulse and bob animation play.

type Args = {
  gapTiles: number;
  cameraDistance: number;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#0c1c28" });
  const overlay = createAetherBridgePylonOverlay(stage.scene, 4);

  const half = args.gapTiles / 2;
  // Two endpoints along the X axis; each faces the other (±Z gate axis is
  // rotated to point down the lane via the faceAngle argument).
  const faceAngle = Math.atan2(half - -half, 0); // lane runs along +X

  let rafId = 0;
  const animate = (): void => {
    const now = performance.now();
    overlay.beginFrame();
    overlay.place(-half, 0, 0, faceAngle, now);
    overlay.place(half, 0, 0, faceAngle + Math.PI, now);
    overlay.endFrame();
    rafId = requestAnimationFrame(animate);
  };
  animate();

  return wrapWithCleanup(stage, [() => cancelAnimationFrame(rafId), overlay.dispose]);
};

const meta: Meta<Args> = {
  title: "Aether Abilities/Aether Bridge Pylon (3D)",
  argTypes: {
    gapTiles: { control: { type: "range", min: 1, max: 8, step: 0.5 } },
    cameraDistance: { control: { type: "range", min: 2, max: 16, step: 1 } }
  },
  args: { gapTiles: 4, cameraDistance: 6 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Default: Story = {};
export const Single: Story = { args: { gapTiles: 0, cameraDistance: 3 } };
