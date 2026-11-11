import { FORT_TIER_ORDER, SIEGE_TIER_ORDER, type FortVariant, type SiegeBatteryVariant } from "@border-empires/shared";

// Whether a queued BUILD_STRUCTURE is already done on its tile, so restore /
// reconnect can drop it instead of re-sending a build the server would reject.
// Extracted from client-development-queue.ts (500-line cap).

export type QueueRestoreTileLike = {
  ownerId?: string;
  ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN";
  fort?: { status?: string; variant?: FortVariant | undefined };
  observatory?: { status?: string };
  siegeBattery?: { status?: string; variant?: SiegeBatteryVariant | undefined };
  economicStructure?: { type?: string; status?: string };
};

/**
 * True once `tile` already carries what the entry asks for. A Fortify / Siege
 * picker upgrade (`tier`) is done only once the standing fort or siege tier
 * reaches it -- it may skip a tier, so a mere Fort on the tile is not enough.
 */
export const tileAlreadyHasBuildStructure = (tile: QueueRestoreTileLike, structureType: string, tier?: string): boolean => {
  if (structureType === "FORT") {
    if (!tile.fort) return false;
    const rank = FORT_TIER_ORDER.indexOf(tier as FortVariant);
    return rank < 0 || FORT_TIER_ORDER.indexOf(tile.fort.variant ?? "FORT") >= rank;
  }
  if (structureType === "OBSERVATORY") return Boolean(tile.observatory);
  if (structureType === "SIEGE_BATTERY") {
    if (!tile.siegeBattery) return false;
    const rank = SIEGE_TIER_ORDER.indexOf(tier as SiegeBatteryVariant);
    return rank < 0 || SIEGE_TIER_ORDER.indexOf(tile.siegeBattery.variant ?? "SIEGE_BATTERY") >= rank;
  }
  return tile.economicStructure?.type === structureType;
};
