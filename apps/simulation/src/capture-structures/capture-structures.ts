import type { DomainTileState } from "@border-empires/game-domain";
import { MUSTER_SYSTEM_ENABLED } from "@border-empires/shared";

type CapturableStructureFields = Pick<DomainTileState, "fort" | "observatory" | "siegeOutpost" | "economicStructure">;

// activatedAt is refreshed to the capture moment (not just carried over from
// the previous owner) — the dormancy tie-break rule (docs/manpower-economy-
// rewrite-plan.md §5.4) is "newest built OR captured loses power first," so a
// freshly-captured structure needs to read as freshly-activated too.
const capturedFort = (tile: DomainTileState | undefined, nextOwnerId: string, now: number): DomainTileState["fort"] => {
  if (!tile?.fort || tile.fort.status === "under_construction") return undefined;
  if (tile.fort.status === "removing") {
    const { completesAt: _ignoredCompletesAt, previousStatus: _ignoredPreviousStatus, ...fort } = tile.fort;
    // Under muster system: garrison was spent taking the fort; new owner starts empty.
    const garrisonReset = MUSTER_SYSTEM_ENABLED ? { garrison: 0 } : {};
    return { ...fort, ...garrisonReset, ownerId: nextOwnerId, status: "active", activatedAt: now };
  }
  // Under muster system: garrison resets on capture — defenders fled, attacker must refill.
  const garrisonReset = MUSTER_SYSTEM_ENABLED ? { garrison: 0 } : {};
  return { ...tile.fort, ...garrisonReset, ownerId: nextOwnerId, activatedAt: now };
};

const capturedObservatory = (tile: DomainTileState | undefined, nextOwnerId: string, now: number): DomainTileState["observatory"] => {
  if (!tile?.observatory || tile.observatory.status === "under_construction") return undefined;
  if (tile.observatory.status === "removing") {
    const { completesAt: _ignoredCompletesAt, previousStatus, ...observatory } = tile.observatory;
    return { ...observatory, ownerId: nextOwnerId, status: previousStatus ?? "active", activatedAt: now };
  }
  return { ...tile.observatory, ownerId: nextOwnerId, activatedAt: now };
};

const capturedEconomicStructure = (tile: DomainTileState | undefined, nextOwnerId: string, now: number): DomainTileState["economicStructure"] => {
  if (!tile?.economicStructure || tile.economicStructure.status === "under_construction") return undefined;
  if (tile.economicStructure.status === "removing") {
    const { completesAt: _ignoredCompletesAt, previousStatus, ...economicStructure } = tile.economicStructure;
    return { ...economicStructure, ownerId: nextOwnerId, status: previousStatus ?? "inactive", activatedAt: now };
  }
  return { ...tile.economicStructure, ownerId: nextOwnerId, activatedAt: now };
};

export const capturedStructureFields = (tile: DomainTileState | undefined, nextOwnerId: string, now: number): CapturableStructureFields => ({
  fort: capturedFort(tile, nextOwnerId, now),
  observatory: capturedObservatory(tile, nextOwnerId, now),
  siegeOutpost: undefined,
  economicStructure: capturedEconomicStructure(tile, nextOwnerId, now)
});
