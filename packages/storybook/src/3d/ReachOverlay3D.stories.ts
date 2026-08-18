import type { Meta, StoryObj } from "@storybook/html-vite";
import { createReachOverlay3D } from "@client/client-map-3d-aether-survey-line/client-map-3d-aether-survey-line.js";
import {
  computeLocalReachSet,
  isDormantFrontierTile,
  pylonEdgeOffset,
  reachEdgesForTile,
  samplePerimeterPylons,
  traceReachBoundaryLoops
} from "@client/client-reach-overlay/client-reach-overlay.js";
import type { Tile } from "@client/client-types.js";
import { createGrassGround, createStage, wrapWithCleanup } from "../three-stage.js";

/**
 * The Aether Survey Line -- the real 3D fixed-borders-via-reach overlay
 * (client-map-3d-aether-survey-line.ts) rendered in an actual Three.js
 * scene: sparse brass survey pylons placed only every ~10-15 tiles along
 * the traced reach-boundary perimeter (see client-reach-overlay.ts's
 * traceReachBoundaryLoops/samplePerimeterPylons), connected by hair-thin
 * glowing aether chords with an occasional travelling pulse, plus a "dead"
 * powered-down pylon stub on a dormant-frontier tile. Reuses the exact same
 * pure computeLocalReachSet/isDormantFrontierTile/traceReachBoundaryLoops/
 * samplePerimeterPylons helpers the 2D canvas path and client-map-3d.ts use,
 * so this is only exercising new *rendering* code on top of already-correct
 * logic.
 *
 * This story renders TWO adjacent, non-overlapping empires (see
 * MY_TOWN/ENEMY_TOWN below), each settled out to exactly the real
 * TOWN_REACH_RADIUS (3) -- reach itself is capped at that radius regardless
 * of how much *extra* land is separately marked SETTLED (an earlier version
 * of this story tried enlarging settlement to radius 9 to show more pylons,
 * but that only added unreachable-looking green tiles outside the actual
 * boundary loop, since the boundary tracer only ever walks the true reach
 * edge). A stock ~24-boundary-tile square yields 2-4 sparse pylons per
 * empire at the default ~12-tile spacing -- correct per the brief, and
 * exactly what's shown here; the default camera distance is tuned to frame
 * this actual scale rather than a hoped-for larger one.
 */

const ME = "player-1";
const ENEMY = "player-2";
const GRID = 26;
// Matches the real TOWN_REACH_RADIUS game constant (packages/shared/src/config.ts)
// -- reach itself is capped at this radius regardless of how much *extra*
// land is separately marked SETTLED, so settling beyond it (an earlier
// version of this story tried radius 9) doesn't grow the boundary loop at
// all; it just adds unreachable-looking green tiles outside the visible
// pylon ring. Keep this equal to the real anchor radius so what's on
// screen matches what the boundary tracer actually walks.
const SETTLED_RADIUS = 3;
const MY_TOWN = { x: 8, y: 13 };
// Exactly 7 tiles east of MY_TOWN: with SETTLED_RADIUS/TOWN_REACH_RADIUS = 3
// both squares touch at the x=11 (mine) / x=12 (enemy) edge -- adjacent,
// not overlapping, matching the game's "borders never overlap" rule.
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

  // Fully settle both empires' entire enlarged square (not just the town
  // tile) so each empire's *complete* boundary perimeter renders -- long
  // enough at SETTLED_RADIUS=9 to demonstrate several sparse pylons per
  // side, not just 1-2 isolated posts.
  const settleSquare = (owner: string, center: { x: number; y: number }): void => {
    for (let dy = -SETTLED_RADIUS; dy <= SETTLED_RADIUS; dy += 1) {
      for (let dx = -SETTLED_RADIUS; dx <= SETTLED_RADIUS; dx += 1) {
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
  // structure from before it was unsettled -- renders as a "dead" pylon
  // stub, no glow, no line.
  const dormantX = MY_TOWN.x - SETTLED_RADIUS;
  const dormantY = MY_TOWN.y - SETTLED_RADIUS;
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
    const loops = traceReachBoundaryLoops(reach, reachDeps);
    const { pylons, segments } = samplePerimeterPylons(loops);
    // A survey point stands on the actual boundary line, not the tile
    // center -- see pylonEdgeOffset's doc comment.
    const edgeOffsetFor = (x: number, y: number): { dx: number; dz: number } =>
      pylonEdgeOffset(reachEdgesForTile(x, y, reach, reachDeps));
    for (const point of pylons.flat()) {
      const { dx, dz } = edgeOffsetFor(point.x, point.y);
      overlay.addPylon(point.x - ORIGIN_X + dx, point.y - ORIGIN_Y + dz, 0, 1, nowMs, ownerColor);
    }
    for (const segment of segments.flat()) {
      const from = edgeOffsetFor(segment.from.x, segment.from.y);
      const to = edgeOffsetFor(segment.to.x, segment.to.y);
      overlay.addLineSegment(
        segment.from.x - ORIGIN_X + from.dx,
        segment.from.y - ORIGIN_Y + from.dz,
        0,
        segment.to.x - ORIGIN_X + to.dx,
        segment.to.y - ORIGIN_Y + to.dz,
        0,
        nowMs,
        ownerColor
      );
    }
    for (const tile of tiles.values()) {
      if (tile.ownerId !== ownerId) continue;
      if (isDormantFrontierTile(tile)) {
        overlay.addDormantFrontierTile(tile.x - ORIGIN_X, tile.y - ORIGIN_Y, 0, 1);
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
    cameraDistance: { control: { type: "range", min: 4, max: 40, step: 1 } }
  },
  args: { cameraDistance: 9 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const AetherSurveyLine3D: Story = {};
