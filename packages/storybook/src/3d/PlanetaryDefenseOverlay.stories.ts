import type { Meta, StoryObj } from "@storybook/html-vite";
import { createPlanetaryDefenseOverlay } from "@client/client-map-3d-planetary-defense-overlay.js";
import { createStage, forEachGridCell, wrapWithCleanup } from "../three-stage.js";

type Args = {
  gridRadius: number;
  spacing: number;
  cameraDistance: number;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#1a1410" });
  const overlay = createPlanetaryDefenseOverlay(stage.scene);
  const rebuild = (): void => {
    overlay.clear();
    let index = 0;
    forEachGridCell({ radius: args.gridRadius, spacing: args.spacing }, (x, z) => {
      // Synthetic, non-adjacent (wx, wy) per cell so every cell is its own
      // patrol rather than being paired up as a capture move.
      overlay.addInstance(`grid-${index}`, x, z, 0, index * 100, 0);
      index += 1;
    });
    overlay.commit();
  };
  rebuild();
  // The soldier pool fills once the marine model finishes loading.
  const reloadTimer = window.setTimeout(rebuild, 1500);

  let rafId = 0;
  const animate = (): void => {
    overlay.tick(performance.now());
    rafId = requestAnimationFrame(animate);
  };
  animate();

  return wrapWithCleanup(stage, [overlay.dispose, () => cancelAnimationFrame(rafId), () => window.clearTimeout(reloadTimer)]);
};

const meta: Meta<Args> = {
  title: "3D Library/PlanetaryDefenseOverlay",
  argTypes: {
    gridRadius: { control: { type: "range", min: 0, max: 3, step: 1 } },
    spacing: { control: { type: "range", min: 1, max: 3, step: 0.25 } },
    cameraDistance: { control: { type: "range", min: 2, max: 30, step: 1 } }
  },
  args: { gridRadius: 1, spacing: 1.25, cameraDistance: 5 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Default: Story = {};
export const Single: Story = { args: { gridRadius: 0, cameraDistance: 2 } };
