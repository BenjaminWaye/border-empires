// Town-economy view for the AI build planner — Phase 2 of
// docs/ai-economic-synergy-plan.md.
//
// One compact, serialisable entry per owned town (TOWN tier or higher), built
// on the main thread from the cached connected-town network
// (ConnectedTownNetworkEntry, economy-network.ts) plus a single support-ring
// scan per town. The planner worker reads it to score the stacking buildings
// (Manufactory, Ancillary Depot) and the buildings that amplify them
// (Clearing House, Trade Nexus, Reserve Lattice, Neural Works) by their
// marginal value — see economic-synergy-scoring.ts.
//
// "In reach" means the same thing the economy uses: this town or a town it is
// connected to (the per-town ConnectedTownNetworkEntry neighbourhood, which is
// deliberately not transitive through other towns).
import { townPopulationMultiplier, type DomainTileState } from "@border-empires/game-domain";
import {
  resolvedTownCoastal,
  resolvedTownTerrainProfileId,
  supportRingCandidates,
  supportRingRadiusForTier,
  terrainAdjustedTownManpower,
  townTerrainModifiers
} from "@border-empires/shared";
import type { ConnectedTownNetworkEntry } from "../../economy-network/economy-network.js";
import { supportTileBelongsToTown } from "../../economy-network/economy-network-support-ring.js";

/** Planner snapshots stay bounded for very large empires (AI CPU guardrails). */
export const TOWN_ECONOMY_VIEW_MAX_TOWNS = 64;

export type TownEconomyEntry = {
  townKey: string;
  /** Tier × terrain coin multiplier, in units of a plain TOWN's base coin. */
  baseGoldWeight: number;
  /** Terrain-adjusted base manpower cap (the Ancillary Depot formula's input). */
  baseManpowerCap: number;
  manufactories: number;
  ancillaryDepots: number;
  hasAncillaryFactory: boolean;
  connectedTownCount: number;
  /** Live connected-town coin bonus (0 when no Trade Nexus is in reach). */
  connectedTownBonus: number;
  tradeNexusInReach: boolean;
  clearingHouseInReach: boolean;
  neuralWorksInReach: boolean;
  reserveLatticeInReach: boolean;
  /** Ancillary Factories at this town plus its connected towns. */
  ancillaryFactoriesInReach: number;
  /** Towns in reach (this one included) hosting at least one Ancillary Depot. */
  depotTownsInReach: number;
};

type RingTally = {
  manufactories: number;
  ancillaryDepots: number;
  ownTypes: Set<string>;
};

// One pass over the town tile and its support ring. Counts built and
// under-construction copies alike: the planner cares about what is already
// committed, and counting construction stops it proposing a second Clearing
// House while the first is still going up.
const tallyTownRing = (
  playerId: string,
  townTile: DomainTileState,
  tiles: ReadonlyMap<string, DomainTileState>
): RingTally => {
  const tally: RingTally = { manufactories: 0, ancillaryDepots: 0, ownTypes: new Set() };
  const add = (structure: DomainTileState["economicStructure"]): void => {
    if (!structure || structure.ownerId !== playerId) return;
    if (structure.status !== "active" && structure.status !== "under_construction") return;
    if (structure.type === "MANUFACTORY") tally.manufactories += 1;
    if (structure.type === "ANCILLARY_DEPOT") tally.ancillaryDepots += 1;
    tally.ownTypes.add(structure.type);
  };
  add(townTile.economicStructure);
  const radius = supportRingRadiusForTier(townTile.town?.populationTier);
  for (const { tile: neighbor } of supportRingCandidates(tiles, townTile.x, townTile.y, radius)) {
    if (neighbor.ownerId !== playerId || neighbor.ownershipState !== "SETTLED") continue;
    if (!supportTileBelongsToTown(playerId, neighbor, townTile, tiles)) continue;
    add(neighbor.economicStructure);
  }
  return tally;
};

export const buildTownEconomyView = (
  playerId: string,
  townKeys: Iterable<string>,
  tiles: ReadonlyMap<string, DomainTileState>,
  townNetwork: ReadonlyMap<string, ConnectedTownNetworkEntry>
): TownEconomyEntry[] => {
  const entries: TownEconomyEntry[] = [];
  for (const townKey of townKeys) {
    const townTile = tiles.get(townKey);
    const town = townTile?.town;
    if (!townTile || !town || townTile.ownerId !== playerId || townTile.ownershipState !== "SETTLED") continue;
    if (!town.populationTier || town.populationTier === "SETTLEMENT") continue;
    const profile = resolvedTownTerrainProfileId(town.terrainProfile, townTile.landBiome);
    const coastal = resolvedTownCoastal(town.terrainProfile, townTile.landBiome, town.coastal);
    const network = townNetwork.get(townKey);
    const ring = tallyTownRing(playerId, townTile, tiles);
    const connectedTownCount = network?.connectedTownCount ?? 0;
    const connectedTownBonus = network?.connectedTownBonus ?? 0;
    entries.push({
      townKey,
      baseGoldWeight: townPopulationMultiplier(town.populationTier) * townTerrainModifiers(profile, coastal).goldMultiplier,
      baseManpowerCap: terrainAdjustedTownManpower(town.populationTier, profile, coastal).cap,
      manufactories: ring.manufactories,
      ancillaryDepots: ring.ancillaryDepots,
      hasAncillaryFactory: ring.ownTypes.has("ANCILLARY_FACTORY"),
      connectedTownCount,
      connectedTownBonus,
      tradeNexusInReach: ring.ownTypes.has("TRADE_NEXUS") || connectedTownBonus > 0,
      clearingHouseInReach: ring.ownTypes.has("CLEARING_HOUSE") || (network?.connectedClearingHouseKeys?.length ?? 0) > 0,
      neuralWorksInReach: ring.ownTypes.has("NEURAL_WORKS") || (network?.connectedNeuralWorksKeys?.length ?? 0) > 0,
      reserveLatticeInReach: ring.ownTypes.has("RESERVE_LATTICE") || (network?.connectedReserveLatticeKeys?.length ?? 0) > 0,
      ancillaryFactoriesInReach: (ring.ownTypes.has("ANCILLARY_FACTORY") ? 1 : 0) + (network?.connectedAncillaryFactoryKeys?.length ?? 0),
      depotTownsInReach: (ring.ancillaryDepots > 0 ? 1 : 0) + (network?.connectedAncillaryDepotKeys?.length ?? 0)
    });
  }
  // Keep the richest towns when capping: stacking value is multiplicative
  // with base coin, so these are where the planner's choice matters most.
  entries.sort((left, right) => right.baseGoldWeight - left.baseGoldWeight || left.townKey.localeCompare(right.townKey));
  return entries.length > TOWN_ECONOMY_VIEW_MAX_TOWNS ? entries.slice(0, TOWN_ECONOMY_VIEW_MAX_TOWNS) : entries;
};
