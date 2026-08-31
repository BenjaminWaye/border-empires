import type { Meta, StoryObj } from "@storybook/html-vite";
import { DirectionalLight } from "three";
import { createHeightfield, type HeightfieldTerrainKind } from "@client/client-map-3d-heightfield/client-map-3d-heightfield.js";
import { createHillTerrain } from "@client/client-map-3d-hills.js";
import { createWaterSurface } from "@client/client-map-3d-water-surface.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

// TUNDRA is placed by latitude in the real game (a coldness gradient near
// the polar mountain bands, see landBiomeAt in worldgen.ts), not by a hand
// -authored pattern — these patterns are synthetic stand-ins for previewing
// the rendering in isolation, same convention as Heightfield.stories.ts.
//
// Patterns are written in *absolute* world tile coords centered on CENTER,
// not on (0, 0) — same reasoning as HillsOnTerrain.stories.ts: the
// heightfield wraps a negative offset from camX/camY into the top of
// [0, worldWidth) before a pattern ever sees it, so a predicate written in
// terms of small negative coordinates silently never fires (confirmed this
// is also a live bug in Heightfield.stories.ts's own "Coastline" story,
// which renders as solid grass instead of a coastline for the same reason —
// out of scope to fix here, but worth not repeating in a new file).
const CENTER = 100;

type TerrainPattern = "all-tundra" | "tundra-grass-checker" | "polar-gradient" | "tundra-coastline";

type Args = {
  pattern: TerrainPattern;
  showGridlines: boolean;
  cameraDistance: number;
  cameraTilt: number;
};

const tileKindForPattern = (pattern: TerrainPattern) => (wx: number, wy: number): HeightfieldTerrainKind => {
  const x = wx - CENTER;
  const y = wy - CENTER;
  switch (pattern) {
    case "all-tundra":
      return "TUNDRA";
    case "tundra-grass-checker":
      return (x + y) % 2 === 0 ? "TUNDRA" : "GRASS";
    case "polar-gradient": {
      // Stand-in for the real coldness gradient: TUNDRA near the "pole"
      // (low y), fading through GRASS to SAND further from it.
      if (y < -6) return "TUNDRA";
      if (y < 0) return "GRASS";
      return "SAND";
    }
    case "tundra-coastline": {
      if (y < -3) return "SEA";
      if (y < -1) return "COASTAL_SEA";
      return "TUNDRA";
    }
  }
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({
    cameraDistance: args.cameraDistance,
    cameraTilt: args.cameraTilt,
    background: "#1a2030"
  });
  const hf = createHeightfield();
  stage.scene.add(hf.mesh, hf.skirtMesh, hf.gridlines);
  hf.setGridlinesVisible(args.showGridlines);

  const tileKindAt = tileKindForPattern(args.pattern);
  hf.rebuild({
    camX: CENTER,
    camY: CENTER,
    halfW: 12,
    halfH: 12,
    worldWidth: 240,
    worldHeight: 240,
    tileKindAt
  });

  const water = args.pattern === "tundra-coastline" ? createWaterSurface(stage.scene, 25 * 25) : null;
  let rafId = 0;
  if (water) {
    for (let dz = -12; dz <= 12; dz += 1) {
      for (let dx = -12; dx <= 12; dx += 1) {
        const kind = tileKindAt(CENTER + dx, CENTER + dz);
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
    () => cancelAnimationFrame(rafId),
    () => water?.dispose(),
    hf.dispose
  ]);
};

const meta: Meta<Args> = {
  title: "3D Library/Tundra",
  parameters: {
    docs: {
      description: {
        component:
          "TUNDRA's pale frost blue-grey-green painterly texture and slightly-raised elevation (0.20 vs grass's 0.18), previewed against its neighbouring biomes. In the real game it's placed by a latitude-based coldness gradient near the polar mountain bands, not the hand-authored patterns here."
      }
    }
  },
  argTypes: {
    pattern: { control: "inline-radio", options: ["all-tundra", "tundra-grass-checker", "polar-gradient", "tundra-coastline"] },
    showGridlines: { control: "boolean" },
    cameraDistance: { control: { type: "range", min: 10, max: 60, step: 2 } },
    cameraTilt: { control: { type: "range", min: 0.05, max: 1.4, step: 0.05 } }
  },
  args: { pattern: "all-tundra", showGridlines: false, cameraDistance: 24, cameraTilt: 0.6 },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const AllTundra: Story = {};
// The checkerboard case is a known limitation shared with Heightfield.stories.ts's
// own "Checker" story: the heightfield only carries color at shared vertex
// corners, and every corner of a 1-tile checkerboard borders exactly 2
// TUNDRA + 2 GRASS tiles, so it renders as one uniform blended tone rather
// than a visible checker — not a bug specific to TUNDRA's shader mask.
export const TundraGrassChecker: Story = { args: { pattern: "tundra-grass-checker", showGridlines: true } };
export const PolarGradient: Story = { args: { pattern: "polar-gradient", cameraDistance: 30 } };
export const TundraCoastline: Story = { args: { pattern: "tundra-coastline" } };

// Confirms the hills-eligibility fix: a TUNDRA tile that's mechanically a
// hill (isHillsTileAt never checked biome) now actually renders its dome
// instead of drawing flat while still granting the vision bonus.
export const TundraWithHills: Story = {
  render: (args) => {
    const stage = createStage({ cameraDistance: 12, cameraTilt: 0.55, background: "#1a2030" });
    const raking = new DirectionalLight("#fff0c0", 1.8);
    raking.position.set(-14, 9, 6);
    stage.scene.add(raking);

    const hf = createHeightfield();
    stage.scene.add(hf.mesh, hf.skirtMesh, hf.gridlines);
    hf.setGridlinesVisible(args.showGridlines);

    const hillTerrain = createHillTerrain(stage.scene, 512, hf.material);
    const allTundra: HeightfieldTerrainKind = "TUNDRA";
    const isHillsAt = (wx: number, wy: number): boolean => wx === CENTER && wy === CENTER;
    const shared = {
      camX: CENTER, camY: CENTER, halfW: 10, halfH: 10,
      worldWidth: 240, worldHeight: 240,
      tileKindAt: (): HeightfieldTerrainKind => allTundra
    };
    hf.rebuild({ ...shared, isHillsAt });
    hillTerrain.rebuild({ ...shared, isHillsAt });

    return wrapWithCleanup(stage, [
      () => { stage.scene.remove(hf.mesh, hf.skirtMesh, hf.gridlines, raking); },
      hf.dispose,
      hillTerrain.dispose
    ]);
  },
  args: { pattern: "all-tundra", showGridlines: true }
};
