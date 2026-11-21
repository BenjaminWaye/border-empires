// Per-field tile recovery rules for event replay (event-recovery.ts), split out
// to keep that file under the 500-line cap. Each reads a TILE_DELTA_BATCH
// delta over the tile recovered so far: a field present in the delta wins,
// absent means unchanged.
import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";

type TileDelta = Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }>["tileDeltas"][number];
type ExistingTile = Pick<DomainTileState, "ownerId" | "warScarLevel" | "warScarUntil" | "razedWreck" | "razedWreckUntil" | "campId">;

// Battle scars (shared war-scars.ts): same "absent = unchanged, present but
// not a number = cleared" rule as captureHoldUntil.
export const recoverWarScars = (tileDelta: TileDelta, existing: ExistingTile | undefined): Pick<DomainTileState, "warScarLevel" | "warScarUntil"> => {
  const level = "warScarLevel" in tileDelta ? tileDelta.warScarLevel : existing?.warScarLevel;
  const until = "warScarUntil" in tileDelta ? tileDelta.warScarUntil : existing?.warScarUntil;
  return typeof level === "number" && typeof until === "number" ? { warScarLevel: level, warScarUntil: until } : {};
};

// Razed wreck (shared razed-wreck.ts): the same rule again.
export const recoverRazedWreck = (tileDelta: TileDelta, existing: ExistingTile | undefined): Pick<DomainTileState, "razedWreck" | "razedWreckUntil"> => {
  const kind = "razedWreck" in tileDelta ? tileDelta.razedWreck : existing?.razedWreck;
  const until = "razedWreckUntil" in tileDelta ? tileDelta.razedWreckUntil : existing?.razedWreckUntil;
  return typeof kind === "string" && kind && typeof until === "number" ? { razedWreck: kind, razedWreckUntil: until } : {};
};

// Planetary Defense camp id: a present key wins ("" / undefined = cleared), else keep the existing one.
// Only a barbarian-owned tile keeps one, since a persisted clear can drop out of JSON as undefined.
export const recoverCampId = (tileDelta: TileDelta, existing: ExistingTile | undefined): Pick<DomainTileState, "campId"> => {
  const ownerId = "ownerId" in tileDelta ? tileDelta.ownerId : existing?.ownerId;
  const campId = "campId" in tileDelta ? tileDelta.campId : existing?.campId;
  return typeof campId === "string" && campId && ownerId?.startsWith("barbarian-") ? { campId } : {};
};
