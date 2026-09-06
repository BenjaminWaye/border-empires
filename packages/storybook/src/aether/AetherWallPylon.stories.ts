import type { Meta, StoryObj } from "@storybook/html-vite";
import { createAetherWallPylonOverlay } from "@client/client-map-3d-aether-wall-pylon-overlay.js";
import { createAetherWallArcOverlay } from "@client/client-map-3d-aether-wall-arc-overlay.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

// The real 3D anchor pylons that stand at each end of an active Aether
// Wall's tile-edge segments (see client-map-3d-aether-wall-pylon-overlay.ts
// and client-map-3d-aether-wall-arc-overlay.ts). In the live 3D map the
// wall's beam is still painted as a flat 2D glow line, but the flat pylon
// glyphs at each segment's corners are swapped for these frosted-crystal
// spires, strung together by a pulsing electric arc. `segments` places one
// pylon at each corner along a straight run (with one arc per gap between
// them), driven on their own RAF so the crystal pulse, bob, and electric
// flicker all play.

type Args = {
  segments: number;
  cameraDistance: number;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#0c1c28" });
  const maxPylons = Math.max(2, args.segments + 1);
  const overlay = createAetherWallPylonOverlay(stage.scene, maxPylons);
  const arcOverlay = createAetherWallArcOverlay(stage.scene, Math.max(1, args.segments));

  const half = args.segments / 2;
  const faceAngle = Math.PI / 2; // wall runs along +X, pylons face down the line

  let rafId = 0;
  const animate = (): void => {
    const now = performance.now();
    overlay.beginFrame();
    arcOverlay.beginFrame();
    for (let i = 0; i <= args.segments; i += 1) {
      overlay.place(-half + i, 0, 0, faceAngle, now);
      if (i > 0) arcOverlay.place(-half + i - 1, 0.09, 0, -half + i, 0.09, 0, now);
    }
    overlay.endFrame();
    arcOverlay.endFrame();
    rafId = requestAnimationFrame(animate);
  };
  animate();

  return wrapWithCleanup(stage, [() => cancelAnimationFrame(rafId), overlay.dispose, arcOverlay.dispose]);
};

const meta: Meta<Args> = {
  title: "Aether Abilities/Aether Wall Pylon (3D)",
  argTypes: {
    segments: { control: { type: "range", min: 1, max: 3, step: 1 } },
    cameraDistance: { control: { type: "range", min: 2, max: 16, step: 1 } }
  },
  args: { segments: 3, cameraDistance: 6 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Default: Story = {};
export const Single: Story = { args: { segments: 1, cameraDistance: 3 } };
