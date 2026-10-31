import { townIdentityForTile } from "../client-town-identity.js";
import { districtWrapX as wrapX, districtWrapY as wrapY } from "./district-coordinates.js";
import { WORLD_HEIGHT, WORLD_WIDTH, supportRingRadiusForTier } from "@border-empires/shared";
import type { Tile, TileVisibilityState } from "../client-types.js";
import { toroidDelta } from "../client-map-3d-pointer-pick.js";
import { DISTRICT_PORT_RADIUS, isDistrictBuilding, isDistrictProject } from "./district-catalog.js";

export type DistrictPoint = { readonly x: number; readonly y: number };
export type DistrictEdge = {
  readonly id: string; readonly townKey: string; readonly from: DistrictPoint; readonly to: DistrictPoint;
  readonly active: boolean; readonly buried: boolean; readonly traceable: boolean;
};
export type DistrictNetworkDeps = {
  readonly tiles: ReadonlyMap<string, Tile>;
  readonly visibilityAt: (x: number, y: number, tile?: Tile) => TileVisibilityState;
  readonly isDormant?: (tile: Tile) => boolean;
};
type Pair = readonly [number, number];
const keyOf = (x: number, y: number): string => `${wrapX(x)},${wrapY(y)}`;
const pointKey = (p: DistrictPoint): string => `${p.x.toFixed(4)},${p.y.toFixed(4)}`;

export const districtRecord = (tile: Tile): Tile["economicStructure"] =>
  tile.economicStructure && (isDistrictBuilding(tile.economicStructure.type) || isDistrictProject(tile.economicStructure.type))
    ? tile.economicStructure : undefined;

export const districtOperational = (tile: Tile, dormant = false): boolean => {
  const record = districtRecord(tile);
  return record?.status === "active" && !dormant &&
    (!("disabledUntil" in record) || (record.disabledUntil ?? 0) <= Date.now());
};

const corridorAllowed = (deps: DistrictNetworkDeps, town: Tile, from: Pair, to: Pair): boolean => {
  const mx = (from[0] + to[0]) / 2;
  const my = (from[1] + to[1]) / 2;
  const samples = from[0] === to[0] ? [[mx - 0.5, my], [mx + 0.5, my]] : [[mx, my - 0.5], [mx, my + 0.5]];
  let supported = false;
  for (const sample of samples) {
    const x = wrapX(town.x + (sample[0] ?? 0));
    const y = wrapY(town.y + (sample[1] ?? 0));
    const tile = deps.tiles.get(keyOf(x, y));
    if (!tile || deps.visibilityAt(x, y, tile) !== "visible" || tile.terrain === "MOUNTAIN") return false;
    if (tile.ownerId && tile.ownerId !== town.ownerId) return false;
    if (isDistrictProject(tile.economicStructure?.type) || tile.afc || tile.naturalWonder) return false;
    if (tile.terrain === "LAND" && tile.ownerId === town.ownerId) supported = true;
  }
  return supported;
};

// At radius two this visits at most 36 tile-boundary junctions. No world scan,
// randomized layout or dependency on the order buildings arrived from the wire.
const corridorRoute = (deps: DistrictNetworkDeps, town: Tile, start: Pair, target: Pair, radius: number): Pair[] | undefined => {
  const id = (p: Pair): string => `${p[0]},${p[1]}`;
  const queue: Pair[][] = [[start]];
  const seen = new Set([id(start)]);
  for (let index = 0; index < queue.length && index < 36; index += 1) {
    const path = queue[index];
    const at = path?.[path.length - 1];
    if (!at || !path) continue;
    if (id(at) === id(target)) return path;
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]] as const) {
      const next = [at[0] + dx, at[1] + dy] as const;
      if (Math.abs(next[0]) > radius + 0.5 || Math.abs(next[1]) > radius + 0.5 || seen.has(id(next))) continue;
      if (!corridorAllowed(deps, town, at, next)) continue;
      seen.add(id(next));
      queue.push([...path, next]);
    }
  }
  return undefined;
};

export const buildDistrictNetwork = (deps: DistrictNetworkDeps, candidates: Iterable<Tile>): DistrictEdge[] => {
  const edges = new Map<string, DistrictEdge>();
  for (const tile of candidates) {
    const record = districtRecord(tile);
    const anchor = record?.supportAnchor;
    if (!record || !anchor || tile.terrain !== "LAND" || tile.ownershipState !== "SETTLED") continue;
    if (deps.visibilityAt(tile.x, tile.y, tile) !== "visible") continue;
    const townKey = keyOf(anchor.x, anchor.y);
    const town = deps.tiles.get(townKey);
    const identity = townIdentityForTile(town);
    if (!town || !identity || town.ownerId !== tile.ownerId || record.ownerId !== tile.ownerId || town.ownershipState !== "SETTLED") continue;
    if (identity.populationTier === "SETTLEMENT" || deps.visibilityAt(town.x, town.y, town) !== "visible") continue;
    const dx = toroidDelta(town.x, tile.x, WORLD_WIDTH);
    const dy = toroidDelta(town.y, tile.y, WORLD_HEIGHT);
    const radius = supportRingRadiusForTier(identity.populationTier);
    if ((!dx && !dy) || Math.max(Math.abs(dx), Math.abs(dy)) > radius) continue;
    const sx = Math.sign(dx) || 1;
    const sy = Math.sign(dy) || 1;
    const length = Math.hypot(Math.sign(dx), Math.sign(dy));
    const socket: Pair = [dx - Math.sign(dx) * DISTRICT_PORT_RADIUS / length, dy - Math.sign(dy) * DISTRICT_PORT_RADIUS / length];
    const start: Pair = [dx ? dx - sx * 0.5 : 0.5, dy ? dy - sy * 0.5 : 0.5];
    const root: Pair = [sx * 0.5, sy * 0.5];
    const active = districtOperational(tile, deps.isDormant?.(tile));
    const townRadius = identity.populationTier === "TOWN" ? 0.36 : identity.populationTier === "CITY" ? 0.4 : 0.427;
    const townPort: Pair = Math.abs(dx) >= Math.abs(dy) ? [sx * townRadius, 0] : [0, sy * townRadius];
    const world = (p: Pair): DistrictPoint => ({ x: wrapX(town.x + 0.5 + p[0]), y: wrapY(town.y + 0.5 + p[1]) });
    const add = (a: Pair, b: Pair, buried = false): void => {
      if (a[0] === b[0] && a[1] === b[1]) return;
      const from = world(a), to = world(b);
      const id = `${townKey}:${[pointKey(from), pointKey(to)].sort().join(":")}`;
      const previous = edges.get(id);
      let traceable = true;
      for (let n = 0; n <= 8; n += 1) {
        const x = wrapX(Math.floor(town.x + 0.5 + a[0] + (b[0] - a[0]) * n / 8));
        const y = wrapY(Math.floor(town.y + 0.5 + a[1] + (b[1] - a[1]) * n / 8));
        if (deps.visibilityAt(x, y, deps.tiles.get(keyOf(x, y))) !== "visible") traceable = false;
      }
      edges.set(id, { id, townKey, from, to, active: active || (previous?.active ?? false), buried, traceable });
    };
    const route = corridorRoute(deps, town, start, root, radius);
    if (!route || tile.fort || tile.afc || tile.naturalWonder || isDistrictProject(tile.economicStructure?.type)) {
      add(socket, townPort, true);
      continue;
    }
    if (!dx || !dy) {
      const turn: Pair = !dx ? [0, start[1]] : [start[0], 0];
      add(socket, turn);
      add(turn, start);
    } else add(socket, start);
    for (let i = 1; i < route.length; i += 1) {
      const a = route[i - 1], b = route[i];
      if (a && b) add(a, b);
    }
    const turn: Pair = Math.abs(dx) >= Math.abs(dy) ? [root[0], 0] : [0, root[1]];
    add(root, turn);
    add(turn, townPort);
  }
  return [...edges.values()].sort((a, b) => a.id.localeCompare(b.id));
};
