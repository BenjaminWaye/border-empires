import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";

const keyFor = (x: number, y: number): string => `${wrapX(x, WORLD_WIDTH)},${wrapY(y, WORLD_HEIGHT)}`;

/**
 * Per-player union-find over every owned, SETTLED, LAND tile key (towns and
 * plain settled corridor tiles alike). Two towns are connected iff their
 * tile keys share a root — this is exactly the relation
 * buildConnectedTownNetworkForPlayer's direct-adjacency + corridor-BFS steps
 * compute from scratch every time, but maintained incrementally:
 *
 * - Growth (a tile becomes newly settled+owned) is a cheap O(1)-amortized
 *   union with any already-tracked 8-neighbors (addSettledTileToConnectivity).
 * - Shrinkage (a tile stops being settled/owned — capture, abandon, etc.) has
 *   no cheap incremental removal in a plain union-find, so it just marks the
 *   structure dirty; the next read pays one O(settled tiles) rebuild and
 *   goes fresh again. Growth is the overwhelmingly common mutation (organic
 *   expansion, dozens of times over a game), so this still turns the hot
 *   path from "full rebuild every cache-miss" into "full rebuild only after
 *   a loss event".
 */
export type TownConnectivityState = {
  parent: Map<string, string>;
  dirty: boolean;
};

export const createTownConnectivityState = (): TownConnectivityState => ({
  parent: new Map(),
  // Starts dirty: nothing has been populated yet, so the first read must do
  // a full rebuild regardless.
  dirty: true
});

export const markTownConnectivityDirty = (state: TownConnectivityState): void => {
  state.dirty = true;
};

const find = (state: TownConnectivityState, key: string): string => {
  let root = key;
  for (;;) {
    const next = state.parent.get(root);
    if (next === undefined || next === root) break;
    root = next;
  }
  let current = key;
  while (current !== root) {
    const next = state.parent.get(current);
    if (next === undefined) break;
    state.parent.set(current, root);
    current = next;
  }
  return root;
};

const union = (state: TownConnectivityState, a: string, b: string): void => {
  const rootA = find(state, a);
  const rootB = find(state, b);
  if (rootA !== rootB) state.parent.set(rootA, rootB);
};

/**
 * Adds a single newly-settled owned LAND tile, unioning it with any
 * already-tracked 8-adjacent neighbor. No-op while dirty — a pending full
 * rebuild will pick this tile up from live tile state anyway, and unioning
 * against a stale/incomplete parent map here would be wasted work at best.
 */
export const addSettledTileToConnectivity = (state: TownConnectivityState, tileKey: string): void => {
  if (state.dirty) return;
  if (!state.parent.has(tileKey)) state.parent.set(tileKey, tileKey);
  const [rawX, rawY] = tileKey.split(",");
  const cx = Number(rawX);
  const cy = Number(rawY);
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const neighborKey = keyFor(cx + dx, cy + dy);
      if (state.parent.has(neighborKey)) union(state, tileKey, neighborKey);
    }
  }
};

/**
 * Rebuilds the structure from scratch given every currently owned+settled
 * LAND tile key for the player (same tile set buildConnectedTownNetworkForPlayer
 * partitions on every call). O(settled tiles) — paid once right after a
 * dirtying mutation, not on every subsequent read.
 */
export const rebuildTownConnectivityFully = (
  state: TownConnectivityState,
  allSettledLandTileKeys: Iterable<string>
): void => {
  state.parent.clear();
  state.dirty = false;
  for (const tileKey of allSettledLandTileKeys) {
    addSettledTileToConnectivity(state, tileKey);
  }
};

/**
 * Groups `townKeys` by connectivity root. Callers must ensure `state` is not
 * dirty first (rebuildTownConnectivityFully if it is) — this does not
 * validate freshness itself, since it has no access to live tile state.
 */
export const groupTownKeysByConnectivity = (
  state: TownConnectivityState,
  townKeys: Iterable<string>
): Map<string, string[]> => {
  const membersByRoot = new Map<string, string[]>();
  for (const townKey of townKeys) {
    const root = find(state, townKey);
    let members = membersByRoot.get(root);
    if (!members) {
      members = [];
      membersByRoot.set(root, members);
    }
    members.push(townKey);
  }
  return membersByRoot;
};
