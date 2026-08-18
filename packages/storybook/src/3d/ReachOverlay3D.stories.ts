import type { Meta, StoryObj } from "@storybook/html-vite";
import { createReachOverlay3D, pylonEdgeOffset } from "@client/client-map-3d-aether-sentry-lattice/client-map-3d-aether-sentry-lattice.js";
import {
  computeLocalReachSet,
  isDormantFrontierTile,
  isReachBoundaryTile
} from "@client/client-reach-overlay/client-reach-overlay.js";
import type { Tile } from "@client/client-types.js";
import { createGrassGround, createStage, wrapWithCleanup } from "../three-stage.js";

/**
 * The Aether Sentry Lattice -- the real 3D fixed-borders-via-reach overlay
 * (client-map-3d-aether-sentry-lattice.ts) rendered in an actual Three.js
 * scene: a chain of small automated sentry pylons (spinning gyroscopic ring
 * cradling a hovering aether-core orb) along the edge of the player's
 * reach, taller ornate corner pylons with a rotating beacon lens where the
 * boundary turns, sagging catenary energy tethers with a travelling spark
 * linking pylons along a straight run, and a "dead" powered-down sentry on
 * a dormant-frontier tile. Reuses the exact same pure
 * computeLocalReachSet/isDormantFrontierTile/isReachBoundaryTile helpers the
 * 2D canvas path uses (see HUD/Reach Border Overlay for that story), so this
 * is only exercising new *rendering* code on top of already-correct logic.
 *
 * This story deliberately renders TWO adjacent, non-overlapping empires
 * (see MY_TOWN/ENEMY_TOWN below, placed exactly 7 tiles apart so their
 * radius-3 reach squares touch edge-to-edge with neither gap nor overlap,
 * matching the game's "borders may never overlap" rule) so the two
 * requirements that mattered most in review are actually demonstrated, not
 * just implemented: each empire's sentries/tethers are tinted in that
 * empire's own color (via effectiveOverlayColor), and the two facing rows
 * of pylons along the contested edge read as clearly separate without
 * visually merging.
 */

const ME = "player-1";
const ENEMY = "player-2";
const GRID = 26;
const MY_TOWN = { x: 8, y: 13 };
// Exactly 7 tiles east of MY_TOWN: with TOWN_REACH_RADIUS = 3 both squares
// touch at the x=11 (mine) / x=12 (enemy) edge -- adjacent, not overlapping.
const ENEMY_TOWN = { x: 15, y: 13 };
const ORIGIN_X = Math.round((MY_TOWN.x + ENEMY_TOWN.x) / 2);
const ORIGIN_Y = MY_TOWN.y;

const PLAYER_COLORS = new Map<string, string>([
  [ME, "#5ec9ff"],
  [ENEMY, "#ff6b6b"]
]);
const effectiveOverlayColor = (ownerId: string): string => PLAYER_COLORS.get(ownerId) ?? "#bdf3ff";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const wrap = (v: number): number => ((v % GRID) + GRID) % GRID;

const makeTile = (overrides: { x: number; y: number } & Record<string, unknown>): Tile =>
  ({ terrain: "LAND", ownershipState: "FRONTIER", ...overrides }) as unknown as Tile;

const buildWorld = (): Map<string, Tile> => {
  const tiles = new Map<string, Tile>();
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) tiles.set(keyFor(x, y), makeTile({ x, y }));
  }

  tiles.set(
    keyFor(MY_TOWN.x, MY_TOWN.y),
    makeTile({
      x: MY_TOWN.x,
      y: MY_TOWN.y,
      ownerId: ME,
      ownershipState: "SETTLED",
      town: { name: "Capital", type: "FARMING", populationTier: "SETTLEMENT" }
    })
  );
  tiles.set(
    keyFor(ENEMY_TOWN.x, ENEMY_TOWN.y),
    makeTile({
      x: ENEMY_TOWN.x,
      y: ENEMY_TOWN.y,
      ownerId: ENEMY,
      ownershipState: "SETTLED",
      town: { name: "Rival Capital", type: "FARMING", populationTier: "SETTLEMENT" }
    })
  );

  // Fully settle both empires' entire radius-3 reach squares (not just the
  // town tile) so each empire's *complete* boundary perimeter renders as a
  // ring of sentries -- this is what actually demonstrates two adjacent,
  // differently-colored borders sitting right next to each other along
  // their shared edge, rather than a couple of isolated posts.
  const settleSquare = (owner: string, center: { x: number; y: number }): void => {
    for (let dy = -3; dy <= 3; dy += 1) {
      for (let dx = -3; dx <= 3; dx += 1) {
        const x = center.x + dx;
        const y = center.y + dy;
        if (x === center.x && y === center.y) continue; // town tile already set above
        tiles.set(keyFor(x, y), makeTile({ x, y, ownerId: owner, ownershipState: "SETTLED" }));
      }
    }
  };
  settleSquare(ME, MY_TOWN);
  settleSquare(ENEMY, ENEMY_TOWN);

  // Dormant-frontier tile: mine, FRONTIER, still holding a leftover
  // structure from before it was unsettled -- renders as a "dead" sentry
  // with a stopped gyroscope ring and unlit core, no outgoing tether.
  const dormantX = MY_TOWN.x - 3;
  const dormantY = MY_TOWN.y - 3;
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

  return tiles;
};

type Args = { cameraDistance: number };

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.85, background: "#0a0e14" });
  const ground = createGrassGround(Math.floor(GRID / 2));
  stage.scene.add(ground.group);

  const tiles = buildWorld();
  const myReach = computeLocalReachSet(tiles, ME);
  const enemyReach = computeLocalReachSet(tiles, ENEMY);
  const overlay = createReachOverlay3D(stage.scene, GRID * GRID);
  const reachDeps = { tiles, keyFor, wrapX: wrap, wrapY: wrap };
  const nowMs = performance.now();

  const addEmpireBoundary = (ownerId: string, reach: ReadonlySet<string>): void => {
    const ownerColor = effectiveOverlayColor(ownerId);
    for (const tile of tiles.values()) {
      if (tile.ownerId !== ownerId) continue;
      const x = tile.x - ORIGIN_X;
      const z = tile.y - ORIGIN_Y;
      const surfaceY = 0;
      if (isDormantFrontierTile(tile)) {
        overlay.addDormantFrontierTile(x, z, surfaceY, 1);
        continue;
      }
      if (!isReachBoundaryTile(tile.x, tile.y, reach, reachDeps)) continue;
      const edges = {
        top: !reach.has(keyFor(wrap(tile.x), wrap(tile.y - 1))),
        right: !reach.has(keyFor(wrap(tile.x + 1), wrap(tile.y))),
        bottom: !reach.has(keyFor(wrap(tile.x), wrap(tile.y + 1))),
        left: !reach.has(keyFor(wrap(tile.x - 1), wrap(tile.y)))
      };
      overlay.addBoundaryTile(x, z, surfaceY, 1, edges, nowMs, ownerColor);
      // Tether endpoints must land on the pylons' actual edge positions
      // (via pylonEdgeOffset, same as addBoundaryTile), not raw tile
      // centers, or the tether would visually disconnect from the posts.
      const { dx: dx0, dz: dz0 } = pylonEdgeOffset(edges);
      const rightTile = tiles.get(keyFor(wrap(tile.x + 1), tile.y));
      if (rightTile?.ownerId === ownerId && isReachBoundaryTile(wrap(tile.x + 1), tile.y, reach, reachDeps)) {
        const rightEdges = {
          top: !reach.has(keyFor(wrap(tile.x + 1), wrap(tile.y - 1))),
          right: !reach.has(keyFor(wrap(tile.x + 2), wrap(tile.y))),
          bottom: !reach.has(keyFor(wrap(tile.x + 1), wrap(tile.y + 1))),
          left: !reach.has(keyFor(wrap(tile.x), wrap(tile.y)))
        };
        const { dx: dx1, dz: dz1 } = pylonEdgeOffset(rightEdges);
        overlay.addTether(x + dx0, z + dz0, surfaceY, x + 1 + dx1, z + dz1, surfaceY, nowMs, ownerColor);
      }
      const bottomTile = tiles.get(keyFor(tile.x, wrap(tile.y + 1)));
      if (bottomTile?.ownerId === ownerId && isReachBoundaryTile(tile.x, wrap(tile.y + 1), reach, reachDeps)) {
        const bottomEdges = {
          top: !reach.has(keyFor(wrap(tile.x), wrap(tile.y))),
          right: !reach.has(keyFor(wrap(tile.x + 1), wrap(tile.y + 1))),
          bottom: !reach.has(keyFor(wrap(tile.x), wrap(tile.y + 2))),
          left: !reach.has(keyFor(wrap(tile.x - 1), wrap(tile.y + 1)))
        };
        const { dx: dx1, dz: dz1 } = pylonEdgeOffset(bottomEdges);
        overlay.addTether(x + dx0, z + dz0, surfaceY, x + dx1, z + 1 + dz1, surfaceY, nowMs, ownerColor);
      }
    }
  };

  overlay.clear();
  // Out-of-reach dimming: any tile visible-but-unreachable from MY
  // perspective (the enemy's inner tiles, from my point of view).
  for (const tile of tiles.values()) {
    if (tile.ownerId === ENEMY && !myReach.has(keyFor(tile.x, tile.y))) {
      overlay.addOutOfReachTile(tile.x - ORIGIN_X, tile.y - ORIGIN_Y, 0, 1);
    }
  }
  addEmpireBoundary(ME, myReach);
  addEmpireBoundary(ENEMY, enemyReach);
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
export const AetherSentryLattice3D: Story = {};
