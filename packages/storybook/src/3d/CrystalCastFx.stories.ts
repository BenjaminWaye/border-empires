import type { Meta, StoryObj } from "@storybook/html-vite";
import { createCrystalCastFxLayer } from "@client/client-map-3d-crystal-cast-fx.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  spawnCount: number;
  spacing: number;
  cameraDistance: number;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#0c1220" });
  const layer = createCrystalCastFxLayer(stage.scene);

  const positions: Array<{ x: number; z: number }> = [];
  for (let i = 0; i < args.spawnCount; i += 1) {
    const x = (i - (args.spawnCount - 1) / 2) * args.spacing;
    positions.push({ x, z: 0 });
  }

  const spawnAll = (): void => {
    for (const { x, z } of positions) layer.spawn(x, z, 0, "reveal_empire");
  };

  spawnAll();

  const start = performance.now();
  let lastSpawn = 0;
  let rafId = 0;
  const animate = (): void => {
    const now = performance.now();
    layer.update(now);
    if (now - lastSpawn > 2400) {
      spawnAll();
      lastSpawn = now;
    }
    rafId = requestAnimationFrame(animate);
  };
  animate();

  return wrapWithCleanup(stage, [
    () => cancelAnimationFrame(rafId),
    layer.dispose
  ]);
};

const meta: Meta<Args> = {
  title: "3D Library/CrystalCastFx",
  parameters: {
    docs: { description: { component: "Animated ring effect that plays when a crystal ability is cast. Rings expand outward and fade over ~2.4 s." } }
  },
  argTypes: {
    spawnCount: { control: { type: "range", min: 1, max: 8, step: 1 } },
    spacing: { control: { type: "range", min: 0.8, max: 3, step: 0.25 } },
    cameraDistance: { control: { type: "range", min: 2, max: 14, step: 0.5 } }
  },
  args: { spawnCount: 3, spacing: 1.5, cameraDistance: 5 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Default: Story = {};
export const Single: Story = { args: { spawnCount: 1, cameraDistance: 3 } };
export const Burst: Story = { args: { spawnCount: 6, spacing: 1.2, cameraDistance: 8 } };
