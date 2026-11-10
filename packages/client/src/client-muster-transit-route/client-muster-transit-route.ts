import {
  DOCK_LANDING_RADIUS,
  MUSTER_MARCH_MAX_ROUTE_STEPS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  dockLandingGroundCoords,
  planMusterTransitRoute,
  type MusterTransitRoute,
  type TransitPoint
} from "@border-empires/shared";
import { clientTerrainAt, type DockLandingState } from "../client-dock-landing-ground/client-dock-landing-ground.js";

/**
 * Client side of a muster company's route (packages/shared
 * muster-transit-route): from its flag to the tile it launches from, over
 * land and through a dock with a troop-transport crossing where the straight
 * walk would cross water. Read from the client's own tiles and dock pairs,
 * the same inputs the landing-ground rule uses, so the company is drawn along
 * the route the simulation timed. Tiles the client hasn't seen count as land.
 *
 * The 3D overlay asks for it every frame, so routes are memoised by
 * endpoints. Bounded: at most ROUTE_MEMO_MAX entries, oldest evicted first,
 * and dropped whenever the dock pairs change.
 */
const ROUTE_MEMO_MAX = 32;
const routeMemo = new Map<string, MusterTransitRoute>();
let memoDockPairs: DockLandingState["dockPairs"] | undefined;

/** Where a troop transport from each dock tile may land: every linked dock and the beaches beside it. */
const landingsByDock = (state: DockLandingState): Map<string, TransitPoint[]> => {
  const terrainAt = clientTerrainAt(state.tiles);
  const out = new Map<string, TransitPoint[]>();
  const add = (fromX: number, fromY: number, toX: number, toY: number): void => {
    const key = `${fromX},${fromY}`;
    const list = out.get(key) ?? [];
    // Same ground the simulation's dock landing index lists; the route search
    // itself skips any of it that isn't walkable land.
    for (const point of dockLandingGroundCoords(toX, toY, terrainAt)) {
      if (point.x !== fromX || point.y !== fromY) list.push(point);
    }
    out.set(key, list);
  };
  for (const pair of state.dockPairs) {
    add(pair.ax, pair.ay, pair.bx, pair.by);
    add(pair.bx, pair.by, pair.ax, pair.ay);
  }
  return out;
};

export const clientMusterTransitRoute = (state: DockLandingState, from: TransitPoint, to: TransitPoint): MusterTransitRoute => {
  if (memoDockPairs !== state.dockPairs) {
    routeMemo.clear();
    memoDockPairs = state.dockPairs;
  }
  const key = `${from.x},${from.y}>${to.x},${to.y}`;
  const cached = routeMemo.get(key);
  if (cached) return cached;
  let landings: Map<string, TransitPoint[]> | undefined;
  const route = planMusterTransitRoute({
    from,
    to,
    isPassable: (x, y) => {
      const terrain = state.tiles.get(`${x},${y}`)?.terrain;
      return terrain === undefined || terrain === "LAND";
    },
    crossingsFrom: (x, y) => {
      landings ??= landingsByDock(state);
      return landings.get(`${x},${y}`);
    },
    maxSteps: MUSTER_MARCH_MAX_ROUTE_STEPS
  });
  routeMemo.set(key, route);
  while (routeMemo.size > ROUTE_MEMO_MAX) {
    const oldest = routeMemo.keys().next().value;
    if (oldest === undefined) break;
    routeMemo.delete(oldest);
  }
  return route;
};

const wrappedGap = (a: number, b: number, size: number): number => {
  const raw = Math.abs(a - b) % size;
  return Math.min(raw, size - raw);
};
const nearTile = (a: TransitPoint, b: TransitPoint): boolean =>
  wrappedGap(a.x, b.x, WORLD_WIDTH) <= DOCK_LANDING_RADIUS && wrappedGap(a.y, b.y, WORLD_HEIGHT) <= DOCK_LANDING_RADIUS;

/**
 * Where a troop transport sails for a crossing from the dock at `from` to the
 * landing `to` (the linked dock, or a beach beside it): departure dock, the
 * pair's charted sea lane when the client has one, then the landing. Without
 * a charted lane it is the straight line between the two.
 */
export const sailPath = (state: Pick<DockLandingState, "dockPairs">, from: TransitPoint, to: TransitPoint): TransitPoint[] => {
  for (const pair of state.dockPairs) {
    const fromA = pair.ax === from.x && pair.ay === from.y;
    const fromB = pair.bx === from.x && pair.by === from.y;
    const far = fromA ? { x: pair.bx, y: pair.by } : fromB ? { x: pair.ax, y: pair.ay } : undefined;
    if (!far || !nearTile(far, to)) continue;
    const lane = pair.route ?? [];
    return [from, ...(fromA ? lane : [...lane].reverse()), to];
  }
  return [from, to];
};

export type ActiveTransitLeg =
  | { kind: "WALK"; points: readonly TransitPoint[]; startAt: number; endAt: number; last: boolean }
  | { kind: "SAIL"; from: TransitPoint; to: TransitPoint; startAt: number; endAt: number };

/**
 * The leg the company is on at `nowMs`, with its own time window: the route's
 * leg times scaled to [startAt, arriveAt] (the server's transitEndsAt is the
 * authority; the client only spreads it over the legs). Undefined once arrived.
 */
export const activeTransitLeg = (route: MusterTransitRoute, startAt: number, arriveAt: number, nowMs: number): ActiveTransitLeg | undefined => {
  const total = route.legMs.reduce((sum, ms) => sum + ms, 0) || 1;
  const span = Math.max(1, arriveAt - startAt);
  let legStart = startAt;
  for (let index = 0; index < route.legs.length; index += 1) {
    const leg = route.legs[index]!;
    const last = index === route.legs.length - 1;
    const legEnd = last ? arriveAt : legStart + (span * route.legMs[index]!) / total;
    if (nowMs < legEnd || last) {
      return leg.kind === "WALK"
        ? { kind: "WALK", points: leg.points, startAt: legStart, endAt: legEnd, last }
        : { kind: "SAIL", from: leg.from, to: leg.to, startAt: legStart, endAt: legEnd };
    }
    legStart = legEnd;
  }
  return undefined;
};
