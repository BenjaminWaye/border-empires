import type { Meta, StoryObj } from "@storybook/html-vite";
import { createReachOverlay3D } from "@client/client-map-3d-reach-overlay/client-map-3d-reach-overlay.js";
import {
  computeLocalReachSet,
  isDormantFrontierTile,
  isReachBoundaryTile
} from "@client/client-reach-overlay/client-reach-overlay.js";
import type { Tile } from "@client/client-types.js";
import { createGrassGround, createStage, wrapWithCleanup } from "../three-stage.js";

/**
 * The real 3D fixed-borders-via-reach overlay (client-map-3d-reach-overlay.ts)
 * rendered in an actual Three.js scene -- the proof the "wrong renderer" bug
 * is fixed: this is the module that now runs when isTrue3DRendererActive()
 * is true, not a flat Canvas2D mockup. Reuses the exact same pure
 * computeLocalReachSet/isDormantFrontierTile/isReachBoundaryTile helpers the
 * 2D canvas path uses (see HUD/Reach Border Overlay for that story), so this
 * is only exercising new *rendering* code on top of already-correct logic.
 */

const ME = "player-1";
const ENEMY = "player-2";
const GRID = 15;
const CENTER = Math.floor(GRID / 2);

const keyFor = (x: number, y: number): string => `${x},${y}`;
const wrap = (v: number): number => ((v % GRID) + GRID) % GRID;

const makeTile = (overrides: { x: number; y: number } & Record<string, unknown>): Tile =>
  ({ terrain: "LAND", ownershipState: "FRONTIER", ...overrides }) as unknown as Tile;

const buildWorld = (): Map<string, Tile> => {
  const tiles = new Map<string, Tile>();
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) tiles.set(keyFor(x, y), makeTile({ x, y }));
  }

  // My town at the center -- radius-3 reach anchor.
  tiles.set(
    keyFor(CENTER, CENTER),
    makeTile({
      x: CENTER,
      y: CENTER,
      ownerId: ME,
      ownershipState: "SETTLED",
      town: { name: "Capital", type: "FARMING", populationTier: "SETTLEMENT" }
    })
  );

  // A short owned arm so the reach boundary has an interesting shape rather
  // than one clean disk.
  for (let x = CENTER - 3; x <= CENTER + 3; x += 1) {
    if (x === CENTER) continue;
    tiles.set(keyFor(x, CENTER), makeTile({ x, y: CENTER, ownerId: ME, ownershipState: "SETTLED" }));
  }

  // Dormant-frontier tile: mine, FRONTIER, still holding a leftover
  // structure from before it was unsettled.
  const dormantX = CENTER - 3;
  const dormantY = CENTER - 3;
  tiles.set(
    keyFor(dormantX, dormantY),
    makeTile({
      x: dormantX,
      y: dormantY,
      ownerId: ME,
      ownershipState: "FRONTIER",
      economicStructure: { ownerId: ME, type: "RELAY_BEACON", status: "active" }
    })
  );

  // Enemy pocket to the south -- visible, but outside my reach.
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = 0; dy <= 1; dy += 1) {
      const x = CENTER + dx;
      const y = CENTER + 4 + dy;
      tiles.set(keyFor(x, y), makeTile({ x, y, ownerId: ENEMY, ownershipState: "SETTLED" }));
    }
  }

  return tiles;
};

type Args = { cameraDistance: number };

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.85, background: "#0a0e14" });
  const ground = createGrassGround(Math.floor(GRID / 2));
  stage.scene.add(ground.group);

  const tiles = buildWorld();
  const reach = computeLocalReachSet(tiles, ME);
  const overlay = createReachOverlay3D(stage.scene, GRID * GRID);
  const reachDeps = { tiles, keyFor, wrapX: wrap, wrapY: wrap };

  overlay.clear();
  for (const tile of tiles.values()) {
    const x = tile.x - CENTER;
    const z = tile.y - CENTER;
    const surfaceY = 0;
    if (tile.ownerId === ME && isDormantFrontierTile(tile)) {
      overlay.addDormantFrontierTile(x, z, surfaceY, 1);
    }
    if (tile.ownerId && tile.ownerId !== ME && !reach.has(keyFor(tile.x, tile.y))) {
      overlay.addOutOfReachTile(x, z, surfaceY, 1);
    }
    if (tile.ownerId === ME && isReachBoundaryTile(tile.x, tile.y, reach, reachDeps)) {
      const edges = {
        top: !reach.has(keyFor(wrap(tile.x), wrap(tile.y - 1))),
        right: !reach.has(keyFor(wrap(tile.x + 1), wrap(tile.y))),
        bottom: !reach.has(keyFor(wrap(tile.x), wrap(tile.y + 1))),
        left: !reach.has(keyFor(wrap(tile.x - 1), wrap(tile.y)))
      };
      overlay.addBoundaryTile(x, z, surfaceY, 1, edges);
    }
  }
  overlay.commit();

  return wrapWithCleanup(stage, [overlay.dispose, ground.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/ReachOverlay3D",
  argTypes: {
    cameraDistance: { control: { type: "range", min: 4, max: 24, step: 1 } }
  },
  args: { cameraDistance: 12 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const ReachAndDormantFrontier3D: Story = {};
