import type { Meta, StoryObj } from "@storybook/html";
import { createAttackOverlay } from "@client/client-map-3d-attack-overlay.js";
import { createStage, forEachGridCell, wrapWithCleanup } from "../three-stage.js";

type Args = {
  durationMs: number;
  gridRadius: number;
  cameraDistance: number;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#1d1010" });
  const maxTiles = (args.gridRadius * 2 + 1) ** 2;
  const overlay = createAttackOverlay(stage.scene, maxTiles);

  const spawnWave = (): void => {
    overlay.clear();
    const resolvesAt = performance.now() + args.durationMs;
    forEachGridCell({ radius: args.gridRadius, spacing: 1.5 }, (x, z) => {
      overlay.addInstance(x, z, 0, resolvesAt);
    });
    overlay.commit();
  };

  spawnWave();
  const interval = setInterval(spawnWave, args.durationMs);

  let rafId = 0;
  const animate = (): void => {
    overlay.tick(performance.now());
    rafId = requestAnimationFrame(animate);
  };
  animate();

  return wrapWithCleanup(stage, [
    () => clearInterval(interval),
    () => cancelAnimationFrame(rafId),
    overlay.dispose
  ]);
};

const meta: Meta<Args> = {
  title: "3D Library/AttackOverlay",
  argTypes: {
    durationMs: { control: { type: "range", min: 500, max: 4000, step: 100 } },
    gridRadius: { control: { type: "range", min: 0, max: 4, step: 1 } },
    cameraDistance: { control: { type: "range", min: 3, max: 20, step: 1 } }
  },
  args: { durationMs: 1500, gridRadius: 1, cameraDistance: 8 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Default: Story = {};
export const FastTick: Story = { args: { durationMs: 700 } };
export const SlowTick: Story = { args: { durationMs: 3000 } };
export const ManyTiles: Story = { args: { gridRadius: 3, cameraDistance: 14 } };
