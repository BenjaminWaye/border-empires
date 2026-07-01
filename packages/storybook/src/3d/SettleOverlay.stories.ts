import type { Meta, StoryObj } from "@storybook/html-vite";
import { Color } from "three";
import { createSettleOverlay } from "@client/client-map-3d-settle-overlay/client-map-3d-settle-overlay.js";
import { createStage, forEachGridCell, wrapWithCleanup } from "../three-stage.js";

type Args = {
  durationMs: number;
  ownerColor: string;
  gridRadius: number;
  cameraDistance: number;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#101820" });
  const maxTiles = (args.gridRadius * 2 + 1) ** 2;
  const overlay = createSettleOverlay(stage.scene, maxTiles);
  const color = new Color(args.ownerColor);

  const spawnWave = (): void => {
    overlay.clear();
    const startAt = performance.now();
    const resolvesAt = startAt + args.durationMs;
    forEachGridCell({ radius: args.gridRadius, spacing: 1.5 }, (x, z) => {
      overlay.addInstance(x, z, 0, color, startAt, resolvesAt, Math.round(x), Math.round(z));
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
  title: "3D Library/SettleOverlay",
  argTypes: {
    durationMs: { control: { type: "range", min: 500, max: 5000, step: 100 } },
    ownerColor: { control: "color" },
    gridRadius: { control: { type: "range", min: 0, max: 3, step: 1 } },
    cameraDistance: { control: { type: "range", min: 3, max: 16, step: 1 } }
  },
  args: { durationMs: 2000, ownerColor: "#4a8cff", gridRadius: 1, cameraDistance: 7 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Blue: Story = {};
export const Red: Story = { args: { ownerColor: "#ff5a4a" } };
export const Green: Story = { args: { ownerColor: "#5ac06b" } };
export const Slow: Story = { args: { durationMs: 4500 } };
