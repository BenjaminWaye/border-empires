// "Refine at…" from a deposit tile (docs/territory-development-plan.md, Phase
// 2, Client): which of your towns could process this field, which free
// support-ring tile each would give up, and what the field would add there.
import {
  REFINERY_FIELD_RESOURCE_BY_TYPE, REFINERY_REACH_LAND_TILES, REFINERY_TYPE_BY_RESOURCE, isRefineryFieldResource,
  landmarkConstructionBlocker, refineryFieldAt, refineryTileKey, supportRingCandidates, supportRingRadiusForTier,
  type RefineryType
} from "@border-empires/shared";
import { assignedTownForSupportTile } from "../client-support-structures/client-support-structures.js";
import type { Tile } from "../client-types.js";
import { refineryTilesView } from "./refinery-client-status.js";
import { fieldOptionContaining, refineryFieldOptions, type RefineryFieldOption } from "./refinery-field-options.js";

const isOwnTown = (tile: Tile | undefined, me: string): tile is Tile =>
  Boolean(tile?.town && tile.ownerId === me && tile.ownershipState === "SETTLED" && tile.town.populationTier !== "SETTLEMENT");

/**
 * The town's free support-ring tiles: garrisoned, empty, outside landmark
 * footprints and assigned to this town (the same tests the server's
 * openTownSupportNeighborTiles makes), nearest `toward` first.
 */
export const freeRefineryRingTiles = (tiles: ReadonlyMap<string, Tile>, me: string, town: Tile, toward?: { x: number; y: number }): Tile[] => {
  const radius = supportRingRadiusForTier(town.town?.populationTier);
  const free = supportRingCandidates(tiles, town.x, town.y, radius).map(({ tile }) => tile).filter((tile) => {
    if (tile.terrain !== "LAND" || tile.ownerId !== me || tile.ownershipState !== "SETTLED" || tile.dockId) return false;
    if (tile.town || tile.fort || tile.observatory || tile.siegeBattery || tile.economicStructure) return false;
    if (landmarkConstructionBlocker(tiles, tile.x, tile.y)) return false;
    const assigned = assignedTownForSupportTile(tiles, tile, me);
    return assigned?.x === town.x && assigned.y === town.y;
  });
  if (!toward) return free;
  const d = (tile: Tile): number => Math.hypot(tile.x - toward.x, tile.y - toward.y);
  return free.sort((a, b) => d(a) - d(b) || a.x - b.x || a.y - b.y);
};

export type RefineAtTownChoice = {
  townKey: string;
  town: Tile;
  townName: string;
  /** Free ring tiles, nearest the field first; the first is the default site. */
  ringTiles: Tile[];
  option: RefineryFieldOption;
  /** Why this town cannot take the field now; undefined when it can. */
  disabledReason?: string;
};

export const refineryTownName = (town: Tile): string => town.townName ?? `Town at (${town.x}, ${town.y})`;

/** The refinery that processes a deposit tile's resource, if it is a strategic deposit. */
export const refineryTypeForDeposit = (tile: Tile | undefined): RefineryType | undefined =>
  isRefineryFieldResource(tile?.resource) ? REFINERY_TYPE_BY_RESOURCE[tile.resource] : undefined;

/**
 * Your towns whose reach (REFINERY_REACH_LAND_TILES land steps) touches the
 * deposit's field, each with the slot gain and either its default ring tile
 * or why it cannot take the field. Towns that can take it come first.
 */
export const refineAtTownChoices = (tiles: ReadonlyMap<string, Tile>, me: string, deposit: Tile): RefineAtTownChoice[] => {
  const type = refineryTypeForDeposit(deposit);
  if (!type) return [];
  const field = refineryFieldAt(refineryTilesView(tiles), deposit.x, deposit.y, REFINERY_FIELD_RESOURCE_BY_TYPE[type]);
  if (!field) return [];
  const towns = new Map<string, Tile>();
  for (const fieldTile of field.tiles) {
    for (const { tile } of supportRingCandidates(tiles, fieldTile.x, fieldTile.y, REFINERY_REACH_LAND_TILES)) {
      if (isOwnTown(tile, me)) towns.set(refineryTileKey(tile.x, tile.y), tile);
    }
  }
  const choices: RefineAtTownChoice[] = [];
  for (const [townKey, town] of towns) {
    const option = fieldOptionContaining(refineryFieldOptions(tiles, me, type, townKey), deposit.x, deposit.y);
    if (!option) continue;
    const ringTiles = freeRefineryRingTiles(tiles, me, town, deposit);
    const disabledReason = option.status !== "eligible" ? option.reason
      : ringTiles.length === 0 ? "No free support tile in this town" : undefined;
    choices.push({ townKey, town, townName: refineryTownName(town), ringTiles, option, ...(disabledReason ? { disabledReason } : {}) });
  }
  return choices.sort((a, b) => Number(Boolean(a.disabledReason)) - Number(Boolean(b.disabledReason)) ||
    a.option.distance - b.option.distance || a.townKey.localeCompare(b.townKey));
};
