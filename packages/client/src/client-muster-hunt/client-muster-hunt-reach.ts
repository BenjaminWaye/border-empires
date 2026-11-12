import { MUSTER_ADVANCE_RANGE_STEPS, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { landingGroundKeys, linkedDocksFrom } from "../client-dock-landing-ground/client-dock-landing-ground.js";

// Client mirror of the server hunt's reach (scanAdvanceCandidates in
// apps/simulation/src/runtime-muster-tick/muster-advance-scan.ts): a BFS
// through the player's own land from the flag -- king moves, dock crossings
// (onto the linked dock and its landing ground) and the player's active
// aether bridges -- with a candidate at most MUSTER_ADVANCE_RANGE_STEPS steps
// out. A straight-line range check alone handed hunts to flags across water
// or round a long coast that the server search could never reach, so the
// attack was swallowed and the flag sat at "No Planetary Defense within range".

export type HuntReachState = Pick<ClientState, "me" | "tiles" | "dockPairs" | "activeAetherBridges">;

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

const addLink = (links: Map<string, string[]>, from: string, to: string): void => {
  const existing = links.get(from);
  if (existing) existing.push(to);
  else links.set(from, [to]);
};

/** Dock-crossing and bridge hops from each tile, built once per reach check. */
const farLinks = (state: HuntReachState, nowMs: number): Map<string, string[]> => {
  const links = new Map<string, string[]>();
  const docks = new Set<string>();
  for (const pair of state.dockPairs) {
    docks.add(`${pair.ax},${pair.ay}`);
    docks.add(`${pair.bx},${pair.by}`);
  }
  for (const dockKey of docks) {
    const [x, y] = dockKey.split(",").map(Number) as [number, number];
    for (const linked of linkedDocksFrom(state.dockPairs, x, y)) {
      addLink(links, dockKey, `${linked.x},${linked.y}`);
      for (const landing of landingGroundKeys(state, linked.x, linked.y)) addLink(links, dockKey, landing);
    }
  }
  for (const bridge of state.activeAetherBridges) {
    if (bridge.ownerId !== state.me || bridge.endsAt <= nowMs) continue;
    const from = `${bridge.from.x},${bridge.from.y}`;
    const to = `${bridge.to.x},${bridge.to.y}`;
    addLink(links, from, to);
    addLink(links, to, from);
  }
  return links;
};

/** True when the server's hunt search from `flag` can reach `target`. */
export const huntFlagReaches = (state: HuntReachState, flag: Tile, target: { x: number; y: number }, nowMs: number): boolean => {
  const targetKey = `${wrap(target.x, WORLD_WIDTH)},${wrap(target.y, WORLD_HEIGHT)}`;
  const links = farLinks(state, nowMs);
  const depth = new Map<string, number>([[`${flag.x},${flag.y}`, 0]]);
  const queue: Tile[] = [flag];
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]!;
    const currentKey = `${current.x},${current.y}`;
    const d = depth.get(currentKey)!;
    const neighbors: string[] = [...(links.get(currentKey) ?? [])];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx !== 0 || dy !== 0) neighbors.push(`${wrap(current.x + dx, WORLD_WIDTH)},${wrap(current.y + dy, WORLD_HEIGHT)}`);
      }
    }
    for (const key of neighbors) {
      // A candidate is at most d + 1 <= MUSTER_ADVANCE_RANGE_STEPS steps out:
      // only tiles at d < MUSTER_ADVANCE_RANGE_STEPS - 1 are ever expanded.
      if (key === targetKey) return true;
      if (depth.has(key) || d + 1 >= MUSTER_ADVANCE_RANGE_STEPS) continue;
      const next = state.tiles.get(key);
      if (!next || next.terrain !== "LAND" || next.ownerId !== state.me) continue;
      depth.set(key, d + 1);
      queue.push(next);
    }
  }
  return false;
};

/**
 * True while a manual attack funded by this flag is still marching: its
 * manpower is reserved only on the client until the ATTACK is sent, so a hunt
 * would spend it. Once sent, the server counts it against the flag itself.
 */
export const flagHasMarchingAttack = (state: Pick<ClientState, "musterTransitByCommand">, flag: { x: number; y: number }, nowMs: number): boolean => {
  for (const transit of state.musterTransitByCommand.values()) {
    if (transit.musterX === flag.x && transit.musterY === flag.y && transit.transitEndsAt > nowMs) return true;
  }
  return false;
};
