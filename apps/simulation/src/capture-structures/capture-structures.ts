import { CONVERTER_MODE_FLIP_COOLDOWN_MS, type DomainTileState } from "@border-empires/game-domain";

type CapturableStructureFields = Pick<DomainTileState, "fort" | "observatory" | "siegeOutpost" | "economicStructure">;

// activatedAt is refreshed to the capture moment (not just carried over from
// the previous owner) — the dormancy tie-break rule (docs/manpower-economy-
// rewrite-plan.md §5.4) is "newest built OR captured loses power first," so a
// freshly-captured structure needs to read as freshly-activated too.
const capturedFort = (tile: DomainTileState | undefined, nextOwnerId: string, now: number): DomainTileState["fort"] => {
  if (!tile?.fort || tile.fort.status === "under_construction") return undefined;
  if (tile.fort.status === "removing") {
    const { completesAt: _ignoredCompletesAt, previousStatus: _ignoredPreviousStatus, ...fort } = tile.fort;
    // Garrison was spent taking the fort; new owner starts empty.
    return { ...fort, garrison: 0, ownerId: nextOwnerId, status: "active", activatedAt: now };
  }
  // Garrison resets on capture — defenders fled, attacker must refill.
  return { ...tile.fort, garrison: 0, ownerId: nextOwnerId, activatedAt: now };
};

const capturedObservatory = (tile: DomainTileState | undefined, nextOwnerId: string, now: number): DomainTileState["observatory"] => {
  if (!tile?.observatory || tile.observatory.status === "under_construction") return undefined;
  if (tile.observatory.status === "removing") {
    const { completesAt: _ignoredCompletesAt, previousStatus, ...observatory } = tile.observatory;
    return { ...observatory, ownerId: nextOwnerId, status: previousStatus ?? "active", activatedAt: now };
  }
  return { ...tile.observatory, ownerId: nextOwnerId, activatedAt: now };
};

// Capture resets modeLockedUntil rather than adding a separate
// captureShockUntil field — reusing the flip cooldown as the capture-shock
// timer. This both blocks the new owner from flipping mode immediately and
// (via player-update-economy.ts's modeLockedUntil check) suppresses
// EXCHANGE-mode gold payout until the same window expires, so a captured
// converter can't be harvested for gold the instant it changes hands.
const capturedEconomicStructure = (tile: DomainTileState | undefined, nextOwnerId: string, now: number): DomainTileState["economicStructure"] => {
  if (!tile?.economicStructure || tile.economicStructure.status === "under_construction") return undefined;
  // Relay beacons don't survive capture — like siege outposts, they're razed
  // rather than handed to the attacker, so a captured beacon can't
  // instantly extend the attacker's reach on the spot.
  if (tile.economicStructure.type === "RELAY_BEACON") return undefined;
  if (tile.economicStructure.status === "removing") {
    const { completesAt: _ignoredCompletesAt, previousStatus, ...economicStructure } = tile.economicStructure;
    return {
      ...economicStructure,
      ownerId: nextOwnerId,
      status: previousStatus ?? "inactive",
      activatedAt: now,
      modeLockedUntil: now + CONVERTER_MODE_FLIP_COOLDOWN_MS
    };
  }
  return {
    ...tile.economicStructure,
    ownerId: nextOwnerId,
    activatedAt: now,
    modeLockedUntil: now + CONVERTER_MODE_FLIP_COOLDOWN_MS
  };
};

export const capturedStructureFields = (tile: DomainTileState | undefined, nextOwnerId: string, now: number): CapturableStructureFields => ({
  fort: capturedFort(tile, nextOwnerId, now),
  observatory: capturedObservatory(tile, nextOwnerId, now),
  siegeOutpost: undefined,
  economicStructure: capturedEconomicStructure(tile, nextOwnerId, now)
});
