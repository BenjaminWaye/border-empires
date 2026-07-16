/**
 * Runtime-side entry point for town support tile lookups. The actual logic
 * lives in ../town-support-lookup.ts (generic over any tile shape) so the
 * AI planner's chooseBestEconomicBuild can use the EXACT SAME algorithm the
 * runtime uses to decide whether a town-support structure (MARKET/GRANARY/
 * BANK) can actually be placed — see town-support-lookup.ts's file comment
 * for why that used to diverge and what it broke in production.
 */

import type { DomainTileState } from "@border-empires/game-domain";
import type { EconomicStructureType } from "@border-empires/shared";
import {
  assignedTownKeyForSupportTile as assignedTownKeyForSupportTileGeneric,
  economicStructureForSupportedTown as economicStructureForSupportedTownGeneric,
  firstAvailableTownSupportTile as firstAvailableTownSupportTileGeneric,
  supportedDockKeysForTile as supportedDockKeysForTileGeneric,
  supportedTownKeysForTile as supportedTownKeysForTileGeneric
} from "../town-support-lookup.js";

export function supportedTownKeysForTile(
  tiles: ReadonlyMap<string, DomainTileState>,
  playerId: string,
  x: number,
  y: number
): string[] {
  return supportedTownKeysForTileGeneric(tiles, playerId, x, y);
}

export function assignedTownKeyForSupportTile(
  tiles: ReadonlyMap<string, DomainTileState>,
  playerId: string,
  x: number,
  y: number
): string | undefined {
  return assignedTownKeyForSupportTileGeneric(tiles, playerId, x, y);
}

export function supportedDockKeysForTile(
  tiles: ReadonlyMap<string, DomainTileState>,
  playerId: string,
  x: number,
  y: number
): string[] {
  return supportedDockKeysForTileGeneric(tiles, playerId, x, y);
}

export function economicStructureForSupportedTown(
  tiles: ReadonlyMap<string, DomainTileState>,
  playerId: string,
  townKey: string,
  structureType: EconomicStructureType
): DomainTileState | undefined {
  return economicStructureForSupportedTownGeneric(tiles, playerId, townKey, structureType);
}

export function firstAvailableTownSupportTile(
  tiles: ReadonlyMap<string, DomainTileState>,
  playerId: string,
  townKey: string,
  structureType: EconomicStructureType
): DomainTileState | undefined {
  return firstAvailableTownSupportTileGeneric(tiles, playerId, townKey, structureType);
}
