import type { DomainTileState } from "@border-empires/game-domain";
import { isAutoImproveResource } from "@border-empires/shared";

/**
 * A garrisoned LAND tile carrying a resource that has an improvement (shared auto-improve-prefs.ts), with
 * nothing built on it yet: an auto-improve candidate (runtime-auto-improve.ts). Kept free of runtime imports
 * so the owner tile indexes can use it.
 */
export const isImprovableResourceTile = (tile: DomainTileState): boolean =>
  !!tile.ownerId &&
  !tile.ownerId.startsWith("barbarian-") &&
  tile.ownershipState === "SETTLED" &&
  tile.terrain === "LAND" &&
  isAutoImproveResource(tile.resource) &&
  !tile.economicStructure &&
  !tile.observatory &&
  !tile.siegeBattery;
