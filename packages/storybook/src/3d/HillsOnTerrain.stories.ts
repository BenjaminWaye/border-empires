import type { Meta, StoryObj } from "@storybook/html-vite";
import { DirectionalLight } from "three";
import { createHeightfield, type HeightfieldTerrainKind } from "@client/client-map-3d-heightfield/client-map-3d-heightfield.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

// This story renders hills the way the game actually composes them: the
// heightfield raises a hills tile's elevation (HEIGHTFIELD_HILLS_ELEVATION_BONUS
// plus a per-tile HILLS_BUMP_JITTER on the GRASS/SAND base), blended smoothly
// into flat neighbours by the heightfield's own corner averaging. There is no
// separate "hill" prop — sculpted, shaded terrain carries the whole effect,
// the same way Civ-style hills are just raised, unevenly-lit ground rather
// than a shape sitting on top of it.
//
// Patterns are defined in *absolute* world tile coords centered on CENTER,
// not on (0, 0) — the heightfield wraps negative offsets from camX/camY into
// the top of [0, worldWidth), so a pattern written in terms of small
// negative coordinates would silently miss itself inside the heightfield's
// own tile sampling (it only ever samples true world coords). Centering the
// camera and every predicate on a real in-range coordinate sidesteps that
// entirely; the render-loop math below still recenters to (0, 0) for the
// actual 3D scene position so the framing looks the same either way.
const CENTER = 100;

type TerrainPattern = "patch" | "ridge" | "scattered";

type Args = {
  pattern: TerrainPattern;
  showGridlines: boolean;
  cameraDistance: number;
  cameraTilt: number;
};

// A round hill patch in the middle of an otherwise flat grass field, with a
// sand strip along one edge so you can see the bump against two biomes.
const isHillsForPattern = (pattern: TerrainPattern) => (wx: number, wy: number): boolean => {
  const x = wx - CENTER;
  const y = wy - CENTER;
  switch (pattern) {
    case "patch":
      return Math.hypot(x, y) < 4;
    case "ridge":
      return Math.abs(x - y) < 2 && Math.hypot(x, y) < 9;
    case "scattered": {
      // A handful of small, separated blobs rather than one contiguous mass —
      // closer to how the noise-based in-game placement actually scatters
      // hill regions across a grass field.
      const blobs: ReadonlyArray<[number, number, number]> = [
        [-6, -5, 2.2],
        [4, -6, 1.8],
        [-3, 4, 2.4],
        [6, 3, 1.6]
      ];
      return blobs.some(([bx, by, r]) => Math.hypot(x - bx, y - by) < r);
    }
  }
};

// Biome is independent of hills placement — a sand strip along one edge so
// the elevation bump is visible against two different ground textures.
const tileKindAt = (wx: number, _wy: number): HeightfieldTerrainKind => (wx - CENTER > 7 ? "SAND" : "GRASS");

const render = (args: Args): HTMLElement => {
  const stage = createStage({
    cameraDistance: args.cameraDistance,
    cameraTilt: args.cameraTilt,
    background: "#1a2030"
  });
  // The stage's default lighting (ambient 0.55 + a mild sun) is too flat to
  // read subtle terrain relief — normal-based shading needs a directional
  // light strong enough, relative to ambient, to visibly darken the side of
  // a rise facing away from it. This mirrors the real game's atmosphere sun
  // (client-map-3d-atmosphere.ts), which is far stronger than the generic
  // preview rig here.
  const raking = new DirectionalLight("#fff0c0", 1.8);
  raking.position.set(-14, 9, 6);
  stage.scene.add(raking);

  const hf = createHeightfield();
  stage.scene.add(hf.mesh, hf.skirtMesh, hf.gridlines);
  hf.setGridlinesVisible(args.showGridlines);

  const isHillsAt = isHillsForPattern(args.pattern);
  hf.rebuild({
    camX: CENTER,
    camY: CENTER,
    halfW: 12,
    halfH: 12,
    worldWidth: 240,
    worldHeight: 240,
    tileKindAt,
    isHillsAt
  });

  return wrapWithCleanup(stage, [
    () => { stage.scene.remove(hf.mesh, hf.skirtMesh, hf.gridlines, raking); },
    hf.dispose
  ]);
};

const meta: Meta<Args> = {
  title: "3D Library/HillsOnTerrain",
  parameters: {
    docs: {
      description: {
        component:
          "Hills rendered the way the game actually composes them: the heightfield raises a hills tile's elevation (HEIGHTFIELD_HILLS_ELEVATION_BONUS plus a per-tile bump) on top of the GRASS/SAND base, smoothly blended into flat neighbours by the heightfield's normal corner-averaging. No separate prop — the sculpted, shaded terrain is the whole effect."
      }
    }
  },
  argTypes: {
    pattern: { control: "inline-radio", options: ["patch", "ridge", "scattered"] },
    showGridlines: { control: "boolean" },
    cameraDistance: { control: { type: "range", min: 8, max: 60, step: 2 } },
    cameraTilt: { control: { type: "range", min: 0.05, max: 1.4, step: 0.05 } }
  },
  args: { pattern: "patch", showGridlines: false, cameraDistance: 22, cameraTilt: 0.55 },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const HillPatch: Story = {};
export const HillRidge: Story = { args: { pattern: "ridge", cameraDistance: 30 } };
export const ScatteredHills: Story = { args: { pattern: "scattered", cameraDistance: 34 } };
export const LowAngle: Story = { args: { pattern: "patch", cameraTilt: 0.2, cameraDistance: 16 } };
