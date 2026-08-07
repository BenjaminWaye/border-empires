/**
 * Shared tile-delta merge helpers used by the AI planner worker and the AI
 * and system command producer workers. Single canonical implementation to
 * avoid duplicating the merge/convert logic (previously this and
 * planner-apply-tile-delta.ts independently reimplemented the same merge,
 * with the latter being the only one that applied town/fort/observatory/
 * siegeOutpost/economicStructure deltas — the former silently dropped those
 * fields for its callers).
 */

import { parseTownSupport, parseOwnedStructure, parseEconomicStructure } from "./planner-tile-delta-parse.js";
import type { SimulationTileDelta } from "./planner-tile-delta-parse.js";
import type { PlannerTileView } from "./planner-world-view.js";

export type { SimulationTileDelta };

export const mergePlannerTileDelta = (
  existing: PlannerTileView | undefined,
  tileDelta: SimulationTileDelta
): PlannerTileView | undefined => {
  const terrain = tileDelta.terrain ?? existing?.terrain;
  if (!terrain) return undefined;
  const next: PlannerTileView = existing ? { ...existing } : { x: tileDelta.x, y: tileDelta.y, terrain };
  if (tileDelta.terrain) next.terrain = tileDelta.terrain;
  if ("resource" in tileDelta) {
    if (tileDelta.resource) next.resource = tileDelta.resource as PlannerTileView["resource"];
    else delete next.resource;
  }
  if ("dockId" in tileDelta) {
    if (tileDelta.dockId) next.dockId = tileDelta.dockId;
    else delete next.dockId;
  }
  if ("ownerId" in tileDelta) {
    if (tileDelta.ownerId) next.ownerId = tileDelta.ownerId;
    else delete next.ownerId;
  }
  if ("ownershipState" in tileDelta) {
    if (tileDelta.ownershipState) next.ownershipState = tileDelta.ownershipState as PlannerTileView["ownershipState"];
    else delete next.ownershipState;
  }
  if ("townJson" in tileDelta) {
    const town = parseTownSupport(tileDelta.townJson);
    if (town) next.town = town;
    else delete next.town;
  }
  if ("fortJson" in tileDelta) {
    const fort = parseOwnedStructure(tileDelta.fortJson);
    if (fort) next.fort = fort;
    else delete next.fort;
  }
  if ("observatoryJson" in tileDelta) {
    const observatory = parseOwnedStructure(tileDelta.observatoryJson);
    if (observatory) next.observatory = observatory;
    else delete next.observatory;
  }
  if ("siegeOutpostJson" in tileDelta) {
    const siegeOutpost = parseOwnedStructure(tileDelta.siegeOutpostJson);
    if (siegeOutpost) next.siegeOutpost = siegeOutpost;
    else delete next.siegeOutpost;
  }
  if ("economicStructureJson" in tileDelta) {
    const economicStructure = parseEconomicStructure(tileDelta.economicStructureJson);
    if (economicStructure) next.economicStructure = economicStructure;
    else delete next.economicStructure;
  }
  return next;
};

/**
 * Applies a tile delta directly to an in-memory tile map (get-merge-set),
 * for callers that own their tile map outright rather than needing the
 * immutable merge result inline (see mergePlannerTileDelta for that case).
 */
export const applyTileDelta = (tilesByKey: Map<string, PlannerTileView>, delta: SimulationTileDelta): void => {
  const key = `${delta.x},${delta.y}`;
  const nextTile = mergePlannerTileDelta(tilesByKey.get(key), delta);
  if (nextTile) tilesByKey.set(key, nextTile);
};

/**
 * Converts a PlannerTileView back to the SimulationTileDelta wire format so
 * backfilled tiles can be sent to the worker via the existing "tile_deltas"
 * message path.
 */
export const toPlannerTileDelta = (tile: PlannerTileView): SimulationTileDelta => ({
  x: tile.x,
  y: tile.y,
  terrain: tile.terrain,
  ...(tile.resource !== undefined ? { resource: tile.resource } : {}),
  ...(tile.dockId !== undefined ? { dockId: tile.dockId } : {}),
  ...(tile.ownerId !== undefined ? { ownerId: tile.ownerId } : {}),
  ...(tile.ownershipState !== undefined ? { ownershipState: tile.ownershipState } : {}),
  ...(tile.town !== undefined ? { townJson: JSON.stringify(tile.town) } : {}),
  ...(tile.fort !== undefined ? { fortJson: JSON.stringify(tile.fort) } : {}),
  ...(tile.observatory !== undefined ? { observatoryJson: JSON.stringify(tile.observatory) } : {}),
  ...(tile.siegeOutpost !== undefined ? { siegeOutpostJson: JSON.stringify(tile.siegeOutpost) } : {}),
  ...(tile.economicStructure !== undefined ? { economicStructureJson: JSON.stringify(tile.economicStructure) } : {})
});
