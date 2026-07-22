import type { DomainTileState } from "@border-empires/game-domain";
import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";

const keyFor = (x: number, y: number): string => `${wrapX(x, WORLD_WIDTH)},${wrapY(y, WORLD_HEIGHT)}`;

/**
 * True when `tile` is a CORRIDOR tile for `playerId` — owned by them, SETTLED,
 * LAND, and not a TOWN-tier-or-higher town. SETTLEMENT-tier towns count as
 * corridor (they carry no connectedTownBonus of their own, so they're
 * pass-through rather than barriers/endpoints).
 *
 * Single source of truth for the corridor/town partition: consumed both by
 * buildConnectedTownNetworkForPlayer's partition pass and by
 * refreshEconomyCachesForTileChange's incremental maintenance. If these two
 * ever disagreed the union-find would drift out of sync with the tile set it
 * claims to describe, so they must share this predicate rather than each
 * re-deriving it.
 */
export const isCorridorTileForPlayer = (
  tile: Pick<DomainTileState, "ownerId" | "ownershipState" | "terrain" | "town"> | undefined,
  playerId: string
): boolean => {
  if (!tile) return false;
  if (tile.ownerId !== playerId || tile.ownershipState !== "SETTLED" || tile.terrain !== "LAND") return false;
  return !(tile.town && tile.town.populationTier !== "SETTLEMENT");
};

/**
 * True when `tile` is a real (TOWN-tier-or-higher) town node for `playerId` —
 * the complement of isCorridorTileForPlayer within the player's owned settled
 * LAND tiles.
 */
export const isTownNodeTileForPlayer = (
  tile: Pick<DomainTileState, "ownerId" | "ownershipState" | "terrain" | "town"> | undefined,
  playerId: string
): boolean => {
  if (!tile) return false;
  if (tile.ownerId !== playerId || tile.ownershipState !== "SETTLED" || tile.terrain !== "LAND") return false;
  return Boolean(tile.town && tile.town.populationTier !== "SETTLEMENT");
};

/**
 * Per-player union-find over the player's CORRIDOR tiles only — owned, SETTLED,
 * LAND tiles that are NOT a TOWN-tier-or-higher town (plain settled land and
 * SETTLEMENT-tier towns both qualify).
 *
 * Corridor-only is load-bearing, not an optimization: in
 * buildConnectedTownNetworkForPlayer, real towns are connectivity BARRIERS as
 * well as endpoints. Two towns joined only by a path that runs *through* a
 * third town are NOT connected (see the "does not count a town as connected
 * when only reachable through another town" test). A union-find over all
 * settled tiles would merge them and silently inflate connectedTownCount /
 * connectedTownBonus, so towns must be excluded from the structure entirely
 * and re-attached at read time via their 8-neighborhood.
 *
 * Maintenance model:
 * - Growth (a tile becomes a corridor tile for this owner) is an O(1)-amortized
 *   union with already-tracked 8-neighbors — the common mutation.
 * - Shrinkage (a tile stops being a corridor tile for this owner: captured,
 *   abandoned, or built up into a real town) has no cheap incremental removal
 *   in a plain union-find, so it marks the structure dirty and the next read
 *   pays one O(corridor tiles) rebuild.
 */
export type TownConnectivityState = {
  parent: Map<string, string>;
  dirty: boolean;
};

export const createTownConnectivityState = (): TownConnectivityState => ({
  parent: new Map(),
  // Starts dirty: nothing is populated yet, so the first read must rebuild.
  dirty: true
});

export const markTownConnectivityDirty = (state: TownConnectivityState): void => {
  state.dirty = true;
};

/**
 * Union-find root with full path compression. Exported for read-time town
 * attachment in buildConnectedTownNetworkForPlayer.
 */
export const findConnectivityRoot = (state: TownConnectivityState, key: string): string => {
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
  const rootA = findConnectivityRoot(state, a);
  const rootB = findConnectivityRoot(state, b);
  if (rootA !== rootB) state.parent.set(rootA, rootB);
};

/**
 * Adds a single corridor tile, unioning it with any already-tracked 8-adjacent
 * corridor tile. No-op while dirty — a pending full rebuild reads live tile
 * state anyway, so unioning into a stale parent map would be wasted work.
 */
export const addCorridorTileToConnectivity = (state: TownConnectivityState, tileKey: string): void => {
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
 * Applies one tile mutation to the per-player corridor union-finds.
 *
 * MUST be called for every mutation that can change a tile's corridor status
 * for any player — there is more than one tile-write path in runtime.ts
 * (replaceTileState and the progression handlers' setTileState), and a path
 * that skips this silently desyncs the structure: e.g. upgrading a SETTLEMENT
 * to a real TOWN turns a corridor tile into a barrier, and a union-find that
 * still has the two sides merged reports towns as connected across a barrier
 * that now exists, inflating connectedTownCount/connectedTownBonus.
 */
export const maintainTownConnectivityForTileChange = (
  townConnectivityStateByPlayer: ReadonlyMap<string, TownConnectivityState>,
  tileKey: string,
  previous: Pick<DomainTileState, "ownerId" | "ownershipState" | "terrain" | "town"> | undefined,
  next: Pick<DomainTileState, "ownerId" | "ownershipState" | "terrain" | "town"> | undefined
): void => {
  const previousOwnerId = previous?.ownerId;
  const nextOwnerId = next?.ownerId;
  const wasCorridor = Boolean(previousOwnerId) && isCorridorTileForPlayer(previous, previousOwnerId!);
  const isCorridor = Boolean(nextOwnerId) && isCorridorTileForPlayer(next, nextOwnerId!);
  const sameCorridorOwner = wasCorridor && isCorridor && previousOwnerId === nextOwnerId;

  // Losing a corridor tile (captured, unsettled, or built up into a real town)
  // can't be undone in a plain union-find, so it forces a rebuild.
  if (wasCorridor && !sameCorridorOwner) {
    const previousState = townConnectivityStateByPlayer.get(previousOwnerId!);
    if (previousState) markTownConnectivityDirty(previousState);
  }
  // Gaining one is a cheap union.
  if (isCorridor && !sameCorridorOwner) {
    const nextState = townConnectivityStateByPlayer.get(nextOwnerId!);
    if (nextState) addCorridorTileToConnectivity(nextState, tileKey);
  }
};

// NOTE: there is deliberately no standalone "rebuild from scratch" helper.
// A dirty structure is rebuilt by buildConnectedTownNetworkForPlayer directly
// from its BFS traversal (which already discovers the same components), so a
// separate rebuild pass would just duplicate that work — measurably slower.
