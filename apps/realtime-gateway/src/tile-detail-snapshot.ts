import { OBSERVATORY_UPKEEP_PER_MIN } from "@border-empires/shared";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import { buildTileYieldView } from "../../simulation/src/tile-yield-view.js";

import {
  AIRPORT_OIL_UPKEEP_PER_MIN,
  BANK_FOOD_UPKEEP,
  CAMP_GOLD_UPKEEP,
  CRYSTAL_SYNTHESIZER_GOLD_UPKEEP,
  CUSTOMS_HOUSE_GOLD_UPKEEP,
  FARMSTEAD_GOLD_UPKEEP,
  FOUNDRY_GOLD_UPKEEP,
  FUEL_PLANT_GOLD_UPKEEP,
  FUR_SYNTHESIZER_GOLD_UPKEEP,
  GARRISON_HALL_GOLD_UPKEEP,
  GOVERNORS_OFFICE_GOLD_UPKEEP,
  GRANARY_GOLD_UPKEEP,
  IRONWORKS_GOLD_UPKEEP,
  LIGHT_OUTPOST_GOLD_UPKEEP,
  MARKET_FOOD_UPKEEP,
  MINE_GOLD_UPKEEP,
  RADAR_SYSTEM_GOLD_UPKEEP,
  WOODEN_FORT_GOLD_UPKEEP
} from "../../../packages/server/src/server-game-constants.js";

type SnapshotTile = PlayerSubscriptionSnapshot["tiles"][number];
type TileUpdate = Record<string, unknown>;
type YieldSourceTile = Parameters<typeof buildTileYieldView>[0];

const keyFor = (x: number, y: number): string => `${x},${y}`;

const parseTown = (tile: SnapshotTile): Partial<import("@border-empires/shared").Tile["town"]> | undefined => {
  if (!tile?.townJson) return undefined;
  try {
    return JSON.parse(tile.townJson) as Partial<import("@border-empires/shared").Tile["town"]>;
  } catch {
    return undefined;
  }
};

const parseStructure = <T>(value?: string): T | undefined => {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
};

const supportSummaryForTown = (
  tilesByKey: ReadonlyMap<string, SnapshotTile>,
  ownerId: string,
  x: number,
  y: number
): { supportCurrent: number; supportMax: number } => {
  let supportCurrent = 0;
  let supportMax = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const neighbor = tilesByKey.get(keyFor(x + dx, y + dy));
      if (!neighbor || neighbor.terrain !== "LAND" || neighbor.dockId) continue;
      supportMax += 1;
      if (neighbor.ownerId === ownerId && neighbor.ownershipState === "SETTLED") supportCurrent += 1;
    }
  }
  return { supportCurrent, supportMax };
};

const derivedTownSupportStructures = (
  tilesByKey: ReadonlyMap<string, SnapshotTile>,
  ownerId: string,
  x: number,
  y: number
): { hasMarket: boolean; hasGranary: boolean; hasBank: boolean } => {
  let hasMarket = false;
  let hasGranary = false;
  let hasBank = false;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const neighbor = tilesByKey.get(keyFor(x + dx, y + dy));
      if (!neighbor || neighbor.ownerId !== ownerId || neighbor.ownershipState !== "SETTLED") continue;
      const structure = parseStructure<{ type?: string; status?: string }>(neighbor.economicStructureJson);
      if (!structure || structure.status !== "active") continue;
      if (structure.type === "MARKET") hasMarket = true;
      if (structure.type === "GRANARY") hasGranary = true;
      if (structure.type === "BANK") hasBank = true;
    }
  }
  return { hasMarket, hasGranary, hasBank };
};

const derivedTownIsFed = (
  tilesByKey: ReadonlyMap<string, SnapshotTile>,
  ownerId: string,
  x: number,
  y: number
): boolean => {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const neighbor = tilesByKey.get(keyFor(x + dx, y + dy));
      if (!neighbor || neighbor.ownerId !== ownerId || neighbor.ownershipState !== "SETTLED") continue;
      if (neighbor.resource === "FARM" || neighbor.resource === "FISH") return true;
    }
  }
  return false;
};

const structureUpkeepPerMinute = (structureType: string): Partial<Record<"GOLD" | "FOOD" | "CRYSTAL" | "OIL", number>> => {
  switch (structureType) {
    case "FARMSTEAD": return { GOLD: FARMSTEAD_GOLD_UPKEEP / 10 };
    case "CAMP": return { GOLD: CAMP_GOLD_UPKEEP / 10 };
    case "MINE": return { GOLD: MINE_GOLD_UPKEEP / 10 };
    case "GRANARY": return { GOLD: GRANARY_GOLD_UPKEEP / 10 };
    case "MARKET": return { FOOD: MARKET_FOOD_UPKEEP / 10 };
    case "BANK": return { FOOD: BANK_FOOD_UPKEEP / 10 };
    case "WOODEN_FORT": return { GOLD: WOODEN_FORT_GOLD_UPKEEP / 10 };
    case "LIGHT_OUTPOST": return { GOLD: LIGHT_OUTPOST_GOLD_UPKEEP / 10 };
    case "FUR_SYNTHESIZER":
    case "ADVANCED_FUR_SYNTHESIZER": return { GOLD: FUR_SYNTHESIZER_GOLD_UPKEEP / 10 };
    case "IRONWORKS":
    case "ADVANCED_IRONWORKS": return { GOLD: IRONWORKS_GOLD_UPKEEP / 10 };
    case "CRYSTAL_SYNTHESIZER":
    case "ADVANCED_CRYSTAL_SYNTHESIZER": return { GOLD: CRYSTAL_SYNTHESIZER_GOLD_UPKEEP / 10 };
    case "FUEL_PLANT": return { GOLD: FUEL_PLANT_GOLD_UPKEEP / 10 };
    case "FOUNDRY": return { GOLD: FOUNDRY_GOLD_UPKEEP / 10 };
    case "CUSTOMS_HOUSE": return { GOLD: CUSTOMS_HOUSE_GOLD_UPKEEP / 10 };
    case "GARRISON_HALL": return { GOLD: GARRISON_HALL_GOLD_UPKEEP / 10 };
    case "GOVERNORS_OFFICE": return { GOLD: GOVERNORS_OFFICE_GOLD_UPKEEP / 10 };
    case "RADAR_SYSTEM": return { GOLD: RADAR_SYSTEM_GOLD_UPKEEP / 10 };
    case "AIRPORT": return { OIL: AIRPORT_OIL_UPKEEP_PER_MIN };
    default: return {};
  }
};

export const buildSnapshotTileDetail = (
  snapshot: PlayerSubscriptionSnapshot | undefined,
  playerId: string,
  x: number,
  y: number
): TileUpdate | undefined => {
  const tile = snapshot?.tiles.find((candidate) => candidate.x === x && candidate.y === y);
  if (!tile) return undefined;
  const update: TileUpdate = { ...tile, detailLevel: "full" };
  if (tile.ownerId !== playerId || tile.ownershipState !== "SETTLED") return update;

  const tilesByKey = new Map((snapshot?.tiles ?? []).map((entry) => [keyFor(entry.x, entry.y), entry] as const));

  const upkeepEntries: Array<{ label: string; perMinute: Record<string, number> }> = [];
  const parsedTown = parseTown(tile);
  const supportSummary = supportSummaryForTown(tilesByKey, playerId, x, y);
  const supportStructures = derivedTownSupportStructures(tilesByKey, playerId, x, y);
  const populationTier = parsedTown?.populationTier ?? tile.townPopulationTier ?? "SETTLEMENT";
  const isFed = populationTier === "SETTLEMENT" ? true : derivedTownIsFed(tilesByKey, playerId, x, y);
  const baseGoldPerMinute =
    typeof parsedTown?.baseGoldPerMinute === "number" && parsedTown.baseGoldPerMinute > 0.0001
      ? parsedTown.baseGoldPerMinute
      : populationTier === "SETTLEMENT"
        ? 1
        : 2;
  const supportRatio = supportSummary.supportMax <= 0 ? 1 : supportSummary.supportCurrent / supportSummary.supportMax;
  const goldPerMinute =
    populationTier === "SETTLEMENT"
      ? baseGoldPerMinute
      : isFed
        ? baseGoldPerMinute *
          supportRatio *
          (supportStructures.hasMarket ? 1.5 : 1) *
          (supportStructures.hasBank ? 1.5 : 1)
        : 0;
  const town = tile.townType || parsedTown
    ? {
        ...(parsedTown ?? {}),
        type: parsedTown?.type ?? tile.townType,
        populationTier,
        supportCurrent: supportSummary.supportCurrent,
        supportMax: supportSummary.supportMax,
        isFed,
        hasMarket: supportStructures.hasMarket,
        marketActive: supportStructures.hasMarket && isFed,
        hasGranary: supportStructures.hasGranary,
        granaryActive: supportStructures.hasGranary,
        hasBank: supportStructures.hasBank,
        bankActive: supportStructures.hasBank,
        baseGoldPerMinute,
        goldPerMinute,
        cap: Math.max(0, goldPerMinute) * 60 * 8 * (supportStructures.hasMarket ? 1.5 : 1)
      }
    : undefined;
  if (town) update.townJson = JSON.stringify(town);
  if (town && typeof town.foodUpkeepPerMinute === "number" && town.foodUpkeepPerMinute > 0.0001) {
    upkeepEntries.push({ label: "Town", perMinute: { FOOD: Number(town.foodUpkeepPerMinute.toFixed(4)) } });
  }
  upkeepEntries.push({ label: "Settled land", perMinute: { GOLD: 0.04 } });

  const fort = parseStructure<{ status?: string }>(tile.fortJson);
  if (fort?.status === "active") upkeepEntries.push({ label: "Fort", perMinute: { GOLD: 1, IRON: 0.025 } });
  const siegeOutpost = parseStructure<{ status?: string }>(tile.siegeOutpostJson);
  if (siegeOutpost?.status === "active") upkeepEntries.push({ label: "Siege outpost", perMinute: { GOLD: 1, SUPPLY: 0.025 } });
  const observatory = parseStructure<{ status?: string }>(tile.observatoryJson);
  if (observatory?.status === "active") upkeepEntries.push({ label: "Observatory", perMinute: { CRYSTAL: Number(OBSERVATORY_UPKEEP_PER_MIN.toFixed(4)) } });
  const structure = parseStructure<{ type?: string; status?: string }>(tile.economicStructureJson);
  if (structure?.status === "active" && structure.type) {
    const upkeep = structureUpkeepPerMinute(structure.type);
    const perMinute = {
      ...(upkeep.FOOD ? { FOOD: Number(upkeep.FOOD.toFixed(4)) } : {}),
      ...(upkeep.GOLD ? { GOLD: Number(upkeep.GOLD.toFixed(4)) } : {}),
      ...(upkeep.CRYSTAL ? { CRYSTAL: Number(upkeep.CRYSTAL.toFixed(4)) } : {}),
      ...(upkeep.OIL ? { OIL: Number(upkeep.OIL.toFixed(4)) } : {})
    };
    if (Object.keys(perMinute).length > 0) upkeepEntries.push({ label: structure.type, perMinute });
  }
  if (upkeepEntries.length > 0) update.upkeepEntries = upkeepEntries;

  // Keep tile-detail production metadata consistent with the derived town state.
  // Stored yield buffers come from the authoritative snapshot when present; they
  // cannot be reconstructed accurately here without the last-collected timestamp.
  const domainTile: YieldSourceTile = {
    x: tile.x,
    y: tile.y,
    terrain: tile.terrain ?? "LAND",
    ...(tile.resource ? { resource: tile.resource as YieldSourceTile["resource"] } : {}),
    ...(tile.dockId ? { dockId: tile.dockId } : {}),
    ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
    ...(tile.ownershipState ? { ownershipState: tile.ownershipState as YieldSourceTile["ownershipState"] } : {}),
    ...(town ? { town: town as YieldSourceTile["town"] } : {}),
    ...(structure ? { economicStructure: structure as YieldSourceTile["economicStructure"] } : {})
  };
  const now = Date.now();
  const fallbackYieldView = buildTileYieldView(domainTile, now, now);
  if (fallbackYieldView?.yieldRate) update.yieldRate = fallbackYieldView.yieldRate;
  if (fallbackYieldView?.yieldCap) update.yieldCap = fallbackYieldView.yieldCap;
  if (!("yield" in update) && fallbackYieldView?.yield) {
    update.yield = fallbackYieldView.yield;
  }

  return update;
};
