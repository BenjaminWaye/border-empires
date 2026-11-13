// Evaluating one refinery without a per-owner refinery list, for the
// per-viewer wire projection (docs/territory-development-plan.md, Phase 2).
import { MAX_SUPPORT_RING_RADIUS } from "../town-growth/town-growth.js";
import { supportRingCandidates } from "../town-growth/town-support-ring.js";
import { refineryTileKey } from "./refinery-fields.js";
import { effectiveRefineryField, evaluateRefineries, type RefineryEvaluation } from "./refinery-processing.js";
import {
  REFINERY_FIELD_RESOURCE_BY_TYPE, isRefineryType,
  type RefineryTile, type RefineryTownResolver
} from "./refinery-types.js";
import { REFINERY_REACH_LAND_TILES } from "./refinery-constants.js";

/**
 * A bounded local scan for refineries that could hold the same field as one
 * at hand: every refinery is validated within reach of its town, which sits
 * within the support ring of it, so a rival stands within
 * REFINERY_REACH_LAND_TILES + MAX_SUPPORT_RING_RADIUS of some tile of the
 * field. Used where the caller has no per-owner refinery list (wire projection).
 */
export const refineryRivalTiles = <T extends RefineryTile>(
  tiles: ReadonlyMap<string, T>, fieldTiles: Iterable<{ x: number; y: number }>
): T[] => {
  const radius = REFINERY_REACH_LAND_TILES + MAX_SUPPORT_RING_RADIUS;
  const found = new Map<string, T>();
  for (const fieldTile of fieldTiles) {
    for (const { tile } of supportRingCandidates(tiles, fieldTile.x, fieldTile.y, radius)) {
      if (isRefineryType(tile.economicStructure?.type)) found.set(refineryTileKey(tile.x, tile.y), tile);
    }
  }
  return [...found.values()];
};

/** The refinery on `tile`, evaluated against every refinery that could hold its field; undefined when the tile has none. */
export const evaluateRefineryAt = <T extends RefineryTile>(
  tiles: ReadonlyMap<string, T>, tile: RefineryTile, resolveTown: RefineryTownResolver
): RefineryEvaluation | undefined => {
  const record = tile.economicStructure;
  if (!record || !isRefineryType(record.type)) return undefined;
  const resolved = record.refineryField
    ? effectiveRefineryField(tiles, record.ownerId, record.refineryField, REFINERY_FIELD_RESOURCE_BY_TYPE[record.type])
    : undefined;
  const rivals: RefineryTile[] = resolved ? refineryRivalTiles(tiles, resolved.field.tiles) : [];
  const key = refineryTileKey(tile.x, tile.y);
  return evaluateRefineries(tiles, [tile, ...rivals.filter((rival) => refineryTileKey(rival.x, rival.y) !== key)], resolveTown).get(key);
};
