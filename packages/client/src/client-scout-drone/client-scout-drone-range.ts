// The per-leg range limit made visible while planning a scout flight (Playtest Run 5, d3-1540-explorer:
// "Drones have a max range. Nothing ever said so"; four charges were spent on a relic out of reach).
// A leg crosses at most SCOUT_DRONE_MAX_LEG_TILES open tiles (own, allied and reach ground is free), so
// the edge is found the way the drone flies: a leg cast toward every tile round a wide square, and
// where a leg is cut at the limit is a point on the edge. Both renderers draw these tiles as a dotted
// ring (2D: client-map-render-2d-scout-range.ts; true 3D: client-map-3d-scout-drone-plan-overlay.ts).
// The rule itself is unchanged (packages/shared/src/scout-drone/scout-drone-route.ts).
import { SCOUT_DRONE_MAX_LEG_TILES, scoutDroneLeg, type ScoutDroneWorld } from "@border-empires/shared";
import { clientScoutWorld, flyingScoutDrone, ownActiveAfcs, scoutPlanBlocked, scoutPlanCapacity, scoutPlanLaunch, scoutPlanPreview, type ScoutPlanState } from "./client-scout-drone-plan.js";

type Point = { x: number; y: number };

/** How far round the start the legs are cast: twice the range, so a leg that starts over home ground still reaches its limit. */
export const SCOUT_RANGE_CAST_RADIUS = SCOUT_DRONE_MAX_LEG_TILES * 2;
/** At most this many AFCs get a ring before the first stop (each one is a possible launch). */
const MAX_AFC_RINGS = 4;

/** The tiles where a leg from `from` reaches its range limit: the edge of where one more stop can go. */
export const scoutRangeEdge = (from: Point, world: ScoutDroneWorld, radius: number = SCOUT_RANGE_CAST_RADIUS): Point[] => {
  const edge = new Map<string, Point>();
  const cast = (dx: number, dy: number): void => {
    const leg = scoutDroneLeg(from, { x: from.x + dx, y: from.y + dy }, world);
    if (leg.clamped) edge.set(`${leg.end.x},${leg.end.y}`, { x: leg.end.x, y: leg.end.y });
  };
  for (let d = -radius; d < radius; d += 1) {
    cast(d, -radius);
    cast(radius, d);
    cast(-d, radius);
    cast(-radius, -d);
  }
  return [...edge.values()];
};

/**
 * Where the next leg would start: the last stop as the route reaches it, else where a flying drone takes new
 * stops on, else each active AFC. None when no stop can be added (no charge left, or a border ends the route).
 */
export const scoutRangeOrigins = (state: ScoutPlanState, nowMs: number): Point[] => {
  const plan = state.scoutDronePicking;
  if (!plan.active || plan.stops.length >= scoutPlanCapacity(state, nowMs)) return [];
  const preview = scoutPlanPreview(state, plan.stops, nowMs);
  if (preview && (scoutPlanBlocked(preview) || preview.route.legs.at(-1)?.blocked)) return [];
  const last = preview?.route.stops.at(-1);
  if (last) return [last];
  const afcs = ownActiveAfcs(state);
  const first = afcs[0];
  if (!first) return [];
  if (flyingScoutDrone(state, nowMs)) {
    const anchor = scoutPlanLaunch(state, first, nowMs);
    return anchor ? [anchor] : [];
  }
  return afcs.slice(0, MAX_AFC_RINGS);
};

let cache: { key: string; edge: Point[] } | undefined;

/** Everything the ring reads, so it is cast again only when the plan or the map changes (it is drawn every frame). */
const rangeKey = (state: ScoutPlanState, nowMs: number, origins: readonly Point[]): string =>
  `${origins.map((p) => `${p.x},${p.y}`).join(";")}|${state.tilesRevision}|${state.serverReachRevision}|${state.me}|${state.allies.join(",")}`;

/** The range ring's tiles for the plan open now (empty when none is open or no stop can be added). */
export const scoutPlanRangeEdge = (state: ScoutPlanState, nowMs: number): Point[] => {
  const origins = scoutRangeOrigins(state, nowMs);
  if (origins.length === 0) return [];
  const key = rangeKey(state, nowMs, origins);
  if (cache?.key === key) return cache.edge;
  const world = clientScoutWorld(state);
  const edge = origins.flatMap((origin) => scoutRangeEdge(origin, world));
  cache = { key, edge };
  return edge;
};
