import type { Meta, StoryObj } from "@storybook/html-vite";
import { createObservatoryCooldownBadgeOverlay } from "@client/client-map-3d-observatory-cooldown-badge-overlay/client-map-3d-observatory-cooldown-badge-overlay.js";
import { createStage, forEachGridCell, wrapWithCleanup } from "../three-stage.js";

// The "recharging" badge that floats over an owned observatory while its
// crystal-casting cooldown is still running (see
// client-map-3d-observatory-cooldown-badge-overlay.ts). Drives the
// overlay's tick() on its own RAF so the bob animation plays in the
// story — the shared stage only renders, it doesn't advance overlays.

type Args = {
  gridRadius: number;
  spacing: number;
  cameraDistance: number;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#0c1c28" });
  const maxTiles = (args.gridRadius * 2 + 1) ** 2;
  const overlay = createObservatoryCooldownBadgeOverlay(stage.scene, maxTiles);
  forEachGridCell({ radius: args.gridRadius, spacing: args.spacing }, (x, z) => {
    overlay.addInstance(x, z, 0);
  });
  overlay.commit();

  let rafId = 0;
  const animate = (): void => {
    overlay.tick(performance.now());
    rafId = requestAnimationFrame(animate);
  };
  animate();

  return wrapWithCleanup(stage, [() => cancelAnimationFrame(rafId), overlay.dispose]);
};

const meta: Meta<Args> = {
  title: "Aether Abilities/Observatory Cooldown Badge",
  argTypes: {
    gridRadius: { control: { type: "range", min: 0, max: 6, step: 1 } },
    spacing: { control: { type: "range", min: 1, max: 3, step: 0.25 } },
    cameraDistance: { control: { type: "range", min: 3, max: 30, step: 1 } }
  },
  args: { gridRadius: 2, spacing: 1.5, cameraDistance: 8 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Default: Story = {};
export const Single: Story = { args: { gridRadius: 0, cameraDistance: 3 } };
