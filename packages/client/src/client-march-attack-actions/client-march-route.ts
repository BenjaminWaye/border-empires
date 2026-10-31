// Real route lengths for a March Attack: a breadth-first flood out from the
// target, the client's mirror of the server's buildTerrainDistanceField
// (apps/simulation/src/runtime-muster-tick/muster-march-pathfinding.ts). It
// steps to the 8 surrounding tiles over land, plus one-step dock links and
// the player's live aether bridges, so an origin across a strait is measured
// through the crossing -- or left out when nothing crosses -- instead of by
// straight-line distance over the sea.
//
// A tile the client has no data for counts as passable: the server routes
// unexplored ground too (a march may scout into the unknown), and blocking it
// here would hide real routes. Only tiles known to be water, mountain or
// other non-land terrain block the flood.

import { MUSTER_MARCH_MAX_ROUTE_STEPS, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";

export type MarchRouteState = Pick<ClientState, "me" | "tiles" | "dockPairs" | "activeAetherBridges">;

const wrap = (value: number, size: number): number => ((value % size) + size) % size;
const keyOf = (x: number, y: number): string => `${x},${y}`;

const crossingLinks = (state: MarchRouteState, nowMs: number): Map<string, string[]> => {
  const links = new Map<string, string[]>();
  const add = (from: string, to: string): void => {
    const list = links.get(from);
    if (list) list.push(to);
    else links.set(from, [to]);
  };
  const link = (a: string, b: string): void => {
    add(a, b);
    add(b, a);
  };
  for (const pair of state.dockPairs) link(keyOf(pair.ax, pair.ay), keyOf(pair.bx, pair.by));
  for (const bridge of state.activeAetherBridges) {
    if (bridge.ownerId === state.me && bridge.endsAt > nowMs) link(keyOf(bridge.from.x, bridge.from.y), keyOf(bridge.to.x, bridge.to.y));
  }
  return links;
};

export type MarchRouteVisitor = {
  /** Called once per tile the flood reaches, in nondecreasing step order. */
  reached: (key: string, steps: number) => void;
  /** Once this returns a step count, the flood finishes that level and stops. */
  doneAtSteps: () => number | undefined;
};

/**
 * Route steps from (target.x, target.y) to every tile reachable within
 * `maxSteps` (default MUSTER_MARCH_MAX_ROUTE_STEPS), keyed "x,y". A tile
 * missing from the result has no march route to the target in range. With a
 * `visitor`, the flood stops early once the caller has seen enough -- it runs
 * on every re-render of an open tile menu, so it shouldn't flood the whole
 * square when the nearest origins are a few steps away.
 */
export const marchRouteStepsFromTarget = (
  state: MarchRouteState,
  target: { x: number; y: number },
  nowMs = Date.now(),
  maxSteps = MUSTER_MARCH_MAX_ROUTE_STEPS,
  visitor?: MarchRouteVisitor
): Map<string, number> => {
  const links = crossingLinks(state, nowMs);
  const steps = new Map<string, number>([[keyOf(target.x, target.y), 0]]);
  const queue: Array<{ x: number; y: number; steps: number }> = [{ x: target.x, y: target.y, steps: 0 }];
  const visit = (x: number, y: number, nextSteps: number): void => {
    const key = keyOf(x, y);
    if (steps.has(key)) return;
    const tile = state.tiles.get(key);
    if (tile && tile.terrain !== "LAND") return;
    steps.set(key, nextSteps);
    visitor?.reached(key, nextSteps);
    if (nextSteps < maxSteps) queue.push({ x, y, steps: nextSteps });
  };
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]!;
    // Every tile at the done level was added while expanding the level
    // before it, so stop at the first node of that level.
    const doneAt = visitor?.doneAtSteps();
    if (doneAt !== undefined && current.steps >= doneAt) break;
    const nextSteps = current.steps + 1;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx !== 0 || dy !== 0) visit(wrap(current.x + dx, WORLD_WIDTH), wrap(current.y + dy, WORLD_HEIGHT), nextSteps);
      }
    }
    for (const linked of links.get(keyOf(current.x, current.y)) ?? []) {
      const [lx, ly] = linked.split(",").map(Number);
      visit(lx!, ly!, nextSteps);
    }
  }
  return steps;
};
