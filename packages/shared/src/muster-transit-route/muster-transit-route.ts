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
  /** Tiles a troop transport from a dock at (x, y) can land on; empty or undefined when (x, y) is no dock the marching player may sail from. */
  crossingsFrom: (x: number, y: number) => readonly TransitPoint[] | undefined;
  /** The marching player's aether bridges from (x, y): crossed on foot, as one step. */
  bridgesFrom?: (x: number, y: number) => readonly TransitPoint[] | undefined;
  /** Longest route searched, in tiles of marching, plus up to MUSTER_SAIL_MAX_MS of sailing. */
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
 * length; each crossing adds musterSailMs, and all crossings together are
 * capped at MUSTER_SAIL_MAX_MS so a chain of crossings can't lock a front for
 * minutes either.
 */
const timeLegs = (legs: readonly MusterTransitLeg[]): { legMs: number[]; transitMs: number } => {
  const walkSteps = legs.map((leg) => (leg.kind === "WALK" ? Math.max(0, leg.points.length - 1) : 0));
  const totalWalkSteps = walkSteps.reduce((sum, steps) => sum + steps, 0);
  const walkMs = Math.min(MUSTER_TRANSIT_MAX_TILES, Math.max(1, totalWalkSteps)) * MUSTER_TRANSIT_MS_PER_TILE;
  const walkLegCount = legs.filter((leg) => leg.kind === "WALK").length;
  const sailMs = legs.map((leg) => (leg.kind === "SAIL" ? musterSailMs(leg.from, leg.to) : 0));
  const totalSailMs = sailMs.reduce((sum, ms) => sum + ms, 0);
  const sailScale = totalSailMs > MUSTER_SAIL_MAX_MS ? MUSTER_SAIL_MAX_MS / totalSailMs : 1;
  const legMs = legs.map((leg, index) => {
    if (leg.kind === "SAIL") return Math.round(sailMs[index]! * sailScale);
    if (totalWalkSteps > 0) return Math.round((walkMs * walkSteps[index]!) / totalWalkSteps);
    return Math.round(walkMs / walkLegCount);
  });
  return { legMs, transitMs: legMs.reduce((sum, ms) => sum + ms, 0) };
};

const routeOf = (legs: MusterTransitLeg[]): MusterTransitRoute => ({ legs, ...timeLegs(legs) });

/** Min-heap of [cost, key] pairs for the route search. */
class CostHeap {
  private readonly costs: number[] = [];
  private readonly keys: number[] = [];
  get size(): number { return this.costs.length; }
  push(cost: number, key: number): void {
    let i = this.costs.length;
    this.costs.push(cost);
    this.keys.push(key);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (this.costs[up]! <= cost) break;
      this.costs[i] = this.costs[up]!;
      this.keys[i] = this.keys[up]!;
      i = up;
    }
    this.costs[i] = cost;
    this.keys[i] = key;
  }
  pop(): [number, number] {
    const top: [number, number] = [this.costs[0]!, this.keys[0]!];
    const lastCost = this.costs.pop()!;
    const lastKey = this.keys.pop()!;
    if (this.costs.length > 0) {
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        if (left >= this.costs.length) break;
        const right = left + 1;
        const child = right < this.costs.length && this.costs[right]! < this.costs[left]! ? right : left;
        if (this.costs[child]! >= lastCost) break;
        this.costs[i] = this.costs[child]!;
        this.keys[i] = this.keys[child]!;
        i = child;
      }
      this.costs[i] = lastCost;
      this.keys[i] = lastKey;
    }
    return top;
  }
}

/**
 * Plans the company's route. A straight walk over land is taken as is (the
 * common case, and free); otherwise a search over land, with each dock
 * crossing costed at its sail time, finds the quickest route -- so a short
 * walk round a mountain beats a long voyage, and a voyage beats a long walk
 * round a bay. Aether bridges are crossed on foot as one step. Bounded at
 * maxSteps tiles of marching plus one full crossing. When no
 * route exists within that, the straight walk is returned, as before this
 * existed, so the attack is never refused for it.
 */
export const planMusterTransitRoute = (input: MusterTransitRouteInput): MusterTransitRoute => {
  const { from, to } = input;
  const straight = straightTransitWalk(from, to);
  const straightClear = straight.slice(1, -1).every((point) => input.isPassable(point.x, point.y));
  if (straightClear) return routeOf([{ kind: "WALK", points: straight }]);

  const keyOf = (x: number, y: number): number => y * WORLD_WIDTH + x;
  const pointOf = (key: number): TransitPoint => ({ x: key % WORLD_WIDTH, y: Math.floor(key / WORLD_WIDTH) });
  const fromKey = keyOf(from.x, from.y);
  const toKey = keyOf(to.x, to.y);
  const budget = input.maxSteps * MUSTER_TRANSIT_MS_PER_TILE + MUSTER_SAIL_MAX_MS;
  const best = new Map<number, number>([[fromKey, 0]]);
  const parent = new Map<number, { prev: number; sail: boolean }>([[fromKey, { prev: -1, sail: false }]]);
  const done = new Set<number>();
  const passable = new Map<number, boolean>();
  const heap = new CostHeap();
  heap.push(0, fromKey);
  const relax = (currentKey: number, cost: number, x: number, y: number, sail: boolean): void => {
    if (cost > budget) return;
    const key = keyOf(x, y);
    if (done.has(key) || cost >= (best.get(key) ?? Number.POSITIVE_INFINITY)) return;
    if (key !== toKey) {
      let ok = passable.get(key);
      if (ok === undefined) {
        ok = input.isPassable(x, y);
        passable.set(key, ok);
      }
      if (!ok) return;
    }
    best.set(key, cost);
    parent.set(key, { prev: currentKey, sail });
    heap.push(cost, key);
  };
  let found = false;
  while (heap.size > 0) {
    const [cost, key] = heap.pop();
    if (done.has(key) || cost > (best.get(key) ?? Number.POSITIVE_INFINITY)) continue;
    done.add(key);
    if (key === toKey) {
      found = true;
      break;
    }
    const current = pointOf(key);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx !== 0 || dy !== 0) relax(key, cost + MUSTER_TRANSIT_MS_PER_TILE, wrap(current.x + dx, WORLD_WIDTH), wrap(current.y + dy, WORLD_HEIGHT), false);
      }
    }
    for (const landing of input.crossingsFrom(current.x, current.y) ?? []) {
      const sail = !isKingAdjacent(current, landing);
      relax(key, cost + (sail ? musterSailMs(current, landing) : MUSTER_TRANSIT_MS_PER_TILE), landing.x, landing.y, sail);
    }
    for (const end of input.bridgesFrom?.(current.x, current.y) ?? []) relax(key, cost + MUSTER_TRANSIT_MS_PER_TILE, end.x, end.y, false);
  }
  if (!found) return routeOf([{ kind: "WALK", points: straight }]);

  // Walk the parents back from the launch tile, then split at each crossing.
  const steps: Array<{ point: TransitPoint; sail: boolean }> = [];
  for (let key = toKey; key !== -1; ) {
    const entry = parent.get(key)!;
    steps.push({ point: key === toKey ? to : key === fromKey ? from : pointOf(key), sail: entry.sail });
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
