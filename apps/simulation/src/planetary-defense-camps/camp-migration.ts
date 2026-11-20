// Boot conversion of pre-camp Planetary Defense land (docs/planetary-defense-camps-plan.md,
// stage 2). Before camps, every barbarian tile was SETTLED and carried no
// campId. At boot, before any index is built, each connected cluster of such
// tiles becomes:
//   - camps: every town or dock tile in it, or, if it has none, one tile
//     (the lowest y, then x) so the cluster keeps a camp;
//   - FRONTIER for the rest, each tile joining its nearest camp in the cluster.
// Deterministic in the tile state, so replaying the event log and booting again
// gives the same result. A world with no unconverted tiles is left untouched.
import type { DomainTileState } from "@border-empires/game-domain";
import { MAX_PLANETARY_DEFENSE_CAMPS } from "@border-empires/shared";
import { forEachFrontierNeighbor } from "../frontier-topology.js";
import { simulationTileKey } from "../seed-state/seed-state.js";
import { foundsCamp, isPlanetaryDefenseCampTile, isPlanetaryDefenseOwner, releasedPlanetaryDefenseTile } from "./camp-rules.js";

export type CampMigrationResult = { readonly camps: number; readonly frontier: number; readonly released: number };

const needsMigration = (tile: DomainTileState): boolean => isPlanetaryDefenseOwner(tile.ownerId) && !tile.campId;

const byPosition = (a: DomainTileState, b: DomainTileState): number => a.y - b.y || a.x - b.x;

/** Converts unconverted Planetary Defense tiles in `tiles` in place. */
export const migrateLegacyPlanetaryDefenseTiles = (tiles: Map<string, DomainTileState>): CampMigrationResult => {
  const pending = new Set<string>();
  let campCount = 0;
  for (const [key, tile] of tiles) {
    if (needsMigration(tile)) pending.add(key);
    else if (isPlanetaryDefenseCampTile(key, tile)) campCount += 1;
  }
  const result = { camps: 0, frontier: 0, released: 0 };
  if (pending.size === 0) return result;
  const remaining = new Set(pending);
  const ordered = [...pending].map((key) => tiles.get(key)!).sort(byPosition);
  for (const start of ordered) {
    const startKey = simulationTileKey(start.x, start.y);
    if (!remaining.has(startKey)) continue;
    const cluster = collectCluster(startKey, remaining, tiles);
    const members = cluster.map((key) => tiles.get(key)!).sort(byPosition);
    const campKeys = members.filter((tile) => foundsCamp(tile)).map((tile) => simulationTileKey(tile.x, tile.y));
    if (campKeys.length === 0) campKeys.push(simulationTileKey(members[0]!.x, members[0]!.y));
    const allowed = campKeys.slice(0, Math.max(0, MAX_PLANETARY_DEFENSE_CAMPS - campCount));
    campCount += allowed.length;
    const campOf = nearestCamp(cluster, allowed, tiles);
    for (const key of cluster) {
      const tile = tiles.get(key)!;
      const campId = campOf.get(key);
      if (!campId) {
        tiles.set(key, releasedPlanetaryDefenseTile(tile));
        result.released += 1;
      } else if (campId === key) {
        tiles.set(key, { ...tile, ownershipState: "SETTLED", campId });
        result.camps += 1;
      } else {
        tiles.set(key, { ...tile, ownershipState: "FRONTIER", campId });
        result.frontier += 1;
      }
    }
  }
  return result;
};

const collectCluster = (startKey: string, remaining: Set<string>, tiles: ReadonlyMap<string, DomainTileState>): string[] => {
  const cluster: string[] = [startKey];
  remaining.delete(startKey);
  for (let index = 0; index < cluster.length; index += 1) {
    const tile = tiles.get(cluster[index]!)!;
    forEachFrontierNeighbor(tile.x, tile.y, (nx, ny) => {
      const key = simulationTileKey(nx, ny);
      if (!remaining.delete(key)) return;
      cluster.push(key);
    });
  }
  return cluster;
};

/** Multi-source breadth-first assignment of each cluster tile to its nearest camp (first camp wins ties). */
const nearestCamp = (cluster: readonly string[], campKeys: readonly string[], tiles: ReadonlyMap<string, DomainTileState>): Map<string, string> => {
  const inCluster = new Set(cluster);
  const campOf = new Map<string, string>();
  const queue: string[] = [];
  for (const key of campKeys) {
    campOf.set(key, key);
    queue.push(key);
  }
  for (let index = 0; index < queue.length; index += 1) {
    const key = queue[index]!;
    const tile = tiles.get(key)!;
    forEachFrontierNeighbor(tile.x, tile.y, (nx, ny) => {
      const next = simulationTileKey(nx, ny);
      if (!inCluster.has(next) || campOf.has(next)) return;
      campOf.set(next, campOf.get(key)!);
      queue.push(next);
    });
  }
  return campOf;
};
