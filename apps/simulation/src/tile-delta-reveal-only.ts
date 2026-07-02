import type { DomainTileState } from "@border-empires/game-domain";

import { simulationTileKey } from "./seed-state/seed-state.js";
import { type TileDeltaStringifyCache } from "./tile-delta-stringify-cache/tile-delta-stringify-cache.js";
import type { SimulationTileWireDelta } from "./runtime-types.js";

export const tileDeltaRevealOnly = (
  tile: DomainTileState,
  cache: TileDeltaStringifyCache
): SimulationTileWireDelta => {
  const tileKey = simulationTileKey(tile.x, tile.y);
  const cached = cache.getOrComputeAll(tileKey, tile);
  const fullDelta: SimulationTileWireDelta = {
    x: tile.x,
    y: tile.y,
    ...(tile.terrain ? { terrain: tile.terrain } : {}),
    ...(tile.resource ? { resource: tile.resource } : {}),
    ...(tile.dockId ? { dockId: tile.dockId } : {}),
    ...(cached.shardSiteJson ? { shardSiteJson: cached.shardSiteJson } : {}),
    ownerId: tile.ownerId ?? undefined,
    ownershipState: tile.ownershipState ?? undefined,
    frontierDecayAt: tile.frontierDecayAt ?? undefined,
    frontierDecayKind: tile.frontierDecayKind ?? undefined,
    breachShockUntil: tile.breachShockUntil ?? undefined,
    ...(tile.town ? { townJson: JSON.stringify(tile.town) } : {}),
    ...(tile.town?.type ? { townType: tile.town.type } : {}),
    ...(tile.town?.name ? { townName: tile.town.name } : {}),
    ...(tile.town?.populationTier ? { townPopulationTier: tile.town.populationTier } : {}),
    fortJson: cached.fortJson,
    observatoryJson: cached.observatoryJson,
    siegeOutpostJson: cached.siegeOutpostJson,
    economicStructureJson: cached.economicStructureJson,
    sabotageJson: cached.sabotageJson,
    musterJson: cached.musterJson
  };
  // Always full, never sparse-diffed: this path fires for tiles entering a
  // player's fog-of-war radius, which may be the first delta that specific
  // subscriber has ever received for this tile. The sparse cache's
  // "last emitted" baseline is global across all subscribers, so diffing
  // against it here can omit fields (e.g. ownerId) that this particular
  // recipient never actually saw, rendering owned tiles as neutral client-side.
  cache.setLastEmitted(tileKey, tile);
  return fullDelta;
};
