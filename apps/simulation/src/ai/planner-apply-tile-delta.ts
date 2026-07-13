/**
 * Applies a tile delta to an in-memory tile map.  Used by the AI planner
 * worker to incrementally update its world view.
 */

import { parseTownSupport, parseOwnedStructure, parseEconomicStructure } from "./planner-tile-delta-parse.js";
import type { SimulationTileDelta } from "./planner-tile-delta-parse.js";
import type { PlannerTileView } from "./planner-world-view.js";

export const applyTileDelta = (tilesByKey: Map<string, PlannerTileView>, delta: SimulationTileDelta): void => {
  const key = `${delta.x},${delta.y}`;
  const existing = tilesByKey.get(key);
  const terrain = delta.terrain ?? existing?.terrain;
  if (!terrain) return;
  const next: PlannerTileView = existing ?? { x: delta.x, y: delta.y, terrain };

  if (delta.terrain) next.terrain = delta.terrain;
  if ("resource" in delta) {
    if (delta.resource) next.resource = delta.resource as PlannerTileView["resource"];
    else delete next.resource;
  }
  if ("dockId" in delta) {
    if (delta.dockId) next.dockId = delta.dockId;
    else delete next.dockId;
  }
  if ("ownerId" in delta) {
    if (delta.ownerId) next.ownerId = delta.ownerId;
    else delete next.ownerId;
  }
  if ("ownershipState" in delta) {
    if (delta.ownershipState) next.ownershipState = delta.ownershipState as PlannerTileView["ownershipState"];
    else delete next.ownershipState;
  }
  if ("townJson" in delta) {
    const town = parseTownSupport(delta.townJson);
    if (town) next.town = town;
    else delete next.town;
  }
  if ("fortJson" in delta) {
    const fort = parseOwnedStructure(delta.fortJson);
    if (fort) next.fort = fort;
    else delete next.fort;
  }
  if ("observatoryJson" in delta) {
    const observatory = parseOwnedStructure(delta.observatoryJson);
    if (observatory) next.observatory = observatory;
    else delete next.observatory;
  }
  if ("siegeOutpostJson" in delta) {
    const siegeOutpost = parseOwnedStructure(delta.siegeOutpostJson);
    if (siegeOutpost) next.siegeOutpost = siegeOutpost;
    else delete next.siegeOutpost;
  }
  if ("economicStructureJson" in delta) {
    const economicStructure = parseEconomicStructure(delta.economicStructureJson);
    if (economicStructure) next.economicStructure = economicStructure;
    else delete next.economicStructure;
  }

  tilesByKey.set(key, next);
};
