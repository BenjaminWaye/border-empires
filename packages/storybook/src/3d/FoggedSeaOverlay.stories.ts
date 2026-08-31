import type { Meta, StoryObj } from "@storybook/html-vite";
import { Color } from "three";
import { createWaterSurface } from "@client/client-map-3d-water-surface.js";
import { createOwnershipOverlay } from "@client/client-map-3d-ownership-overlay.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

// Regression scene for the "fogged sea renders solid black" bug
// (client-map-3d.ts's fog branch, terrain === "SEA"/"COASTAL_SEA" case):
// left half reproduces the pre-fix behavior (only the black darken overlay,
// nothing underneath, same as the real fog branch drew for sea before the
// fix), right half is the fix (the same live water quad visible sea gets).
// Background matches the game's FOG_COLOR (#000000) so the left panel's
// "black quad over a black background" failure is visible exactly as a
// player would see it -- not just theoretically, but pixel-for-pixel.
type Args = { gridRadius: number };

const TILE_GAP = 0.15; // world-unit gap between the two panels

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: 16, background: "#000000" });

  const water = createWaterSurface(stage.scene, (args.gridRadius * 2 + 1) ** 2);
  const darken = createOwnershipOverlay(stage.scene, (args.gridRadius * 2 + 1) ** 2, { settled: 0.65, frontier: 0.65 });
  const black = new Color(0x000000);

  const panelOffset = args.gridRadius + 1 + TILE_GAP;
  for (let dz = -args.gridRadius; dz <= args.gridRadius; dz += 1) {
    for (let dx = -args.gridRadius; dx <= args.gridRadius; dx += 1) {
      // Left panel ("before"): only the black darken overlay, exactly what
      // the fog branch drew for a sea tile before the fix -- a flat black
      // quad at water level with nothing underneath.
      const bx = dx - panelOffset;
      darken.addTile(
        bx - 0.5, 0, dz - 0.5,
        bx + 0.5, 0, dz - 0.5,
        bx - 0.5, 0, dz + 0.5,
        bx + 0.5, 0, dz + 0.5,
        black,
        false
      );

      // Right panel ("after"): the fix -- the same live water quad visible
      // sea tiles get.
      const ax = dx + panelOffset;
      water.addTile(ax, dz, true, ax, dz);
    }
  }
  darken.commit();
  water.commit();

  let rafId = 0;
  const start = performance.now();
  const tickWater = (): void => {
    water.tick(performance.now() - start);
    rafId = requestAnimationFrame(tickWater);
  };
  tickWater();

  return wrapWithCleanup(stage, [
    () => cancelAnimationFrame(rafId),
    water.dispose,
    darken.dispose
  ]);
};

const meta: Meta<Args> = {
  title: "3D Library/FoggedSeaOverlay (bug regression)",
  argTypes: {
    gridRadius: { control: { type: "range", min: 1, max: 8, step: 1 } }
  },
  args: { gridRadius: 4 },
  render
};

export default meta;

type Story = StoryObj<Args>;

export const BeforeAndAfter: Story = {};
