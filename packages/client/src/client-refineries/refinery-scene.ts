// What the map draws for town refineries (docs/territory-development-plan.md,
// Phase 2, Client), shared by both renderers:
//   - supply line: a linked refinery continues the district service line
//     (client-town-district/district-network.ts) from its tile to the nearest
//     tile of its field, following your own land; lines come out as
//     DistrictEdges, so the 2D canvas (district-canvas.ts) and the true-3D
//     pipes (district-links-3d.ts) draw them exactly like the town's own;
//   - moving goods: a working refinery's path, for the loads that travel it
//     (2D refinery-canvas-2d.ts, 3D refinery-goods-3d.ts);
//   - refined deposits: the field tiles it processes, which swap their bare
//     deposit art for the former Mine / Umbrite Rig look
//     (client-map-render-resource-overlays.ts, client-map-3d-raw-resource-dispatch.ts).
// A broken link or a refinery without a field gets no line, no goods and no
// refined tiles; the toast above it (refinery-field-toasts.ts) asks for a field.
//
// The scene covers the refineries around the camera only and is recomputed
// when the tiles, the viewer or the window change; the last one is kept for
// the per-tile overlay lookups of the frame (a single slot, bounded by the
// window, never persisted).
import { REFINERY_REACH_LAND_TILES, MAX_SUPPORT_RING_RADIUS, WORLD_HEIGHT, WORLD_WIDTH, isRefineryType, refineryTileKey, type RefineryFieldResource } from "@border-empires/shared";
import { toroidDelta } from "../client-map-3d-pointer-pick.js";
import { DISTRICT_PORT_RADIUS } from "../client-town-district/district-catalog.js";
import { districtWrapX as wrapX, districtWrapY as wrapY } from "../client-town-district/district-coordinates.js";
import type { DistrictEdge, DistrictPoint } from "../client-town-district/district-network.js";
import type { Tile, TileVisibilityState } from "../client-types.js";
import { refineryStatusFor, type RefineryClientStatus } from "./refinery-client-status.js";

export type RefinerySupplyPath = {
  /** The refinery tile key. */
  key: string;
  townKey: string;
  resource: RefineryFieldResource;
  /** World points from the refinery's port to its field tile, unwrapped (consecutive points are neighbours). */
  points: readonly DistrictPoint[];
  working: boolean;
};

export type RefineryScene = {
  statuses: readonly RefineryClientStatus[];
  paths: readonly RefinerySupplyPath[];
  edges: readonly DistrictEdge[];
  /** Processed field tile key -> its resource, for the refined-deposit overlay. */
  refined: ReadonlyMap<string, RefineryFieldResource>;
};

export type RefinerySceneView = {
  readonly tiles: ReadonlyMap<string, Tile>;
  readonly tilesRevision: number;
  readonly me: string;
};

const EMPTY_SCENE: RefineryScene = { statuses: [], paths: [], edges: [], refined: new Map() };
// A supply path never needs more steps than the refinery's ring offset plus the town's reach.
const MAX_PATH_STEPS = REFINERY_REACH_LAND_TILES + MAX_SUPPORT_RING_RADIUS + 2;

const passable = (tile: Tile | undefined, ownerId: string): tile is Tile =>
  Boolean(tile && tile.terrain === "LAND" && tile.ownerId === ownerId && (tile.ownershipState === "FRONTIER" || tile.ownershipState === "SETTLED"));

const NEIGHBOR_STEPS: ReadonlyArray<readonly [number, number]> = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

/**
 * Tile steps from the refinery to the nearest tile of its field over the
 * owner's land (town tiles are not crossed, so the line leaves the district
 * instead of running through the town model). Among the shortest routes it
 * takes the one heading most directly at the field, so the line reads as a
 * straight run where the land allows. Falls back to a straight line to the
 * nearest field tile when no route over known land exists.
 */
export const refinerySupplySteps = (tiles: ReadonlyMap<string, Tile>, status: RefineryClientStatus): Array<{ x: number; y: number }> => {
  const fields = status.fieldTiles ?? [];
  if (fields.length === 0) return [];
  const start = { x: status.x, y: status.y };
  // The nearest field tile as the crow flies, unwrapped relative to the refinery: what the line aims at.
  let target = start, targetDistance = Infinity;
  for (const field of fields) {
    const dx = toroidDelta(status.x, field.x, WORLD_WIDTH), dy = toroidDelta(status.y, field.y, WORLD_HEIGHT);
    const distance = Math.hypot(dx, dy);
    if (distance < targetDistance) { targetDistance = distance; target = { x: status.x + dx, y: status.y + dy }; }
  }
  // Land steps to the field from every tile near it (multi-source search from the field tiles).
  const steps = new Map<string, number>();
  const queue: Array<{ x: number; y: number }> = [];
  for (const field of fields) { steps.set(refineryTileKey(field.x, field.y), 0); queue.push(field); }
  for (let index = 0; index < queue.length && !steps.has(status.key); index += 1) {
    const at = queue[index]!;
    const depth = steps.get(refineryTileKey(at.x, at.y))!;
    if (depth >= MAX_PATH_STEPS) continue;
    for (const [dx, dy] of NEIGHBOR_STEPS) {
      const next = { x: wrapX(at.x + dx), y: wrapY(at.y + dy) };
      const key = refineryTileKey(next.x, next.y);
      if (steps.has(key)) continue;
      const tile = tiles.get(key);
      if (key !== status.key && (!passable(tile, status.ownerId) || tile.town)) continue;
      steps.set(key, depth + 1);
      queue.push(next);
    }
  }
  if (!steps.has(status.key)) return [start, target];
  // Walk down the step counts from the refinery, preferring the step nearest the target.
  const route = [start];
  let at = start, remaining = steps.get(status.key)!;
  while (remaining > 0) {
    let best: { x: number; y: number } | undefined, bestScore = Infinity;
    for (const [dx, dy] of NEIGHBOR_STEPS) {
      const next = { x: at.x + dx, y: at.y + dy };
      if (steps.get(refineryTileKey(wrapX(next.x), wrapY(next.y))) !== remaining - 1) continue;
      const score = Math.hypot(target.x - next.x, target.y - next.y);
      if (score < bestScore) { bestScore = score; best = next; }
    }
    if (!best) break;
    route.push(best);
    at = best;
    remaining -= 1;
  }
  return route;
};

/** Tile steps to world points: straight runs merged, starting at the refinery model's port and ending in the field tile's centre. */
export const refinerySupplyPoints = (steps: ReadonlyArray<{ x: number; y: number }>): DistrictPoint[] => {
  if (steps.length < 2) return [];
  const corners = [steps[0]!];
  for (let i = 1; i < steps.length - 1; i += 1) {
    const a = steps[i - 1]!, b = steps[i]!, c = steps[i + 1]!;
    if (b.x - a.x !== c.x - b.x || b.y - a.y !== c.y - b.y) corners.push(b);
  }
  corners.push(steps[steps.length - 1]!);
  const points = corners.map(({ x, y }) => ({ x: x + 0.5, y: y + 0.5 }));
  const first = points[0]!, second = points[1]!;
  const length = Math.hypot(second.x - first.x, second.y - first.y) || 1;
  points[0] = { x: first.x + (second.x - first.x) / length * DISTRICT_PORT_RADIUS, y: first.y + (second.y - first.y) / length * DISTRICT_PORT_RADIUS };
  return points;
};

const traceable = (visibilityAt: ((x: number, y: number, tile?: Tile) => TileVisibilityState) | undefined, tiles: ReadonlyMap<string, Tile>, a: DistrictPoint, b: DistrictPoint): boolean => {
  if (!visibilityAt) return true;
  for (let n = 0; n <= 8; n += 1) {
    const x = wrapX(Math.floor(a.x + (b.x - a.x) * n / 8)), y = wrapY(Math.floor(a.y + (b.y - a.y) * n / 8));
    if (visibilityAt(x, y, tiles.get(refineryTileKey(x, y))) !== "visible") return false;
  }
  return true;
};

/** The supply lines, goods paths and refined tiles of the given refinery tiles (others are ignored). */
export const buildRefineryScene = (
  view: RefinerySceneView, candidates: Iterable<Tile>, visibilityAt?: (x: number, y: number, tile?: Tile) => TileVisibilityState
): RefineryScene => {
  const statuses: RefineryClientStatus[] = [];
  const paths: RefinerySupplyPath[] = [];
  const edges: DistrictEdge[] = [];
  const refined = new Map<string, RefineryFieldResource>();
  for (const tile of candidates) {
    const status = refineryStatusFor(view, tile);
    if (!status) continue;
    statuses.push(status);
    if (status.working) for (const key of status.processedTileKeys) refined.set(key, status.resource);
    if (!status.linked || !status.fieldTiles) continue;
    const points = refinerySupplyPoints(refinerySupplySteps(view.tiles, status));
    if (points.length < 2) continue;
    const townKey = status.townKey ?? status.key;
    paths.push({ key: status.key, townKey, resource: status.resource, points, working: status.working });
    for (let i = 1; i < points.length; i += 1) {
      const from = { x: wrapX(points[i - 1]!.x), y: wrapY(points[i - 1]!.y) }, to = { x: wrapX(points[i]!.x), y: wrapY(points[i]!.y) };
      edges.push({ id: `refinery:${status.key}:${i}`, townKey, from, to, active: status.working, buried: false, traceable: traceable(visibilityAt, view.tiles, points[i - 1]!, points[i]!) });
    }
  }
  return { statuses, paths, edges, refined };
};

/** Every refinery tile within the window around (cx, cy), widened by a supply line's length so lines into view are kept. */
export const refineryTilesAround = (tiles: ReadonlyMap<string, Tile>, cx: number, cy: number, halfW: number, halfH: number): Tile[] => {
  const margin = MAX_PATH_STEPS;
  const found: Tile[] = [];
  for (let dy = -halfH - margin; dy <= halfH + margin; dy += 1) {
    for (let dx = -halfW - margin; dx <= halfW + margin; dx += 1) {
      const tile = tiles.get(refineryTileKey(wrapX(cx + dx), wrapY(cy + dy)));
      if (tile && isRefineryType(tile.economicStructure?.type)) found.push(tile);
    }
  }
  return found;
};

let last: { key: string; tiles: ReadonlyMap<string, Tile>; scene: RefineryScene } | undefined;

/**
 * The scene for the window around the camera, recomputed only when the tiles,
 * their revision, the viewer or the window change. The result also becomes
 * the frame's refined-deposit lookup (refinedDepositAt).
 */
export const refinerySceneAround = (
  view: RefinerySceneView, center: { x: number; y: number }, halfW: number, halfH: number,
  visibilityAt?: (x: number, y: number, tile?: Tile) => TileVisibilityState
): RefineryScene => {
  const cx = Math.floor(center.x), cy = Math.floor(center.y);
  const key = `${view.tilesRevision}|${view.me}|${cx},${cy}|${halfW},${halfH}`;
  if (last && last.key === key && last.tiles === view.tiles) return last.scene;
  const scene = buildRefineryScene(view, refineryTilesAround(view.tiles, cx, cy, Math.ceil(halfW), Math.ceil(halfH)), visibilityAt);
  last = { key, tiles: view.tiles, scene };
  return scene;
};

/** The resource a working refinery processes on this tile (refined-deposit overlay), per the last scene. */
export const refinedDepositAt = (x: number, y: number): RefineryFieldResource | undefined => (last?.scene ?? EMPTY_SCENE).refined.get(refineryTileKey(x, y));

/** Test / story hook: forget the last scene. */
export const resetRefineryScene = (): void => { last = undefined; };
