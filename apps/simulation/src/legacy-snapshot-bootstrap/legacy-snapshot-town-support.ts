// Town-growth / support-ring helpers for the legacy snapshot bootstrap,
// extracted from legacy-snapshot-bootstrap.ts.
import { terrainAt } from "@border-empires/shared";
import type {
  SnapshotPlayersSection,
  SnapshotSystemsSection,
  SnapshotTerritorySection,
  TownDefinition
} from "@border-empires/game-domain";
import {
  townFoodUpkeepPerMinute as sharedTownFoodUpkeepPerMinute,
  townPopulationMultiplier as sharedTownPopulationMultiplier
} from "@border-empires/game-domain";
import type { LegacySnapshotPlayerEconomy } from "../legacy-snapshot-economy/legacy-snapshot-economy.js";

export const parseTileKey = (tileKey: string): { x: number; y: number } | undefined => {
  const [rawX, rawY] = tileKey.split(",");
  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
  return { x, y };
};

export const wrap = (value: number, size: number): number => ((value % size) + size) % size;

export const townPopulationTierFromSnapshot = (town: TownDefinition): "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS" => {
  if (town.isSettlement && town.population < 1_000) return "SETTLEMENT";
  if (town.population >= 5_000_000) return "METROPOLIS";
  if (town.population >= 1_000_000) return "GREAT_CITY";
  if (town.population >= 100_000) return "CITY";
  if (town.population >= 1_000) return "TOWN";
  return "SETTLEMENT";
};

// townPopulationMultiplier/townFoodUpkeepPerMinute delegate to the shared
// game-domain functions (imported as sharedTownPopulationMultiplier /
// sharedTownFoodUpkeepPerMinute below) — see the doc comments on those for
// why the SETTLEMENT case (0.6 here previously) was confirmed-dead code, and
// why food upkeep is always 0 now (§5.3/§5.4 FOOD-as-slots rewrite). This
// file used to keep its own independently-hardcoded copies of both tables,
// which is why it still charged non-zero food upkeep for TOWN/CITY/etc.
// tiers years after that mechanic was retired everywhere else.
export const townPopulationMultiplier = (town: TownDefinition): number =>
  sharedTownPopulationMultiplier(townPopulationTierFromSnapshot(town));

export const townFoodUpkeepPerMinute = (town: TownDefinition): number =>
  sharedTownFoodUpkeepPerMinute(townPopulationTierFromSnapshot(town));

export const townGrowthModifiersForSnapshot = (input: {
  now: number;
  town: TownDefinition;
  ownerId: string | undefined;
  isSettled: boolean;
  isFed: boolean;
  growthPerMinute: number;
  townCaptureShockUntilByTile: Map<string, number>;
  townGrowthShockUntilByTile: Map<string, number>;
}): Array<{ label: "Recently captured" | "Nearby war" | "Long time peace"; deltaPerMinute: number }> => {
  if (!input.ownerId || !input.isSettled || !input.isFed || input.growthPerMinute <= 0) return [];
  if ((input.townCaptureShockUntilByTile.get(input.town.tileKey) ?? 0) > input.now) {
    return [{ label: "Recently captured", deltaPerMinute: -input.growthPerMinute }];
  }
  if ((input.townGrowthShockUntilByTile.get(input.town.tileKey) ?? 0) > input.now) {
    return [{ label: "Nearby war", deltaPerMinute: -input.growthPerMinute }];
  }
  return [{ label: "Long time peace", deltaPerMinute: input.growthPerMinute }];
};

export const supportRatioForTown = (
  townTileKey: string,
  ownerId: string,
  ownershipByTile: Map<string, string>,
  ownershipStateByTile: Map<string, string>,
  world: { width: number; height: number }
): { supportCurrent: number; supportMax: number } => {
  const coords = parseTileKey(townTileKey);
  if (!coords) return { supportCurrent: 0, supportMax: 0 };
  let supportCurrent = 0;
  let supportMax = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const x = wrap(coords.x + dx, world.width);
      const y = wrap(coords.y + dy, world.height);
      if (terrainAt(x, y) !== "LAND") continue;
      supportMax += 1;
      const tileKey = `${x},${y}`;
      if (ownershipByTile.get(tileKey) === ownerId && ownershipStateByTile.get(tileKey) === "SETTLED") supportCurrent += 1;
    }
  }
  return { supportCurrent, supportMax };
};

export const supportedStructureAtTown = (
  townTileKey: string,
  ownerId: string,
  structureType: string,
  ownershipByTile: Map<string, string>,
  ownershipStateByTile: Map<string, string>,
  structuresByTile: Map<string, { ownerId: string; type: string; status: string }>,
  world: { width: number; height: number }
): boolean => {
  const coords = parseTileKey(townTileKey);
  if (!coords) return false;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const x = wrap(coords.x + dx, world.width);
      const y = wrap(coords.y + dy, world.height);
      if (terrainAt(x, y) !== "LAND") continue;
      const tileKey = `${x},${y}`;
      if (ownershipByTile.get(tileKey) !== ownerId || ownershipStateByTile.get(tileKey) !== "SETTLED") continue;
      const structure = structuresByTile.get(tileKey);
      if (!structure || structure.ownerId !== ownerId || structure.status !== "active") continue;
      if (structure.type === structureType) return true;
    }
  }
  return false;
};

// mintworks-stacking task: counting sibling of supportedStructureAtTown above,
// same support-ring loop, for Mintworks's now-additive-per-instance gold bonus
// (mintworksGoldProductionMultiplier). Boolean uniqueness/gate checks elsewhere
// in this file keep using supportedStructureAtTown unchanged.
export const countedStructuresAtTown = (
  townTileKey: string,
  ownerId: string,
  structureType: string,
  ownershipByTile: Map<string, string>,
  ownershipStateByTile: Map<string, string>,
  structuresByTile: Map<string, { ownerId: string; type: string; status: string }>,
  world: { width: number; height: number }
): number => {
  const coords = parseTileKey(townTileKey);
  if (!coords) return 0;
  let count = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const x = wrap(coords.x + dx, world.width);
      const y = wrap(coords.y + dy, world.height);
      if (terrainAt(x, y) !== "LAND") continue;
      const tileKey = `${x},${y}`;
      if (ownershipByTile.get(tileKey) !== ownerId || ownershipStateByTile.get(tileKey) !== "SETTLED") continue;
      const structure = structuresByTile.get(tileKey);
      if (!structure || structure.ownerId !== ownerId || structure.status !== "active") continue;
      if (structure.type === structureType) count += 1;
    }
  }
  return count;
};

export const activeEconomicStructuresByTile = (
  systems: SnapshotSystemsSection
): Map<string, { ownerId: string; type: string; status: string }> => {
  const structures = new Map<string, { ownerId: string; type: string; status: string }>();
  for (const structure of systems.economicStructures ?? []) {
    structures.set(structure.tileKey, {
      ownerId: structure.ownerId,
      type: structure.type,
      status: structure.status
    });
  }
  return structures;
};

export const fedTownKeysByPlayerFromSnapshot = (
  playersSection: SnapshotPlayersSection,
  territory: SnapshotTerritorySection,
  ownershipByTile: Map<string, string>,
  ownershipStateByTile: Map<string, string>,
  playerEconomies: Map<string, LegacySnapshotPlayerEconomy>
): Map<string, Set<string>> => {
  const result = new Map<string, Set<string>>();
  for (const player of playersSection.players ?? []) {
    const economy = playerEconomies.get(player.id);
    const availableFood = Math.max(
      0,
      (economy?.strategicResources.FOOD ?? 0) + (economy?.strategicProductionPerMinute.FOOD ?? 0)
    );
    let remainingFood = availableFood;
    const fedTownKeys = new Set<string>();
    const ownedTowns = (territory.towns ?? []).filter(
      (town) =>
        ownershipByTile.get(town.tileKey) === player.id &&
        ownershipStateByTile.get(town.tileKey) === "SETTLED"
    );
    for (const town of ownedTowns) {
      const need = townFoodUpkeepPerMinute(town);
      if (need <= 0) {
        fedTownKeys.add(town.tileKey);
        continue;
      }
      if (remainingFood + 1e-9 >= need) {
        fedTownKeys.add(town.tileKey);
        remainingFood = Math.max(0, remainingFood - need);
      }
    }
    result.set(player.id, fedTownKeys);
  }
  return result;
};
