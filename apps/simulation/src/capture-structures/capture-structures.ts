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
    return { ...fort, ownerId: nextOwnerId, status: "active", activatedAt: now };
  }
  return { ...tile.fort, ownerId: nextOwnerId, activatedAt: now };
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

/**
 * What survives when a player *abandons* a tile (UNCAPTURE_TILE) rather than
 * losing it in combat. Same razing rules as a capture -- siege outposts and
 * relay beacons are razed, half-built structures don't survive -- but there
 * is no next owner, so each surviving structure keeps its record as-is and
 * simply stops doing anything: every active-structure index and reach-anchor
 * gather is keyed on the *tile's* owner (runtime-tile-index-maintenance.ts,
 * runtime-reach-anchors.ts), so a structure on an unowned tile grants no
 * vision, no casting, no reach and no income, and pays no resource slots.
 * Whoever claims the tile next picks the structures up through
 * capturedStructureFields above.
 */
export const abandonedStructureFields = (tile: DomainTileState): CapturableStructureFields => ({
  fort: tile.fort?.status === "under_construction" ? undefined : tile.fort,
  observatory: tile.observatory?.status === "under_construction" ? undefined : tile.observatory,
  siegeOutpost: undefined,
  economicStructure:
    tile.economicStructure?.status === "under_construction" || tile.economicStructure?.type === "RELAY_BEACON"
      ? undefined
      : tile.economicStructure
});

export const capturedStructureFields = (tile: DomainTileState | undefined, nextOwnerId: string, now: number): CapturableStructureFields => ({
  fort: capturedFort(tile, nextOwnerId, now),
  observatory: capturedObservatory(tile, nextOwnerId, now),
  siegeOutpost: undefined,
  economicStructure: capturedEconomicStructure(tile, nextOwnerId, now)
});
