/**
 * Memoises per-substructure JSON.stringify calls for tile delta construction.
 *
 * Runtime produces new tile objects on every mutation via spread, so the
 * individual substructure references (tile.town, tile.fort, …) are stable
 * across ticks when the substructure has not changed. REF-IDENTITY comparison
 * is therefore correct and allocation-free.
 *
 * Invalidation: call invalidate(tileKey) as the FIRST statement inside
 * replaceTileState, before the mutation, so that any read of the cache after
 * mutation always gets a fresh value.
 */

import type { DomainTileState } from "@border-empires/game-domain";

interface Entry {
  townJson: string | undefined;
  townRef: unknown;
  fortJson: string | undefined;
  fortRef: unknown;
  observatoryJson: string | undefined;
  observatoryRef: unknown;
  siegeOutpostJson: string | undefined;
  siegeOutpostRef: unknown;
  economicStructureJson: string | undefined;
  economicStructureRef: unknown;
  sabotageJson: string | undefined;
  sabotageRef: unknown;
  shardSiteJson: string | undefined;
  shardSiteRef: unknown;
  musterJson: string | undefined;
  musterRef: unknown;
}

export type AllSubstructureJson = {
  townJson: string | undefined;
  fortJson: string | undefined;
  observatoryJson: string | undefined;
  siegeOutpostJson: string | undefined;
  economicStructureJson: string | undefined;
  sabotageJson: string | undefined;
  shardSiteJson: string | undefined;
  musterJson: string | undefined;
};

export class TileDeltaStringifyCache {
  private readonly entries = new Map<string, Entry>();

  /**
   * Return cached JSON strings for all substructures of the tile.
   * Only recomputes strings whose reference has changed since the last call.
   */
  getOrComputeAll(tileKey: string, tile: DomainTileState): AllSubstructureJson {
    let entry = this.entries.get(tileKey);
    if (!entry) {
      entry = {
        townJson: undefined, townRef: undefined,
        fortJson: undefined, fortRef: undefined,
        observatoryJson: undefined, observatoryRef: undefined,
        siegeOutpostJson: undefined, siegeOutpostRef: undefined,
        economicStructureJson: undefined, economicStructureRef: undefined,
        sabotageJson: undefined, sabotageRef: undefined,
        shardSiteJson: undefined, shardSiteRef: undefined,
        musterJson: undefined, musterRef: undefined
      };
      this.entries.set(tileKey, entry);
    }

    if (tile.town !== entry.townRef) {
      entry.townRef = tile.town;
      entry.townJson = tile.town ? JSON.stringify(tile.town) : undefined;
    }
    if (tile.fort !== entry.fortRef) {
      entry.fortRef = tile.fort;
      entry.fortJson = tile.fort ? JSON.stringify(tile.fort) : undefined;
    }
    if (tile.observatory !== entry.observatoryRef) {
      entry.observatoryRef = tile.observatory;
      entry.observatoryJson = tile.observatory ? JSON.stringify(tile.observatory) : undefined;
    }
    if (tile.siegeOutpost !== entry.siegeOutpostRef) {
      entry.siegeOutpostRef = tile.siegeOutpost;
      entry.siegeOutpostJson = tile.siegeOutpost ? JSON.stringify(tile.siegeOutpost) : undefined;
    }
    if (tile.economicStructure !== entry.economicStructureRef) {
      entry.economicStructureRef = tile.economicStructure;
      entry.economicStructureJson = tile.economicStructure ? JSON.stringify(tile.economicStructure) : undefined;
    }
    if (tile.sabotage !== entry.sabotageRef) {
      entry.sabotageRef = tile.sabotage;
      entry.sabotageJson = tile.sabotage ? JSON.stringify(tile.sabotage) : undefined;
    }
    if (tile.shardSite !== entry.shardSiteRef) {
      entry.shardSiteRef = tile.shardSite;
      entry.shardSiteJson = tile.shardSite ? JSON.stringify(tile.shardSite) : undefined;
    }
    if (tile.muster !== entry.musterRef) {
      entry.musterRef = tile.muster;
      entry.musterJson = tile.muster ? JSON.stringify(tile.muster) : undefined;
    }

    return {
      townJson: entry.townJson,
      fortJson: entry.fortJson,
      observatoryJson: entry.observatoryJson,
      siegeOutpostJson: entry.siegeOutpostJson,
      economicStructureJson: entry.economicStructureJson,
      sabotageJson: entry.sabotageJson,
      shardSiteJson: entry.shardSiteJson,
      musterJson: entry.musterJson
    };
  }

  invalidate(tileKey: string): void {
    this.entries.delete(tileKey);
  }

  invalidateMany(keys: Iterable<string>): void {
    for (const key of keys) {
      this.entries.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }
}
