import { MUSTER_TRANSIT_MS_PER_TILE, WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { MUSTER_TRANSIT_MAX_TILES, musterMarchDistanceTiles } from "../muster-config.js";

/**
 * The route a muster flag's company takes to the tile it launches from, and how
 * long that takes. Shared by the simulation (which turns it into the
 * auto-fired attack's travel-time delay, runtime-frontier-command.ts) and the
 * client (which draws the company along it), so both agree on where the
 * troops go.
 *
 * Troops walk over land. Where the straight walk would cross water, they march
 * to a dock, sail a troop transport to the far dock (or a beach beside it, the
 * same crossings a dock attack may make), march out and carry on. Before this
 * the travel time was the straight-line distance and the company walked across
 * the sea.
 */

export type TransitPoint = { readonly x: number; readonly y: number };

export type MusterTransitLeg =
  | { readonly kind: "WALK"; readonly points: readonly TransitPoint[] }
  | { readonly kind: "SAIL"; readonly from: TransitPoint; readonly to: TransitPoint };

export type MusterTransitRoute = {
  readonly legs: readonly MusterTransitLeg[];
  /** Ms each leg takes, in leg order; sums to transitMs. */
  readonly legMs: readonly number[];
  readonly transitMs: number;
};

export type MusterTransitRouteInput = {
  from: TransitPoint;
  to: TransitPoint;
  /** True for land a company can walk over. The two endpoints are always allowed. */
  isPassable: (x: number, y: number) => boolean;
  /** Tiles a troop transport from a dock at (x, y) can land on; empty or undefined when (x, y) is no dock. */
  crossingsFrom: (x: number, y: number) => readonly TransitPoint[] | undefined;
  /** Longest route searched, in steps (a crossing is one step). */
  maxSteps: number;
};

// A troop transport sails faster than a company marches, but boarding and
// coming ashore take time, so every crossing costs at least the floor. The
// ceiling keeps a crossing between far-apart docks from locking a front for
// minutes, as MUSTER_TRANSIT_MAX_TILES does for the march.
export const MUSTER_SAIL_MS_PER_TILE = 750;
export const MUSTER_SAIL_MIN_MS = 4_000;
export const MUSTER_SAIL_MAX_MS = 30_000;

export const musterSailMs = (from: TransitPoint, to: TransitPoint): number =>
  Math.min(MUSTER_SAIL_MAX_MS, Math.max(MUSTER_SAIL_MIN_MS, musterMarchDistanceTiles(from.x, from.y, to.x, to.y) * MUSTER_SAIL_MS_PER_TILE));

const wrap = (value: number, size: number): number => ((value % size) + size) % size;
const sign = (delta: number, size: number): number => {
  const raw = wrap(delta, size);
  if (raw === 0) return 0;
  return raw > size / 2 ? -1 : 1;
};

/** King-move steps from `from` to `to` on the wrapping world (the way a company walks with no obstacle). */
export const straightTransitWalk = (from: TransitPoint, to: TransitPoint): TransitPoint[] => {
  const points: TransitPoint[] = [from];
  let { x, y } = from;
  const limit = musterMarchDistanceTiles(from.x, from.y, to.x, to.y);
  for (let step = 0; step < limit; step += 1) {
    x = wrap(x + sign(to.x - x, WORLD_WIDTH), WORLD_WIDTH);
    y = wrap(y + sign(to.y - y, WORLD_HEIGHT), WORLD_HEIGHT);
    points.push({ x, y });
  }
  return points;
};

const isKingAdjacent = (a: TransitPoint, b: TransitPoint): boolean => musterMarchDistanceTiles(a.x, a.y, b.x, b.y) <= 1;

/**
 * Ms per leg: the march legs share the walk time (capped at
 * MUSTER_TRANSIT_MAX_TILES tiles, floored at one tile, as before) by their
 * length; each crossing adds musterSailMs.
 */
const timeLegs = (legs: readonly MusterTransitLeg[]): { legMs: number[]; transitMs: number } => {
  const walkSteps = legs.map((leg) => (leg.kind === "WALK" ? Math.max(0, leg.points.length - 1) : 0));
  const totalWalkSteps = walkSteps.reduce((sum, steps) => sum + steps, 0);
  const walkMs = Math.min(MUSTER_TRANSIT_MAX_TILES, Math.max(1, totalWalkSteps)) * MUSTER_TRANSIT_MS_PER_TILE;
  const walkLegCount = legs.filter((leg) => leg.kind === "WALK").length;
  const legMs = legs.map((leg, index) => {
    if (leg.kind === "SAIL") return musterSailMs(leg.from, leg.to);
    return totalWalkSteps > 0 ? Math.round((walkMs * walkSteps[index]!) / totalWalkSteps) : Math.round(walkMs / walkLegCount);
  });
  return { legMs, transitMs: legMs.reduce((sum, ms) => sum + ms, 0) };
};

const routeOf = (legs: MusterTransitLeg[]): MusterTransitRoute => ({ legs, ...timeLegs(legs) });

/**
 * Plans the company's route. A straight walk over land is taken as is (the
 * common case, and free); otherwise a breadth-first search over land, with
 * every dock crossing as one extra step, finds the fewest-step route. When no
 * route exists within maxSteps the straight walk is returned, as before this
 * existed, so the attack is never refused for it.
 */
export const planMusterTransitRoute = (input: MusterTransitRouteInput): MusterTransitRoute => {
  const { from, to } = input;
  const straight = straightTransitWalk(from, to);
  const straightClear = straight.slice(1, -1).every((point) => input.isPassable(point.x, point.y));
  if (straightClear) return routeOf([{ kind: "WALK", points: straight }]);

  const keyOf = (x: number, y: number): number => y * WORLD_WIDTH + x;
  const toKey = keyOf(to.x, to.y);
  const parent = new Map<number, { prev: number; point: TransitPoint; sail: boolean }>();
  parent.set(keyOf(from.x, from.y), { prev: -1, point: from, sail: false });
  let frontier: TransitPoint[] = [from];
  let found = false;
  for (let depth = 0; depth < input.maxSteps && frontier.length > 0 && !found; depth += 1) {
    const next: TransitPoint[] = [];
    const visit = (current: TransitPoint, x: number, y: number, sail: boolean): void => {
      const key = keyOf(x, y);
      if (parent.has(key)) return;
      if (key !== toKey && !input.isPassable(x, y)) return;
      parent.set(key, { prev: keyOf(current.x, current.y), point: { x, y }, sail });
      if (key === toKey) found = true;
      next.push({ x, y });
    };
    for (const current of frontier) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx !== 0 || dy !== 0) visit(current, wrap(current.x + dx, WORLD_WIDTH), wrap(current.y + dy, WORLD_HEIGHT), false);
        }
      }
      for (const landing of input.crossingsFrom(current.x, current.y) ?? []) {
        visit(current, landing.x, landing.y, !isKingAdjacent(current, landing));
      }
      if (found) break;
    }
    frontier = next;
  }
  if (!found) return routeOf([{ kind: "WALK", points: straight }]);

  // Walk the parents back from the launch tile, then split at each crossing.
  const steps: Array<{ point: TransitPoint; sail: boolean }> = [];
  for (let key = toKey; key !== -1; ) {
    const entry = parent.get(key)!;
    steps.push({ point: entry.point, sail: entry.sail });
    key = entry.prev;
  }
  steps.reverse();
  const legs: MusterTransitLeg[] = [];
  let walk: TransitPoint[] = [steps[0]!.point];
  for (let index = 1; index < steps.length; index += 1) {
    const step = steps[index]!;
    if (!step.sail) {
      walk.push(step.point);
      continue;
    }
    const dock = walk[walk.length - 1]!;
    if (walk.length > 1) legs.push({ kind: "WALK", points: walk });
    legs.push({ kind: "SAIL", from: dock, to: step.point });
    walk = [step.point];
  }
  if (walk.length > 1) legs.push({ kind: "WALK", points: walk });
  return routeOf(legs);
};
