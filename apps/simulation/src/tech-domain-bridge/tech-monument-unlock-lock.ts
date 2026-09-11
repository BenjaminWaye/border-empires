import type { DomainTileState } from "@border-empires/game-domain";
import { MONUMENT_UNLOCK_TECH_ID, monumentTypeForUnlockTechId, type MonumentalStructureType } from "@border-empires/shared";

import { monumentClaimOwnerIdFromTiles } from "../monument-uniqueness.js";

// A monument (Imperial Exchange/World Engine/Aegis Dome/Astral Dock/
// Population Bureau/Titanium Levy) is a single, season-unique prize
// (monument-uniqueness.ts) — once anyone's assembly stands, its unlock tech
// is pointless to research for every player who doesn't already have it.
// Split out of tech-domain-bridge.ts (already over the repo's 500-line soft
// cap) so this addition doesn't grow that file further -- see
// scripts/check-file-line-limits.mjs.

// Returns the id of the monument's unlock tech for each monument type
// currently claimed on the map, so callers can strip those ids out of
// research choices and the tech catalog.
export const claimedMonumentUnlockTechIds = (tiles: Iterable<DomainTileState>): Set<string> => {
  const claimed = new Set<string>();
  const tileList = [...tiles];
  for (const [monumentType, techId] of Object.entries(MONUMENT_UNLOCK_TECH_ID) as Array<[MonumentalStructureType, string]>) {
    if (monumentClaimOwnerIdFromTiles(tileList, monumentType)) claimed.add(techId);
  }
  return claimed;
};

// The command-time reject-gate counterpart: is `techId` a monument's unlock
// tech whose monument is already built, for a player who doesn't already
// have it? Used by chooseTechForPlayer to give a specific rejection reason
// instead of falling through to the generic "requirements not met".
export const monumentAlreadyBuiltRejectReason = (
  techId: string,
  hasTech: boolean,
  tiles: Iterable<DomainTileState>
): string | undefined => {
  if (hasTech) return undefined;
  const monumentType = monumentTypeForUnlockTechId(techId);
  if (!monumentType) return undefined;
  return monumentClaimOwnerIdFromTiles(tiles, monumentType) ? "monument already built this season" : undefined;
};
