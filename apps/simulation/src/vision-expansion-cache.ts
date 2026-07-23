/**
 * Per-player territorial vision expansion cache.
 *
 * `classifyVisibilityForPlayer` expands each player's territory by a vision
 * radius (typically 4–6 tiles) to build the set of visible tile keys.  Without
 * caching this is O(territorySize × (2r+1)²) per call — O(~100k) for a large
 * empire — and is called once per player per export.
 *
 * This cache stores the result per player keyed by a signature of
 * (tileCollectionVersion, vision, visionRadiusBonus).  When territory or vision
 * changes the signature changes and the expansion is recomputed; otherwise the
 * cached Set is returned in O(1).
 *
 * The signature approach means:
 * - Territory changes: `markPlannerPlayerTileCollectionDirty` bumps
 *   `tileCollectionVersion`, which changes the sig on next access.
 * - Vision/bonus changes (tech unlock, observatory): vision and visionRadiusBonus
 *   are included in the sig, so a mod change triggers recompute automatically.
 * - Player elimination: call `invalidate(playerId)` to release the memory.
 *
 * Single-threaded sim → no concurrency concerns.
 */

import { VISION_RADIUS } from "@border-empires/shared";
import { simulationTileKey } from "./seed-state/seed-state.js";
import type { VisionFootprintTable } from "./vision-footprint-table.js";

type ExpansionEntry = { sig: string; keys: ReadonlySet<string> };

export class VisionExpansionCache {
  private readonly cache = new Map<string, ExpansionEntry>();
  private readonly worldWidth: number;
  private readonly worldHeight: number;
  private readonly footprintTable: VisionFootprintTable | undefined;

  constructor(worldWidth: number, worldHeight: number, footprintTable?: VisionFootprintTable) {
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.footprintTable = footprintTable;
  }

  /**
   * Return the cached expansion for `playerId`, recomputing if the signature
   * (tileCollectionVersion, vision, visionRadiusBonus) has changed.
   *
   * The returned Set is owned by the cache — callers must not mutate it.
   */
  getOrCompute(
    playerId: string,
    territoryTileKeys: Iterable<string>,
    vision: number,
    visionRadiusBonus: number,
    tileCollectionVersion: number
  ): ReadonlySet<string> {
    const sig = `${tileCollectionVersion}:${vision}:${visionRadiusBonus}`;
    const cached = this.cache.get(playerId);
    if (cached && cached.sig === sig) return cached.keys;
    const keys = this.expand(territoryTileKeys, vision, visionRadiusBonus);
    this.cache.set(playerId, { sig, keys });
    return keys;
  }

  /**
   * Release the cached expansion for an eliminated or removed player so the
   * expanded Set (potentially tens of thousands of strings) is GC-eligible.
   */
  invalidate(playerId: string): void {
    this.cache.delete(playerId);
  }

  private expand(
    territoryTileKeys: Iterable<string>,
    vision: number,
    visionRadiusBonus: number
  ): Set<string> {
    const radius = Math.max(1, Math.floor(VISION_RADIUS * vision) + visionRadiusBonus);
    const W = this.worldWidth;
    const H = this.worldHeight;
    const result = new Set<string>();
    for (const tileKey of territoryTileKeys) {
      const comma = tileKey.indexOf(",");
      const x = Number(tileKey.slice(0, comma));
      const y = Number(tileKey.slice(comma + 1));
      if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
      if (this.footprintTable) {
        for (const [dx, dy] of this.footprintTable.getOffsets(x, y, radius)) {
          result.add(simulationTileKey(((x + dx) % W + W) % W, ((y + dy) % H + H) % H));
        }
        continue;
      }
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          result.add(simulationTileKey(((x + dx) % W + W) % W, ((y + dy) % H + H) % H));
        }
      }
    }
    return result;
  }
}
