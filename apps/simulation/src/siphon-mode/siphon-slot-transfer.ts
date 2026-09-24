// Siphon resource-slot transfer (docs/game-mechanics.md "Siphon").
//
// While a siphon is active on an enemy RESOURCE tile, that tile's slots stop
// counting toward its owner's slot supply and count toward the caster's
// instead — the same slot resource and the same count the owner would get
// from it, boosts included (same-tile Farmstead/Mine, the owner's own
// Waterworks/Foundry radius bonuses, the owner's Agrarian Works fish bonus).
// When the siphon ends (siphon-mode-lifecycle.ts) the sabotage stamp is gone
// and both players' supply goes back to normal on the next read.
//
// Pure functions over tile state — no new index: the caster's drained tiles
// are found through the caster's own active-Observatory index (a siphoning
// tower is always active; the lifecycle ends the siphon otherwise), which
// the runtime already maintains and gauges.
import type { DomainTileState } from "@border-empires/game-domain";
import { isSiphonModeSabotage, type SlotResource } from "@border-empires/shared";
import {
  emptyResourceSlotTotals,
  resourceSlotSupplyForPlayer,
  type ResourceSlotTotals
} from "../resource-slot-view/resource-slot-view.js";
import { radiusStructureKeysForSettledTiles } from "../tile-yield-view/tile-yield-view.js";

/** True when this tile's resource slots are currently siphoned away from `ownerId`. */
export const isResourceTileSiphonedAway = (tile: Pick<DomainTileState, "resource" | "sabotage">, ownerId: string): boolean =>
  Boolean(tile.resource) && isSiphonModeSabotage(tile.sabotage) && tile.sabotage.ownerId !== ownerId;

export type SiphonSlotSupplyInput = {
  playerId: string;
  tiles: ReadonlyMap<string, DomainTileState>;
  settledTilesForPlayer: (playerId: string) => DomainTileState[];
  // Same inputs the runtime already feeds resourceSlotSupplyForPlayer.
  grantedSupplyForPlayer: (playerId: string) => Partial<Record<SlotResource, number>> | undefined;
  fishFoodSlotBonusForPlayer: (playerId: string) => number;
  activeObservatoryKeysForPlayer: (playerId: string) => Iterable<string>;
};

/** What `ownerId` would get from `drained` if it weren't siphoned — computed in the owner's own boost context. */
const ownerSlotsForTiles = (input: SiphonSlotSupplyInput, ownerId: string, drained: DomainTileState[]): ResourceSlotTotals => {
  const { waterworksKeys, foundryKeys } = radiusStructureKeysForSettledTiles(input.settledTilesForPlayer(ownerId));
  return resourceSlotSupplyForPlayer(drained, waterworksKeys, foundryKeys, undefined, input.fishFoodSlotBonusForPlayer(ownerId));
};

/** Slots the caster is currently receiving through its siphoning towers. */
export const siphonedInSlotsForPlayer = (input: SiphonSlotSupplyInput): ResourceSlotTotals => {
  const totals = emptyResourceSlotTotals();
  const drainedByOwner = new Map<string, DomainTileState[]>();
  for (const observatoryKey of input.activeObservatoryKeysForPlayer(input.playerId)) {
    const siphon = input.tiles.get(observatoryKey)?.observatory?.siphon;
    if (!siphon) continue;
    for (const tileKey of siphon.tileKeys) {
      const tile = input.tiles.get(tileKey);
      if (!tile?.ownerId || tile.ownershipState !== "SETTLED" || !isResourceTileSiphonedAway(tile, tile.ownerId)) continue;
      if (tile.sabotage?.ownerId !== input.playerId || tile.sabotage.observatoryTileKey !== observatoryKey) continue;
      const list = drainedByOwner.get(tile.ownerId) ?? [];
      list.push(tile);
      drainedByOwner.set(tile.ownerId, list);
    }
  }
  for (const [ownerId, drained] of drainedByOwner) {
    const slots = ownerSlotsForTiles(input, ownerId, drained);
    for (const resource of Object.keys(slots) as SlotResource[]) totals[resource] += slots[resource];
  }
  return totals;
};

/**
 * A player's full slot supply with the siphon transfer applied: their own
 * settled tiles minus any resource tile siphoned away from them, plus every
 * resource tile they are siphoning from someone else.
 */
export const resourceSlotSupplyWithSiphonTransfer = (input: SiphonSlotSupplyInput): ResourceSlotTotals => {
  const settledTiles = input.settledTilesForPlayer(input.playerId);
  // Radius bonuses come from the full list: the owner's Waterworks/Foundries
  // still stand even when the tile under them is being drained.
  const { waterworksKeys, foundryKeys } = radiusStructureKeysForSettledTiles(settledTiles);
  const kept = settledTiles.filter((tile) => !isResourceTileSiphonedAway(tile, input.playerId));
  const totals = resourceSlotSupplyForPlayer(
    kept,
    waterworksKeys,
    foundryKeys,
    input.grantedSupplyForPlayer(input.playerId),
    input.fishFoodSlotBonusForPlayer(input.playerId)
  );
  const siphonedIn = siphonedInSlotsForPlayer(input);
  for (const resource of Object.keys(siphonedIn) as SlotResource[]) totals[resource] += siphonedIn[resource];
  return totals;
};
