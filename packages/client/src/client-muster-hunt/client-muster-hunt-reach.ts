import { MUSTER_ADVANCE_RANGE_STEPS, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { isDockLandingTargetFrom } from "../client-dock-landing-ground/client-dock-landing-ground.js";

// Client mirror of the server hunt's reach (scanAdvanceCandidates in
// apps/simulation/src/runtime-muster-tick/muster-advance-scan.ts): a BFS
// through the player's own connected land from the flag, king moves, with a
// candidate at most MUSTER_ADVANCE_RANGE_STEPS steps out. A straight-line
// range check alone handed hunts to flags across water or round a long coast
// that the server search could never reach, so the attack was swallowed and
// the flag sat at "No Planetary Defense within range". Dock crossings count
// only for the last step onto the target; aether bridges and dock hops
// between own islands are left out, which only ever falls back to the
// ordinary attack.

export type HuntReachState = Pick<ClientState, "me" | "tiles" | "dockPairs">;

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

const kingAdjacent = (ax: number, ay: number, bx: number, by: number): boolean => {
  const dx = Math.min(wrap(ax - bx, WORLD_WIDTH), wrap(bx - ax, WORLD_WIDTH));
  const dy = Math.min(wrap(ay - by, WORLD_HEIGHT), wrap(by - ay, WORLD_HEIGHT));
  return Math.max(dx, dy) === 1;
};

/** True when the server's hunt search from `flag` can reach `target`. */
export const huntFlagReaches = (state: HuntReachState, flag: Tile, target: { x: number; y: number }): boolean => {
  const start = `${flag.x},${flag.y}`;
  const depth = new Map<string, number>([[start, 0]]);
  const queue: Tile[] = [flag];
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]!;
    const d = depth.get(`${current.x},${current.y}`)!;
    if (kingAdjacent(current.x, current.y, target.x, target.y) || isDockLandingTargetFrom(state, current.x, current.y, target.x, target.y)) return true;
    if (d + 1 >= MUSTER_ADVANCE_RANGE_STEPS) continue;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const key = `${wrap(current.x + dx, WORLD_WIDTH)},${wrap(current.y + dy, WORLD_HEIGHT)}`;
        if (depth.has(key)) continue;
        const next = state.tiles.get(key);
        if (!next || next.terrain !== "LAND" || next.ownerId !== state.me) continue;
        depth.set(key, d + 1);
        queue.push(next);
      }
    }
  }
  return false;
};

/** True when a manual attack funded by this flag is still marching (client-side transit). */
export const flagHasArmedTransit = (state: Pick<ClientState, "musterTransitByCommand">, flag: { x: number; y: number }): boolean => {
  for (const transit of state.musterTransitByCommand.values()) {
    if (transit.musterX === flag.x && transit.musterY === flag.y) return true;
  }
  return false;
};
