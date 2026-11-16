// Choosing a refinery's field at build time and on ASSIGN_REFINERY_FIELD
// (docs/territory-development-plan.md, Phase 2). A field is eligible for a
// town when the owner's land links it within reach and no other refinery of
// the same owner already holds it. Auto-pick takes the nearest eligible field
// by land distance from the town tile, then the smallest tile.
import { compareRefineryTiles, refineryFieldAt, refineryReachFromTownKey, refineryTileKey } from "./refinery-fields.js";
import { effectiveRefineryField, refineryCanHoldField } from "./refinery-processing.js";
import {
  REFINERY_FIELD_RESOURCE_BY_TYPE, isRefineryType,
  type RefineryTile, type RefineryTownResolver, type RefineryType
} from "./refinery-types.js";
import { REFINERY_REACH_LAND_TILES } from "./refinery-constants.js";

export type EligibleRefineryField = {
  /** The field's tile nearest the town (by land steps), the default anchor. */
  anchorX: number;
  anchorY: number;
  distance: number;
  fieldId: string;
  tileCount: number;
  taken: boolean;
};

/**
 * Field ids already held by the owner's refineries that could work
 * (refineryCanHoldField; a refinery under construction counts, so its field
 * is reserved too), except the refinery at `excludeKey`. A refinery that
 * cannot work (captured tile, lost town, being removed) reserves nothing,
 * matching exclusivity in evaluateRefineries.
 */
export const takenRefineryFieldIds = <T extends RefineryTile>(
  tiles: ReadonlyMap<string, T>, ownerId: string, refineryTiles: Iterable<RefineryTile>, resolveTown: RefineryTownResolver, excludeKey?: string
): Set<string> => {
  const taken = new Set<string>();
  for (const tile of refineryTiles) {
    const record = tile.economicStructure;
    if (!record || record.ownerId !== ownerId || !isRefineryType(record.type) || !record.refineryField) continue;
    if (refineryTileKey(tile.x, tile.y) === excludeKey || !refineryCanHoldField(tile, resolveTown)) continue;
    const resolved = effectiveRefineryField(tiles, ownerId, record.refineryField, REFINERY_FIELD_RESOURCE_BY_TYPE[record.type]);
    if (resolved) taken.add(resolved.field.id);
  }
  return taken;
};

/** Every field of the refinery's resource the town links, nearest first. */
export const eligibleRefineryFields = <T extends RefineryTile>(
  tiles: ReadonlyMap<string, T>, ownerId: string, refineryType: RefineryType, townKey: string, takenFieldIds: ReadonlySet<string>,
  reach: ReadonlyMap<string, number> = refineryReachFromTownKey(tiles, ownerId, townKey)
): EligibleRefineryField[] => {
  const resource = REFINERY_FIELD_RESOURCE_BY_TYPE[refineryType];
  const reached = [...reach]
    .map(([key, distance]) => ({ tile: tiles.get(key)!, distance }))
    .filter(({ tile }) => tile.resource === resource)
    .sort((a, b) => a.distance - b.distance || compareRefineryTiles(a.tile, b.tile));
  const seen = new Set<string>();
  const fields: EligibleRefineryField[] = [];
  for (const { tile, distance } of reached) {
    if (seen.has(refineryTileKey(tile.x, tile.y))) continue;
    const field = refineryFieldAt(tiles, tile.x, tile.y, resource)!;
    for (const key of field.keys) seen.add(key);
    fields.push({ anchorX: tile.x, anchorY: tile.y, distance, fieldId: field.id, tileCount: field.tiles.length, taken: takenFieldIds.has(field.id) });
  }
  return fields;
};

export type RefineryFieldChoice =
  | { ok: true; x: number; y: number; fieldId: string }
  | { ok: false; code: "REFINERY_FIELD_INVALID" | "REFINERY_FIELD_UNLINKED" | "REFINERY_FIELD_TAKEN" | "REFINERY_NO_FIELD"; message: string };

/**
 * Validates an explicit field (any tile of it the owner holds) or auto-picks
 * one. On success the returned tile is the anchor to store. A requested tile
 * the owner does not hold (FRONTIER or SETTLED) is rejected with
 * REFINERY_FIELD_INVALID before any resource or link check, so the reply
 * reveals nothing about fogged or unrevealed tiles (no deposit probing).
 */
export const chooseRefineryField = <T extends RefineryTile>(
  tiles: ReadonlyMap<string, T>, ownerId: string, refineryType: RefineryType, townKey: string,
  takenFieldIds: ReadonlySet<string>, requested?: { x: number; y: number }, reach?: ReadonlyMap<string, number>
): RefineryFieldChoice => {
  const fields = eligibleRefineryFields(tiles, ownerId, refineryType, townKey, takenFieldIds, reach);
  const resource = REFINERY_FIELD_RESOURCE_BY_TYPE[refineryType];
  if (!requested) {
    const pick = fields.find((field) => !field.taken);
    return pick
      ? { ok: true, x: pick.anchorX, y: pick.anchorY, fieldId: pick.fieldId }
      : { ok: false, code: "REFINERY_NO_FIELD", message: `no unclaimed ${resource.toLowerCase()} field is linked within ${REFINERY_REACH_LAND_TILES} land tiles of this town` };
  }
  const chosen = tiles.get(refineryTileKey(requested.x, requested.y));
  const held = chosen?.ownerId === ownerId && (chosen.ownershipState === "FRONTIER" || chosen.ownershipState === "SETTLED");
  if (!held) return { ok: false, code: "REFINERY_FIELD_INVALID", message: "choose a deposit tile you hold" };
  const field = refineryFieldAt(tiles, requested.x, requested.y, resource);
  if (!field) return { ok: false, code: "REFINERY_FIELD_INVALID", message: `that tile is not a ${resource.toLowerCase()} deposit` };
  const eligible = fields.find((candidate) => candidate.fieldId === field.id);
  if (!eligible) return { ok: false, code: "REFINERY_FIELD_UNLINKED", message: `that field is not linked to this town by your land within ${REFINERY_REACH_LAND_TILES} tiles` };
  if (eligible.taken) return { ok: false, code: "REFINERY_FIELD_TAKEN", message: "another of your refineries already processes that field" };
  return { ok: true, x: requested.x, y: requested.y, fieldId: field.id };
};
