import type { Meta, StoryObj } from "@storybook/html-vite";
import { Color, DirectionalLight } from "three";
import { createHeightfield, type HeightfieldTerrainKind } from "@client/client-map-3d-heightfield/client-map-3d-heightfield.js";
import { createHillTerrain } from "@client/client-map-3d-hills.js";
import { createOwnershipOverlay, DEFAULT_SETTLED_EDGE_GLOW, settledEdgeMaskForOwner } from "@client/client-map-3d-ownership-overlay.js";
import { DEFAULT_FRONTIER_HATCH } from "@client/client-map-3d-settled-edge-glow/client-map-3d-frontier-hatch.js";
import { createStage, wrapWithCleanup } from "../../../fixtures/three-stage.js";
import { EDGE_GLOW_OWNER_COLORS, EDGE_GLOW_WORLD_HEIGHT, EDGE_GLOW_WORLD_WIDTH, edgeGlowWorld } from "../../../fixtures/edge-glow-world.js";

// Settled-territory edge glow in 3D (client-settled-edge-glow.ts) on the
// shared two-empire world; the hills inside settled land show the faint
// interior's terrain relief. "Flat" is the pre-glow look for comparison.

type Args = {
  look: "flat" | "edge-glow" | "edge-glow-hatched-frontier";
  interiorOpacity: number;
  rimOpacity: number;
  widthTiles: number;
  lineTiles: number;
  cameraDistance: number;
  cameraTilt: number;
};

const CENTER = 100;
const RISE = 0.022; // OWNERSHIP_RISE_ABOVE_HEIGHTFIELD
const world = edgeGlowWorld(CENTER - Math.floor(EDGE_GLOW_WORLD_WIDTH / 2), CENTER - Math.floor(EDGE_GLOW_WORLD_HEIGHT / 2));
const COLORS: Record<string, Color> = Object.fromEntries(Object.entries(EDGE_GLOW_OWNER_COLORS).map(([id, hex]) => [id, new Color(hex)]));
const tileKindAt = (): HeightfieldTerrainKind => "GRASS";

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: args.cameraTilt, background: "#1a2030" });
  const sun = new DirectionalLight("#fff0c0", 1.6);
  sun.position.set(-14, 9, 6);
  stage.scene.add(sun);

  const hf = createHeightfield();
  stage.scene.add(hf.mesh, hf.skirtMesh, hf.gridlines);
  const hills = createHillTerrain(stage.scene, 64, hf.material);
  const shared = { camX: CENTER, camY: CENTER, halfW: 10, halfH: 8, worldWidth: 240, worldHeight: 240, tileKindAt };
  hf.rebuild({ ...shared, isHillsAt: world.isHillsAt });
  hills.rebuild({ ...shared, isHillsAt: world.isHillsAt });

  const glowOn = args.look !== "flat";
  const overlay = createOwnershipOverlay(stage.scene, world.tiles.size, undefined, undefined, undefined, undefined, {
    ...(glowOn ? { settledEdgeGlow: { ...DEFAULT_SETTLED_EDGE_GLOW, interiorOpacity: args.interiorOpacity, rimOpacity: args.rimOpacity, widthTiles: args.widthTiles, lineTiles: args.lineTiles } } : {}),
    ...(args.look === "edge-glow-hatched-frontier" ? { frontierHatch: DEFAULT_FRONTIER_HATCH } : {})
  });
  for (const tile of world.tiles.values()) {
    const { x: wx, y: wy } = tile;
    const isFrontier = tile.ownershipState === "FRONTIER";
    const mask = isFrontier ? 0 : settledEdgeMaskForOwner(wx, wy, tile.ownerId, world.neighbourDeps);
    // The heightfield puts tile wx at scene x in [wx - camX, wx - camX + 1].
    const x0 = wx - CENTER, x1 = x0 + 1, z0 = wy - CENTER, z1 = z0 + 1;
    const y00 = hf.cornerYAt(wx, wy) + RISE, y10 = hf.cornerYAt(wx + 1, wy) + RISE;
    const y01 = hf.cornerYAt(wx, wy + 1) + RISE, y11 = hf.cornerYAt(wx + 1, wy + 1) + RISE;
    const color = COLORS[tile.ownerId] as Color;
    if (world.isHillsAt(wx, wy)) {
      overlay.addHillTile(x0, x1, z0, z1, y00, y10, y01, y11, color, isFrontier, { north: false, south: false, east: false, west: false }, wx, wy, undefined, mask);
    } else {
      overlay.addTile(x0, y00, z0, x1, y10, z0, x0, y01, z1, x1, y11, z1, color, isFrontier, mask);
    }
  }
  overlay.commit();

  return wrapWithCleanup(stage, [
    () => { stage.scene.remove(hf.mesh, hf.skirtMesh, hf.gridlines, sun); },
    hf.dispose,
    hills.dispose,
    overlay.dispose
  ]);
};

const meta: Meta<Args> = {
  title: "Map/Overlays/Ownership/Edge Glow",
  parameters: {
    docs: { description: { component: "Settled territory fades from a strong rim at its boundary to a faint interior, with a thin darker owner-colour line on the boundary (client-map-3d-settled-edge-glow.ts). Optional hatched frontier reuses the incursion hatch's stripe recipe. 'flat' is today's live look." } }
  },
  argTypes: {
    look: { control: "inline-radio", options: ["flat", "edge-glow", "edge-glow-hatched-frontier"] },
    interiorOpacity: { control: { type: "range", min: 0, max: 0.85, step: 0.05 } },
    rimOpacity: { control: { type: "range", min: 0.3, max: 1, step: 0.05 } },
    widthTiles: { control: { type: "range", min: 0.2, max: 1, step: 0.05 } },
    lineTiles: { control: { type: "range", min: 0, max: 0.1, step: 0.005 } },
    cameraDistance: { control: { type: "range", min: 6, max: 30, step: 1 } },
    cameraTilt: { control: { type: "range", min: 0.2, max: 1.4, step: 0.05 } }
  },
  args: {
    look: "edge-glow",
    interiorOpacity: DEFAULT_SETTLED_EDGE_GLOW.interiorOpacity,
    rimOpacity: DEFAULT_SETTLED_EDGE_GLOW.rimOpacity,
    widthTiles: DEFAULT_SETTLED_EDGE_GLOW.widthTiles,
    lineTiles: DEFAULT_SETTLED_EDGE_GLOW.lineTiles,
    cameraDistance: 16,
    cameraTilt: 0.8
  },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const EdgeGlow: Story = {};
export const EdgeGlowHatchedFrontier: Story = { args: { look: "edge-glow-hatched-frontier" } };
export const FlatToday: Story = { args: { look: "flat" } };
export const CloseUp: Story = { args: { cameraDistance: 8, cameraTilt: 0.9 } };
