import type { Meta, StoryObj } from "@storybook/html-vite";
import { createHeightfield, type HeightfieldTerrainKind } from "@client/client-map-3d-heightfield/client-map-3d-heightfield.js";
import { createWaterSurface } from "@client/client-map-3d-water-surface.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type TerrainPattern = "all-grass" | "all-sand" | "checker" | "coastline" | "mountain-ridge" | "mixed" | "diagonal-land-bridge";

type Args = {
  pattern: TerrainPattern;
  showGridlines: boolean;
  withFog: boolean;
  withWater: boolean;
  cameraDistance: number;
  cameraTilt: number;
};

const tileKindForPattern = (pattern: TerrainPattern) => (wx: number, wy: number): HeightfieldTerrainKind => {
  switch (pattern) {
    case "all-grass": return "GRASS";
    case "all-sand": return "SAND";
    case "checker": return (wx + wy) % 2 === 0 ? "GRASS" : "SAND";
    case "coastline": {
      if (wy < -3) return "SEA";
      if (wy < -1) return "COASTAL_SEA";
      if (wy < 0) return "SAND";
      return "GRASS";
    }
    case "mountain-ridge": {
      if (Math.abs(wx) <= 1) return "MOUNTAIN";
      if (Math.abs(wx) <= 3) return "GRASS";
      return "SAND";
    }
    case "mixed": {
      const r = Math.hypot(wx, wy);
      if (r < 1.5) return "MOUNTAIN";
      if (r < 4) return "GRASS";
      if (r < 6) return "SAND";
      if (r < 8) return "COASTAL_SEA";
      return "SEA";
    }
    case "diagonal-land-bridge": {
      // A 2x2 checkerboard block at the origin: LAND at (0,0)/(1,1)
      // (diagonal), SEA at (1,0)/(0,1) (the other diagonal) -- the exact
      // shape that used to read as a pinched-off ring of water around the
      // shared corner regardless of coastWobbleAt (see
      // coastCornerDiagonalBias). Everything outside that 2x2 block is
      // plain sea so the block reads as an isolated land bridge.
      const inBlock = wx >= 0 && wx <= 1 && wy >= 0 && wy <= 1;
      if (inBlock) return (wx + wy) % 2 === 0 ? "GRASS" : "COASTAL_SEA";
      return "SEA";
    }
  }
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({
    cameraDistance: args.cameraDistance,
    cameraTilt: args.cameraTilt,
    background: args.withFog ? "#0e1218" : "#1a2030"
  });
  const hf = createHeightfield();
  // skirtMesh is the vertical wall dropped along every land/sea boundary
  // edge — without it, grazing camera angles at the coastline show empty
  // canvas (a black crack) instead of solid ground under the coast bevel.
  stage.scene.add(hf.mesh, hf.skirtMesh, hf.gridlines);
  hf.setGridlinesVisible(args.showGridlines);

  const tileKindAt = tileKindForPattern(args.pattern);
  hf.rebuild({
    camX: 0,
    camY: 0,
    halfW: 12,
    halfH: 12,
    worldWidth: 240,
    worldHeight: 240,
    tileKindAt
  });

  const water = args.withWater ? createWaterSurface(stage.scene, 25 * 25) : null;
  let rafId = 0;
  if (water) {
    for (let dz = -12; dz <= 12; dz += 1) {
      for (let dx = -12; dx <= 12; dx += 1) {
        const kind = tileKindAt(dx, dz);
        if (kind === "SEA" || kind === "COASTAL_SEA") {
          water.addTile(dx + 0.5, dz + 0.5, kind === "COASTAL_SEA", dx, dz);
        }
      }
    }
    water.commit();
    const start = performance.now();
    const tickWater = (): void => {
      water.tick(performance.now() - start);
      rafId = requestAnimationFrame(tickWater);
    };
    tickWater();
  }

  return wrapWithCleanup(stage, [
    () => { stage.scene.remove(hf.mesh, hf.skirtMesh, hf.gridlines); },
    () => { if (water) cancelAnimationFrame(rafId); },
    () => { water?.dispose(); },
    hf.dispose
  ]);
};

const meta: Meta<Args> = {
  title: "3D Library/Heightfield",
  parameters: {
    docs: { description: { component: "Base terrain mesh. Elevations: deep sea -0.36, coastal sea -0.16, sand 0.07, grass 0.18, mountain 1.15." } }
  },
  argTypes: {
    pattern: { control: "inline-radio", options: ["all-grass", "all-sand", "checker", "coastline", "mountain-ridge", "mixed", "diagonal-land-bridge"] },
    showGridlines: { control: "boolean" },
    withFog: { control: "boolean" },
    withWater: { control: "boolean" },
    cameraDistance: { control: { type: "range", min: 10, max: 60, step: 2 } },
    // Beyond PI/2 tips the camera below the water plane, looking up at its
    // underside -- the DoubleSide regression story below uses this range.
    cameraTilt: { control: { type: "range", min: 0.05, max: Math.PI, step: 0.05 } }
  },
  args: { pattern: "mixed", showGridlines: false, withFog: false, withWater: false, cameraDistance: 24, cameraTilt: 0.6 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Mixed: Story = {};
export const Coastline: Story = { args: { pattern: "coastline", withWater: true } };
export const MountainRidge: Story = { args: { pattern: "mountain-ridge" } };
export const Checker: Story = { args: { pattern: "checker", showGridlines: true } };

// Demonstrates the diagonal land/sea checkerboard connectivity fix
// (coastCornerDiagonalBias in client-map-3d-heightfield-terrain.ts): before
// the fix, the shared corner of the 2x2 diagonal-land block always read as
// a symmetric ring of beach/sea pinching the two land tiles apart, no
// matter how coastWobbleAt was tuned. Zoomed and gridlined so the corner
// under scrutiny is easy to find.
export const DiagonalLandBridge: Story = {
  args: { pattern: "diagonal-land-bridge", showGridlines: true, withWater: true, cameraDistance: 12, cameraTilt: 0.9 }
};
export const AllGrass: Story = { args: { pattern: "all-grass" } };
export const AllSand: Story = { args: { pattern: "all-sand" } };

// Low, near-horizontal camera tilt at the shoreline — the angle that used
// to expose the black crack between the coast bevel and the water plane
// before the skirt wall was added. Compare against `withWater: false` /
// no-skirt manually if you need to see the bug reproduced.
export const GrazingCoastline: Story = {
  args: { pattern: "coastline", withWater: true, cameraTilt: 1.3, cameraDistance: 18 }
};

// Camera parked below the water plane looking up at its underside -- the
// exact angle that used to render solid black (the water mesh only wound a
// front face, and its material never set side: DoubleSide, so anything
// catching the back face saw straight through to empty background) before
// the fix in client-map-3d-water-surface.ts.
export const WaterViewedFromBelow: Story = {
  args: { pattern: "coastline", withWater: true, cameraTilt: 2.6, cameraDistance: 10 }
};
