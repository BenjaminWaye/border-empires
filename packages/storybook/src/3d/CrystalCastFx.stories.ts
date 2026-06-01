import type { Meta, StoryObj } from "@storybook/html-vite";
import { createCrystalCastFxLayer } from "@client/client-map-3d-crystal-cast-fx.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = { count: number; cameraDistance: number };

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#0f1520" });
  const fx = createCrystalCastFxLayer(stage.scene);
  for (let i = 0; i < args.count; i += 1) fx.spawn((i - (args.count - 1) / 2) * 1.5, 0, 0, "aether_lance");
  const start = performance.now();
  const tick = (): void => {
    fx.update(performance.now());
    if (performance.now() - start < 2800) requestAnimationFrame(tick);
  };
  tick();
  return wrapWithCleanup(stage, [fx.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/CrystalCastFx",
  args: { count: 1, cameraDistance: 4.5 },
  render
};
export default meta;
type Story = StoryObj<Args>;
export const Single: Story = {};
export const Trio: Story = { args: { count: 3, cameraDistance: 8 } };
