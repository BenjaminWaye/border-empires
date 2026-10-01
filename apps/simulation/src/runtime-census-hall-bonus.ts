import type { SimulationEvent } from "@border-empires/sim-protocol";
import { CENSUS_HALL_POPULATION_BONUS_PER_CONNECTED_GRANARY, type DomainTileState } from "@border-empires/game-domain";
import type { SimulationTileWireDelta } from "./runtime-types.js";

// Extracted from runtime.ts (over the repo's 500-line cap) so that file can
// keep shrinking as new wiring lands -- a pure code move.
export type CensusHallBonusDeps = {
  censusHallTilesByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  tiles: ReadonlyMap<string, DomainTileState>;
  now: () => number;
  assignedTownKeyForSupportTile: (playerId: string, x: number, y: number) => string | undefined;
  connectedGranaryCountForTown: (playerId: string, townKey: string) => number;
  replaceTileState: (tileKey: string, tile: DomainTileState) => void;
  emitEvent: (event: SimulationEvent) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
};

// Census Hall (tech-tree redesign): +20,000 population (and cap) per
// connected city with an active Incubation Engine (Granary) --
// network-scoped, recomputed every tick rather than granted once, so
// losing a connection or a neighbor's Granary shrinks the bonus back down.
// Mirrors the Assembly Works/Rail Depot "network scan" pattern rather than
// a simple empire-wide tally.
export const applyCensusHallPopulationBonuses = (deps: CensusHallBonusDeps): void => {
  for (const [ownerId, censusHallKeys] of deps.censusHallTilesByOwner) {
    if (censusHallKeys.size === 0) continue;
    for (const censusHallKey of censusHallKeys) {
      const censusHallTile = deps.tiles.get(censusHallKey);
      if (!censusHallTile || censusHallTile.economicStructure?.status !== "active") continue;
      const townKey = deps.assignedTownKeyForSupportTile(ownerId, censusHallTile.x, censusHallTile.y);
      if (!townKey) continue;
      const townTile = deps.tiles.get(townKey);
      if (!townTile?.town || townTile.ownerId !== ownerId) continue;
      const connectedGranaryCount = deps.connectedGranaryCountForTown(ownerId, townKey);
      const desiredBonus = connectedGranaryCount * CENSUS_HALL_POPULATION_BONUS_PER_CONNECTED_GRANARY;
      const appliedBonus = townTile.town.censusHallAppliedBonus ?? 0;
      if (desiredBonus === appliedBonus) continue;
      const delta = desiredBonus - appliedBonus;
      const updatedTownTile: DomainTileState = {
        ...townTile,
        town: {
          ...townTile.town,
          maxPopulation: Math.max(0, (townTile.town.maxPopulation ?? 0) + delta),
          // A growing bonus is an instant grant (matches Incubation
          // Engine's "burst" flavor); a shrinking bonus only lowers the
          // cap -- population naturally sitting above the new cap just
          // stops growing further, it isn't forcibly clawed back.
          population: delta > 0 ? (townTile.town.population ?? 0) + delta : (townTile.town.population ?? 0),
          censusHallAppliedBonus: desiredBonus
        }
      };
      deps.replaceTileState(townKey, updatedTownTile);
      deps.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: `census-hall-bonus:${ownerId}:${deps.now()}`,
        playerId: ownerId,
        tileDeltas: [deps.tileDeltaFromState(updatedTownTile)]
      });
    }
  }
};
