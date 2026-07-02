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
 *
 * Also tracks last-emitted tile substructure refs so callers can build sparse
 * wire deltas with only changed fields. This tracking is NOT cleared by
 * invalidate — it only resets when the caller explicitly calls
 * resetLastEmitted or when the tile's substructures genuinely change after
 * a delta was emitted. This lets tileDeltaFromState build a full fresh delta
 * and then strip out fields whose substructure ref has not changed since the
 * last emission, reducing per-delta payload size.
 */

import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationTileWireDelta } from "../runtime-types.js";

export type TileLastEmittedRefs = {
  terrain: unknown;
  resource: unknown;
  dockId: unknown;
  ownerId: unknown;
  ownershipState: unknown;
  frontierDecayAt: unknown;
  frontierDecayKind: unknown;
  breachShockUntil: unknown;
  townRef: unknown;
  fortRef: unknown;
  observatoryRef: unknown;
  siegeOutpostRef: unknown;
  economicStructureRef: unknown;
  sabotageRef: unknown;
  shardSiteRef: unknown;
  musterRef: unknown;
};

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
  lastEmitted: TileLastEmittedRefs | undefined;
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
        musterJson: undefined, musterRef: undefined,
        lastEmitted: undefined
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

  /**
   * Build a sparse SimulationTileWireDelta containing only fields whose
   * substructure ref or scalar value differs from the last-emitted state.
   * Volatile fields (yield/yieldRate/yieldCap) are always included when
   * present since they change every tick and are small.
   *
   * Returns the full delta when there is no prior emission for this tile.
   */
  buildSparseDelta(
    tileKey: string,
    tile: DomainTileState,
    cached: AllSubstructureJson,
    fullDelta: SimulationTileWireDelta
  ): SimulationTileWireDelta {
    const last = this.entries.get(tileKey)?.lastEmitted;
    if (!last) return fullDelta;

    const delta: SimulationTileWireDelta = { x: fullDelta.x, y: fullDelta.y };
    let hasFieldChanges = false;

    if (tile.terrain !== last.terrain) { (delta as Record<string, unknown>).terrain = tile.terrain; hasFieldChanges = true; }
    if (tile.resource !== last.resource) { (delta as Record<string, unknown>).resource = tile.resource; hasFieldChanges = true; }
    if (tile.dockId !== last.dockId) { (delta as Record<string, unknown>).dockId = tile.dockId; hasFieldChanges = true; }
    if (tile.ownerId !== last.ownerId) { (delta as Record<string, unknown>).ownerId = tile.ownerId; hasFieldChanges = true; }
    if (tile.ownershipState !== last.ownershipState) { (delta as Record<string, unknown>).ownershipState = tile.ownershipState; hasFieldChanges = true; }
    if (tile.frontierDecayAt !== last.frontierDecayAt) { (delta as Record<string, unknown>).frontierDecayAt = tile.frontierDecayAt; hasFieldChanges = true; }
    if (tile.frontierDecayKind !== last.frontierDecayKind) { (delta as Record<string, unknown>).frontierDecayKind = tile.frontierDecayKind; hasFieldChanges = true; }
    if (tile.breachShockUntil !== last.breachShockUntil) { (delta as Record<string, unknown>).breachShockUntil = tile.breachShockUntil; hasFieldChanges = true; }

    if (tile.town !== last.townRef) { (delta as Record<string, unknown>).townJson = fullDelta.townJson; hasFieldChanges = true; }
    if (tile.fort !== last.fortRef) { (delta as Record<string, unknown>).fortJson = fullDelta.fortJson; hasFieldChanges = true; }
    if (tile.observatory !== last.observatoryRef) { (delta as Record<string, unknown>).observatoryJson = fullDelta.observatoryJson; hasFieldChanges = true; }
    if (tile.siegeOutpost !== last.siegeOutpostRef) { (delta as Record<string, unknown>).siegeOutpostJson = fullDelta.siegeOutpostJson; hasFieldChanges = true; }
    if (tile.economicStructure !== last.economicStructureRef) { (delta as Record<string, unknown>).economicStructureJson = fullDelta.economicStructureJson; hasFieldChanges = true; }
    if (tile.sabotage !== last.sabotageRef) { (delta as Record<string, unknown>).sabotageJson = fullDelta.sabotageJson; hasFieldChanges = true; }
    if (tile.muster !== last.musterRef) { (delta as Record<string, unknown>).musterJson = fullDelta.musterJson; hasFieldChanges = true; }
    if (tile.shardSite !== last.shardSiteRef) { (delta as Record<string, unknown>).shardSiteJson = fullDelta.shardSiteJson; hasFieldChanges = true; }

    const lastTown = last.townRef as DomainTileState["town"] | undefined;
    if (tile.town?.type !== lastTown?.type) { (delta as Record<string, unknown>).townType = tile.town?.type; hasFieldChanges = true; }
    if (tile.town?.name !== lastTown?.name) { (delta as Record<string, unknown>).townName = tile.town?.name; hasFieldChanges = true; }
    if (tile.town?.populationTier !== lastTown?.populationTier) { (delta as Record<string, unknown>).townPopulationTier = tile.town?.populationTier; hasFieldChanges = true; }

    if (fullDelta.yield) delta.yield = fullDelta.yield;
    if (fullDelta.yieldRate) delta.yieldRate = fullDelta.yieldRate;
    if (fullDelta.yieldCap) delta.yieldCap = fullDelta.yieldCap;

    return hasFieldChanges || delta.yield !== undefined || delta.yieldRate !== undefined || delta.yieldCap !== undefined
      ? delta
      : fullDelta;
  }

  /**
   * Build a sparse delta and immediately record the tile's current
   * substructure refs as the new last-emitted baseline.
   */
  sparseEmit(
    tileKey: string,
    tile: DomainTileState,
    cached: AllSubstructureJson,
    fullDelta: SimulationTileWireDelta
  ): SimulationTileWireDelta {
    const result = this.buildSparseDelta(tileKey, tile, cached, fullDelta);
    this.setLastEmitted(tileKey, tile);
    return result;
  }

  getLastEmitted(tileKey: string): TileLastEmittedRefs | undefined {
    return this.entries.get(tileKey)?.lastEmitted;
  }

  setLastEmitted(tileKey: string, tile: DomainTileState): void {
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
        musterJson: undefined, musterRef: undefined,
        lastEmitted: undefined
      };
      this.entries.set(tileKey, entry);
    }
    entry.lastEmitted = {
      terrain: tile.terrain,
      resource: tile.resource,
      dockId: tile.dockId,
      ownerId: tile.ownerId,
      ownershipState: tile.ownershipState,
      frontierDecayAt: tile.frontierDecayAt,
      frontierDecayKind: tile.frontierDecayKind,
      breachShockUntil: tile.breachShockUntil,
      townRef: tile.town,
      fortRef: tile.fort,
      observatoryRef: tile.observatory,
      siegeOutpostRef: tile.siegeOutpost,
      economicStructureRef: tile.economicStructure,
      sabotageRef: tile.sabotage,
      shardSiteRef: tile.shardSite,
      musterRef: tile.muster,
    };
  }

  clearLastEmitted(tileKey: string): void {
    const entry = this.entries.get(tileKey);
    if (entry) entry.lastEmitted = undefined;
  }

  invalidate(tileKey: string): void {
    const entry = this.entries.get(tileKey);
    if (entry) {
      const preserved = entry.lastEmitted;
      entry.townJson = undefined; entry.townRef = undefined;
      entry.fortJson = undefined; entry.fortRef = undefined;
      entry.observatoryJson = undefined; entry.observatoryRef = undefined;
      entry.siegeOutpostJson = undefined; entry.siegeOutpostRef = undefined;
      entry.economicStructureJson = undefined; entry.economicStructureRef = undefined;
      entry.sabotageJson = undefined; entry.sabotageRef = undefined;
      entry.shardSiteJson = undefined; entry.shardSiteRef = undefined;
      entry.musterJson = undefined; entry.musterRef = undefined;
      entry.lastEmitted = preserved;
    }
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
