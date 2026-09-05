import type { Meta, StoryObj } from "@storybook/html-vite";
import { createAetherWallPylonOverlay } from "@client/client-map-3d-aether-wall-pylon-overlay.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

// The real 3D anchor pylons that stand at each end of an active Aether
// Wall's tile-edge segments (see client-map-3d-aether-wall-pylon-overlay.ts).
// In the live 3D map the wall's beam is still painted as a flat 2D glow
// line, but the flat pylon glyphs at each segment's corners are swapped for
// these frosted-crystal spires. `segments` places one pylon at each corner
// along a straight run, driven on their own RAF so the crystal pulse and
// bob animation play.

type Args = {
  segments: number;
  cameraDistance: number;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#0c1c28" });
  const maxPylons = Math.max(2, args.segments + 1);
  const overlay = createAetherWallPylonOverlay(stage.scene, maxPylons);

  const half = args.segments / 2;
  const faceAngle = Math.PI / 2; // wall runs along +X, pylons face down the line

  let rafId = 0;
  const animate = (): void => {
    const now = performance.now();
    overlay.beginFrame();
    for (let i = 0; i <= args.segments; i += 1) {
      overlay.place(-half + i, 0, 0, faceAngle, now);
    }
    overlay.endFrame();
    rafId = requestAnimationFrame(animate);
  };
  animate();

  return wrapWithCleanup(stage, [() => cancelAnimationFrame(rafId), overlay.dispose]);
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
