// Pure Planetary Defense camp rules (docs/planetary-defense-camps-plan.md).
// A camp is a SETTLED Planetary Defense tile whose campId is its own tile key;
// every other Planetary Defense tile is FRONTIER carrying the campId of the
// camp it belongs to. New camps come only from captured towns and docks.
import type { DomainTileState } from "@border-empires/game-domain";
import { MAX_PLANETARY_DEFENSE_CAMPS } from "@border-empires/shared";

export const PLANETARY_DEFENSE_PLAYER_ID = "barbarian-1";

export const isPlanetaryDefenseOwner = (ownerId: string | undefined): boolean => ownerId?.startsWith("barbarian-") === true;

/** The tile fields camp membership reads; satisfied by both runtime tiles and planner tile views. */
export type CampTileFields = Pick<DomainTileState, "ownerId" | "ownershipState" | "campId">;

/** True when `tile` is a live camp: Planetary Defense, SETTLED, and its own camp. */
export const isPlanetaryDefenseCampTile = (tileKey: string, tile: CampTileFields | undefined): boolean =>
  Boolean(tile && isPlanetaryDefenseOwner(tile.ownerId) && tile.ownershipState === "SETTLED" && tile.campId === tileKey);

/** A town or dock is the only ground that turns into a new camp when Planetary Defense takes it. */
export const foundsCamp = (tile: Pick<DomainTileState, "town" | "dockId"> | undefined): boolean =>
  Boolean(tile?.town || tile?.dockId);

/**
 * Ownership state and camp of a tile Planetary Defense has just taken.
 * `sourceCampId` is the camp the action came from; `campCount` is the number
 * of live camps before this capture.
 */
export const planetaryDefenseCaptureFields = (input: {
  readonly targetKey: string;
  readonly previousTarget: Pick<DomainTileState, "town" | "dockId"> | undefined;
  readonly sourceCampId: string | undefined;
  readonly campCount: number;
}): { ownershipState: "SETTLED" | "FRONTIER"; campId?: string } => {
  if (foundsCamp(input.previousTarget) && input.campCount < MAX_PLANETARY_DEFENSE_CAMPS) {
    return { ownershipState: "SETTLED", campId: input.targetKey };
  }
  return { ownershipState: "FRONTIER", ...(input.sourceCampId ? { campId: input.sourceCampId } : {}) };
};

/** A Planetary Defense tile stripped back to neutral land (keeps the world features it sits on). */
export const releasedPlanetaryDefenseTile = (tile: DomainTileState): DomainTileState => ({
  x: tile.x,
  y: tile.y,
  terrain: tile.terrain,
  ...(tile.landBiome ? { landBiome: tile.landBiome } : {}),
  ...(tile.resource ? { resource: tile.resource } : {}),
  ...(tile.prospectSignature ? { prospectSignature: tile.prospectSignature } : {}),
  ...(tile.dockId ? { dockId: tile.dockId } : {}),
  ...(tile.town ? { town: tile.town } : {}),
  ...(tile.naturalWonder ? { naturalWonder: tile.naturalWonder } : {}),
  ...(tile.watchtower ? { watchtower: tile.watchtower } : {}),
  ...(tile.waystation ? { waystation: tile.waystation } : {}),
  ...(tile.economicStructure ? { economicStructure: tile.economicStructure } : {})
});

/**
 * A fight's reported changes, with each Planetary Defense capture's ownership
 * state worked out now, at resolution. The fight result is built when the lock
 * starts; by the time it resolves the camp count may have crossed the cap.
 */
export const withPlanetaryDefenseChangeStates = <C extends { x: number; y: number; ownerId?: string; ownershipState?: string }>(
  changes: readonly C[],
  tileAt: (x: number, y: number) => Pick<DomainTileState, "town" | "dockId"> | undefined,
  campCount: number
): C[] =>
  changes.map((change) =>
    isPlanetaryDefenseOwner(change.ownerId)
      ? { ...change, ownershipState: planetaryDefenseCaptureFields({ targetKey: `${change.x},${change.y}`, previousTarget: tileAt(change.x, change.y), sourceCampId: undefined, campCount }).ownershipState }
      : change
  );
