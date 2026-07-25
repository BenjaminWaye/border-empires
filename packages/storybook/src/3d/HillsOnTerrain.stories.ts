import type { Meta, StoryObj } from "@storybook/html-vite";
import { DirectionalLight } from "three";
import { createHeightfield, type HeightfieldTerrainKind } from "@client/client-map-3d-heightfield/client-map-3d-heightfield.js";
import { createHillTerrain } from "@client/client-map-3d-hills.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

// Hills tiles are excluded from the main heightfield grid and rendered by a
// separate dome mesh (client-map-3d-hills.ts) whose every attribute —
// height, colour, normals — is stitched to the main grid's real per-corner
// data instead of invented locally, so a hill blends seamlessly into flat
// ground (including grass/sand borders) with no visible seam.
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

type TerrainPattern = "single" | "onSandBorder" | "patch" | "ridge" | "scattered";

type Args = {
  pattern: TerrainPattern;
  showGridlines: boolean;
  cameraDistance: number;
  cameraTilt: number;
};

const isHillsForPattern = (pattern: TerrainPattern) => (wx: number, wy: number): boolean => {
  const x = wx - CENTER;
  const y = wy - CENTER;
  switch (pattern) {
    case "single":
      // Exactly one hills tile in an otherwise flat field.
      return x === 0 && y === 0;
    case "onSandBorder":
      // A single hills tile straddling the grass/sand line below — the key
      // test for whether the dome's edge colour actually blends toward
      // sand instead of showing one fixed biome tint.
      return x === 0 && y === 0;
    case "patch":
      return Math.hypot(x, y) < 4;
    case "ridge":
      return Math.abs(x - y) < 2 && Math.hypot(x, y) < 9;
    case "scattered": {
      // A handful of separated single-tile hills — closer to how the
      // noise-based in-game placement scatters hill tiles across a field.
      const points: ReadonlyArray<[number, number]> = [
        [-6, -5], [4, -6], [-3, 4], [6, 3], [0, -8], [-8, 1]
      ];
      return points.some(([px, py]) => px === x && py === y);
    }
  }
};

// Biome is independent of hills placement — a sand strip along one edge so
// the dome is visible against two different ground textures. onSandBorder
// puts the sand line directly through the single hill tile's own footprint.
const tileKindAt = (pattern: TerrainPattern) => (wx: number, _wy: number): HeightfieldTerrainKind => {
  const boundary = pattern === "onSandBorder" ? CENTER : CENTER + 7;
  return wx - boundary >= 0 ? "SAND" : "GRASS";
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({
    cameraDistance: args.cameraDistance,
    cameraTilt: args.cameraTilt,
    background: "#1a2030"
  });
  // The stage's default lighting (ambient 0.55 + a mild sun) is too flat to
  // read terrain relief clearly — normal-based shading needs a directional
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

  const hillTerrain = createHillTerrain(stage.scene, 512, hf.material);

  const isHillsAt = isHillsForPattern(args.pattern);
  const shared = {
    camX: CENTER,
    camY: CENTER,
    halfW: 12,
    halfH: 12,
    worldWidth: 240,
    worldHeight: 240,
    tileKindAt: tileKindAt(args.pattern)
  };
  hf.rebuild({ ...shared, isHillsAt });
  hillTerrain.rebuild({ ...shared, isHillsAt });

  return wrapWithCleanup(stage, [
    () => { stage.scene.remove(hf.mesh, hf.skirtMesh, hf.gridlines, raking); },
    hf.dispose,
    hillTerrain.dispose
  ]);
};

const meta: Meta<Args> = {
  title: "3D Library/HillsOnTerrain",
  parameters: {
    docs: {
      description: {
        component:
          "Hills are drawn by a separate dome mesh, but every attribute at its edges (height, colour, normals) is stitched to the main heightfield's real per-corner data — so an isolated hill pops cleanly out of flat ground with no seam, and blends toward sand correctly if it sits near a biome border."
      }
    }
  },
  argTypes: {
    pattern: { control: "inline-radio", options: ["single", "onSandBorder", "patch", "ridge", "scattered"] },
    showGridlines: { control: "boolean" },
    cameraDistance: { control: { type: "range", min: 8, max: 60, step: 2 } },
    cameraTilt: { control: { type: "range", min: 0.05, max: 1.4, step: 0.05 } }
  },
  args: { pattern: "single", showGridlines: true, cameraDistance: 12, cameraTilt: 0.55 },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const SingleHill: Story = {};
export const SingleHillOnSandBorder: Story = { args: { pattern: "onSandBorder", cameraDistance: 10 } };
export const HillPatch: Story = { args: { pattern: "patch", cameraDistance: 22, showGridlines: false } };
export const HillRidge: Story = { args: { pattern: "ridge", cameraDistance: 30, showGridlines: false } };
export const ScatteredHills: Story = { args: { pattern: "scattered", cameraDistance: 34, showGridlines: false } };
export const LowAngle: Story = { args: { pattern: "single", cameraTilt: 0.2, cameraDistance: 10, showGridlines: false } };
