import type { Meta, StoryObj } from "@storybook/html-vite";
import { createFloatingTextLayer } from "@client/client-map-3d-floating-text/client-map-3d-floating-text.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  text: string;
  color: string;
  respawnIntervalMs: number;
  cameraDistance: number;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#0a0e14" });
  const layer = createFloatingTextLayer(stage.scene);

  const spawn = (): void => {
    layer.spawn(0, 0, 0, args.text, args.color);
  };
  spawn();

  const interval = setInterval(spawn, args.respawnIntervalMs);
  let rafId = 0;
  const animate = (): void => {
    layer.update(performance.now());
    rafId = requestAnimationFrame(animate);
  };
  animate();

  return wrapWithCleanup(stage, [
    () => clearInterval(interval),
    () => cancelAnimationFrame(rafId),
    layer.dispose
  ]);
};

const meta: Meta<Args> = {
  title: "3D Library/FloatingText",
  argTypes: {
    text: { control: "text" },
    color: { control: "color" },
    respawnIntervalMs: { control: { type: "range", min: 300, max: 4000, step: 100 } },
    cameraDistance: { control: { type: "range", min: 2, max: 14, step: 0.5 } }
  },
  args: { text: "+12", color: "#ffdd55", respawnIntervalMs: 1200, cameraDistance: 4 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const GoldGain: Story = {};
export const HealthLoss: Story = { args: { text: "-7", color: "#ff5555" } };
export const Crystal: Story = { args: { text: "+1 crystal", color: "#a0e0ff" } };
