import type { DomainStrategicResourceKey, DomainTileState } from "@border-empires/game-domain";
import {
  structureBuildGoldCost,
  structureCostDefinition,
  structureShowsOnTile,
  type EconomicStructureType,
  type Terrain
} from "@border-empires/shared";

import { forEachFrontierNeighbor } from "../frontier-topology.js";
import {
  economicStructureTypesForSupportedTown,
  openTownSupportNeighborTiles,
  townSupportStructureShowsOnTile
} from "../town-support-lookup.js";
import type { PlannerOwnedStructureCounts } from "./planner-owned-structure-counts.js";

type StrategicResourceKey = DomainStrategicResourceKey;

export type StructurePlannerPlayer = {
  id: string;
  points: number;
  techIds?: readonly string[];
  strategicResources?: Partial<Record<StrategicResourceKey, number>>;
  settledTileCount?: number;
  townCount?: number;
  incomePerMinute?: number;
  ownedStructureCounts?: PlannerOwnedStructureCounts;
};

export type StructurePlannerTile = {
  x: number;
  y: number;
  terrain: Terrain;
  ownerId?: string | undefined;
  ownershipState?: DomainTileState["ownershipState"] | undefined;
  resource?: DomainTileState["resource"] | undefined;
  dockId?: string | undefined;
  town?: {
    supportMax?: number | undefined;
    supportCurrent?: number | undefined;
    populationTier?: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS" | undefined;
  } | null | undefined;
  fort?: { ownerId?: string | undefined; status?: string | undefined } | null | undefined;
  observatory?: { ownerId?: string | undefined; status?: string | undefined } | null | undefined;
  siegeOutpost?: { ownerId?: string | undefined; status?: string | undefined } | null | undefined;
  economicStructure?: { ownerId?: string | undefined; type?: EconomicStructureType | undefined; status?: string | undefined } | null | undefined;
};

type TileLookup = ReadonlyMap<string, StructurePlannerTile>;

const resourceStock = (
  player: StructurePlannerPlayer,
  resource: StrategicResourceKey
): number => Math.max(0, player.strategicResources?.[resource] ?? 0);

const tileKeyOf = (x: number, y: number): string => `${x},${y}`;

type OwnedStructureCounts = {
  FORT: number;
  SIEGE_OUTPOST: number;
  economic: Map<EconomicStructureType, number>;
};

const EMPTY_OWNED_STRUCTURE_COUNTS: OwnedStructureCounts = {
  FORT: 0,
  SIEGE_OUTPOST: 0,
  economic: new Map()
};

const tallyOwnedStructures = (
  playerId: string,
  tiles: Iterable<StructurePlannerTile>
): OwnedStructureCounts => {
  const counts: OwnedStructureCounts = {
    FORT: 0,
    SIEGE_OUTPOST: 0,
    economic: new Map()
  };
  for (const tile of tiles) {
    if (tile.fort?.ownerId === playerId) counts.FORT += 1;
    if (tile.siegeOutpost?.ownerId === playerId) counts.SIEGE_OUTPOST += 1;
    const econ = tile.economicStructure;
    if (econ?.ownerId === playerId && econ.type) {
      counts.economic.set(econ.type, (counts.economic.get(econ.type) ?? 0) + 1);
    }
  }
  return counts;
};

const economicCount = (counts: OwnedStructureCounts, type: EconomicStructureType): number =>
  counts.economic.get(type) ?? 0;

const plannedOwnedStructureCount = (
  player: StructurePlannerPlayer,
  fallbackCounts: OwnedStructureCounts,
  structureKind: "FORT" | "SIEGE_OUTPOST" | EconomicStructureType
): number => {
  const cached = player.ownedStructureCounts?.[structureKind];
  if (typeof cached === "number") return cached;
  if (structureKind === "FORT") return fallbackCounts.FORT;
  if (structureKind === "SIEGE_OUTPOST") return fallbackCounts.SIEGE_OUTPOST;
  return economicCount(fallbackCounts, structureKind);
};

const supportedTownCount = (playerId: string, tile: StructurePlannerTile, tilesByKey: TileLookup): number => {
  let count = 0;
  forEachFrontierNeighbor(tile.x, tile.y, (nx, ny) => {
    const neighbor = tilesByKey.get(`${nx},${ny}`);
    if (neighbor?.ownerId === playerId && neighbor.ownershipState === "SETTLED" && neighbor.town) count += 1;
  });
  return count;
};

const supportedDockCount = (playerId: string, tile: StructurePlannerTile, tilesByKey: TileLookup): number => {
  let count = 0;
  forEachFrontierNeighbor(tile.x, tile.y, (nx, ny) => {
    const neighbor = tilesByKey.get(`${nx},${ny}`);
    if (neighbor?.ownerId === playerId && neighbor.ownershipState === "SETTLED" && neighbor.dockId) count += 1;
  });
  return count;
};

const tileOpenForStructure = (tile: StructurePlannerTile): boolean =>
  !tile.observatory && !tile.siegeOutpost && !tile.economicStructure;

const structureVisibleOnTile = (
  structureType: "FORT" | "SIEGE_OUTPOST" | EconomicStructureType,
  playerId: string,
  tile: StructurePlannerTile,
  tilesByKey: TileLookup
): boolean =>
  structureShowsOnTile(structureType, {
    ownershipState: tile.ownershipState,
    resource: tile.resource,
    dockId: tile.dockId,
    townPopulationTier: tile.town?.populationTier,
    supportedTownCount: supportedTownCount(playerId, tile, tilesByKey),
    supportedDockCount: supportedDockCount(playerId, tile, tilesByKey)
  });

const playerTechSet = (player: StructurePlannerPlayer): ReadonlySet<string> => new Set(player.techIds ?? []);

const canAffordGold = (player: StructurePlannerPlayer, goldCost: number): boolean => player.points >= goldCost;

const canAffordStructure = (
  player: StructurePlannerPlayer,
  techSet: ReadonlySet<string>,
  structureType: EconomicStructureType,
  existingOwnedCount: number
): boolean => {
  const requiredTech: Partial<Record<EconomicStructureType, string>> = {
    FARMSTEAD: "agriculture",
    CAMP: "leatherworking",
    MINE: "mining",
    MARKET: "trade",
    GRANARY: "pottery",
    BANK: "coinage"
  };
  const requiredTechId = requiredTech[structureType];
  if (requiredTechId && !techSet.has(requiredTechId)) return false;
  if (!canAffordGold(player, structureBuildGoldCost(structureType, existingOwnedCount))) return false;
  const resourceCost = structureCostDefinition(structureType).resourceCost;
  if (!resourceCost) return true;
  return resourceStock(player, resourceCost.resource) >= resourceCost.amount;
};

const foodCoverageLow = (player: StructurePlannerPlayer): boolean =>
  resourceStock(player, "FOOD") <= Math.max(24, (player.townCount ?? 0) * 12);

const economyWeak = (player: StructurePlannerPlayer): boolean =>
  (player.incomePerMinute ?? 0) < Math.max(3, (player.settledTileCount ?? 0) * 0.45);

export const chooseBestEconomicBuild = (
  player: StructurePlannerPlayer,
  ownedTiles: readonly StructurePlannerTile[],
  tilesByKey: TileLookup,
  candidateTiles: readonly StructurePlannerTile[] = ownedTiles
): { tile: StructurePlannerTile; structureType: EconomicStructureType } | undefined => {
  let best: { tile: StructurePlannerTile; structureType: EconomicStructureType; score: number } | undefined;
  const foodLow = foodCoverageLow(player);
  const econWeak = economyWeak(player);
  const counts = player.ownedStructureCounts ? EMPTY_OWNED_STRUCTURE_COUNTS : tallyOwnedStructures(player.id, ownedTiles);
  const techSet = playerTechSet(player);
  for (const tile of candidateTiles) {
    if (tile.ownerId !== player.id || tile.ownershipState !== "SETTLED" || tile.terrain !== "LAND") continue;
    if (!tileOpenForStructure(tile)) continue;
    const candidates: Array<{ type: EconomicStructureType; score: number }> = [];
    // Town-support structures (MARKET/BANK/GRANARY) build on an open,
    // already-SETTLED neighbor tile assigned to this town
    // (resolveTownSupportTarget in runtime-structure-command-handlers.ts),
    // never on the town tile itself. Computed once per tile — the neighbor
    // scan is identical regardless of which of the three types is chosen, so
    // scanning it per-candidate-type would triple an 8-neighbor scan for no
    // reason (see town-support-lookup.ts).
    let openSupportNeighbors: readonly StructurePlannerTile[] | undefined;
    let existingSupportStructureTypes: ReadonlySet<EconomicStructureType> | undefined;
    const townKey = tileKeyOf(tile.x, tile.y);
    if (tile.resource === "FARM" || tile.resource === "FISH") {
      candidates.push({ type: "FARMSTEAD", score: foodLow ? 190 : 70 });
    } else if (tile.resource === "WOOD" || tile.resource === "FUR") {
      candidates.push({ type: "CAMP", score: econWeak ? 58 : 42 });
    } else if (tile.resource === "IRON" || tile.resource === "GEMS") {
      candidates.push({ type: "MINE", score: econWeak ? 62 : 46 });
    } else if (tile.town && tile.town.populationTier !== "SETTLEMENT" &&
        (typeof tile.town.supportCurrent !== "number" || typeof tile.town.supportMax !== "number" || tile.town.supportCurrent < tile.town.supportMax)) {
      openSupportNeighbors = openTownSupportNeighborTiles(tilesByKey, player.id, townKey);
      // A town missing support capacity does NOT guarantee an open neighbor
      // exists to host the structure — the town may be boxed in by FRONTIER
      // neighbors or neighbors already holding a structure. Without this
      // check the AI proposed BUILD_ECONOMIC_STRUCTURE for towns with
      // nowhere to place it, and the runtime rejected ~99.9% of those
      // commands in production, burning the tick's action budget every time.
      if (openSupportNeighbors.length > 0) {
        // Computed once per tile, not per candidate type — see
        // economicStructureTypesForSupportedTown's docs in town-support-lookup.ts.
        existingSupportStructureTypes = economicStructureTypesForSupportedTown(tilesByKey, player.id, townKey);
        candidates.push({ type: foodLow ? "GRANARY" : "MARKET", score: foodLow ? 160 : 54 });
        candidates.push({ type: "BANK", score: econWeak ? 30 : 66 });
        candidates.push({ type: "GRANARY", score: foodLow ? 132 : 20 });
      }
    }
    for (const candidate of candidates) {
      const existingOwnedCount = plannedOwnedStructureCount(player, counts, candidate.type);
      if (!canAffordStructure(player, techSet, candidate.type, existingOwnedCount)) continue;
      if (!structureVisibleOnTile(candidate.type, player.id, tile, tilesByKey)) continue;
      if (
        openSupportNeighbors &&
        !openSupportNeighbors.some((neighbor) => townSupportStructureShowsOnTile(tilesByKey, player.id, neighbor, candidate.type))
      ) {
        continue;
      }
      // A town needing MORE support capacity overall (supportCurrent <
      // supportMax, checked above) does not mean it's missing THIS specific
      // type — it might already have a GRANARY and just need a MARKET/BANK.
      // The runtime rejects a duplicate ("town already has granary") via
      // economicStructureForSupportedTown; without this same check here the
      // AI kept proposing a structure type the town already had, on repeat,
      // every rejection-cooldown cycle, forever (see town-support-lookup.ts).
      if (existingSupportStructureTypes?.has(candidate.type)) {
        continue;
      }
      const next = { tile, structureType: candidate.type, score: candidate.score };
      if (!best || next.score > best.score) best = next;
    }
  }
  return best ? { tile: best.tile, structureType: best.structureType } : undefined;
};

export const chooseBestFortBuild = (
  player: StructurePlannerPlayer,
  ownedTiles: readonly StructurePlannerTile[],
  tilesByKey: TileLookup,
  candidateTiles: readonly StructurePlannerTile[] = ownedTiles
): StructurePlannerTile | undefined => {
  if (!playerTechSet(player).has("masonry")) return undefined;
  if (resourceStock(player, "IRON") < 45) return undefined;
  const counts = player.ownedStructureCounts ? EMPTY_OWNED_STRUCTURE_COUNTS : tallyOwnedStructures(player.id, ownedTiles);
  if (!canAffordGold(player, structureBuildGoldCost("FORT", plannedOwnedStructureCount(player, counts, "FORT")))) return undefined;

  let best: { tile: StructurePlannerTile; score: number } | undefined;
  for (const tile of candidateTiles) {
    if (tile.ownerId !== player.id || tile.ownershipState !== "SETTLED" || tile.terrain !== "LAND") continue;
    if (tile.fort || !tileOpenForStructure(tile)) continue;
    if (!structureVisibleOnTile("FORT", player.id, tile, tilesByKey)) continue;
    let adjacentLandCount = 0;
    let hostileAdjacency = 0;
    let neutralAdjacency = 0;
    forEachFrontierNeighbor(tile.x, tile.y, (nx, ny) => {
      const neighbor = tilesByKey.get(`${nx},${ny}`);
      if (!neighbor || neighbor.terrain !== "LAND") return;
      adjacentLandCount++;
      if (neighbor.ownerId && neighbor.ownerId !== player.id) hostileAdjacency++;
      else if (!neighbor.ownerId) neutralAdjacency++;
    });
    let score = 0;
    if (tile.town) score += 140;
    if (tile.dockId) score += 120;
    if (tile.resource) score += 80;
    if (adjacentLandCount <= 3) score += 70;
    if (tile.dockId && adjacentLandCount <= 3) score += 110;
    score += hostileAdjacency * 24 + neutralAdjacency * (tile.dockId ? 10 : 4);
    if (!best || score > best.score) best = { tile, score };
  }
  return best && best.score >= 70 ? best.tile : undefined;
};

export const chooseBestSiegeOutpostBuild = (
  player: StructurePlannerPlayer,
  ownedTiles: readonly StructurePlannerTile[],
  tilesByKey: TileLookup,
  candidateTiles: readonly StructurePlannerTile[] = ownedTiles
): StructurePlannerTile | undefined => {
  if (!playerTechSet(player).has("leatherworking")) return undefined;
  if (resourceStock(player, "SUPPLY") < 45) return undefined;
  const counts = player.ownedStructureCounts ? EMPTY_OWNED_STRUCTURE_COUNTS : tallyOwnedStructures(player.id, ownedTiles);
  if (!canAffordGold(player, structureBuildGoldCost("SIEGE_OUTPOST", plannedOwnedStructureCount(player, counts, "SIEGE_OUTPOST")))) return undefined;

  let best: { tile: StructurePlannerTile; score: number } | undefined;
  for (const tile of candidateTiles) {
    if (tile.ownerId !== player.id || tile.terrain !== "LAND") continue;
    if (tile.fort || tile.observatory || tile.siegeOutpost || tile.economicStructure) continue;
    if (!structureVisibleOnTile("SIEGE_OUTPOST", player.id, tile, tilesByKey)) continue;
    let hostileAdjacency = 0;
    let townPressure = 0;
    let economicPressure = 0;
    forEachFrontierNeighbor(tile.x, tile.y, (nx, ny) => {
      const neighbor = tilesByKey.get(`${nx},${ny}`);
      if (!neighbor || neighbor.terrain !== "LAND" || !neighbor.ownerId || neighbor.ownerId === player.id) return;
      hostileAdjacency += 1;
      if (neighbor.town) townPressure += 1;
      if (neighbor.dockId || neighbor.resource || neighbor.economicStructure) economicPressure += 1;
    });
    if (hostileAdjacency <= 0) continue;
    let score = hostileAdjacency * 120 + townPressure * 140 + economicPressure * 90;
    if (tile.town) score += 50;
    if (tile.dockId) score += 70;
    if (!best || score > best.score) best = { tile, score };
  }
  return best && best.score >= 180 ? best.tile : undefined;
};
