import {
  OBSERVATORY_UPKEEP_PER_MIN,
  economicStructureBuildDurationMs,
  structureBuildDurationMs,
  structureCostDefinition
} from "@border-empires/shared";
import type { Tile } from "./client-types.js";

type EconomicStructureType = NonNullable<Tile["economicStructure"]>["type"];

export type StructureInfoKey =
  | "FORT"
  | "OBSERVATORY"
  | "FARMSTEAD"
  | "CAMP"
  | "MINE"
  | "MARKET"
  | "GRANARY"
  | "BANK"
  | "CARAVANARY"
  | "WOODEN_FORT"
  | "LIGHT_OUTPOST"
  | "FUR_SYNTHESIZER"
  | "ADVANCED_FUR_SYNTHESIZER"
  | "IRONWORKS"
  | "ADVANCED_IRONWORKS"
  | "CRYSTAL_SYNTHESIZER"
  | "ADVANCED_CRYSTAL_SYNTHESIZER"
  | "FUEL_PLANT"
  | "FOUNDRY"
  | "CUSTOMS_HOUSE"
  | "GOVERNORS_OFFICE"
  | "GARRISON_HALL"
  | "AIRPORT"
  | "RADAR_SYSTEM"
  | "SIEGE_OUTPOST";

export type StructureInfoView = {
  title: string;
  detail: string;
  glyph: string;
  placement: string;
  image?: string;
  costBits: string[];
  buildTimeLabel: string;
};

export const economicStructureName = (type: EconomicStructureType): string => {
  if (type === "FARMSTEAD") return "Farmstead";
  if (type === "CAMP") return "Camp";
  if (type === "MINE") return "Mine";
  if (type === "GRANARY") return "Granary";
  if (type === "BANK") return "Bank";
  if (type === "AIRPORT") return "Airport";
  if (type === "WOODEN_FORT") return "Wooden Fort";
  if (type === "LIGHT_OUTPOST") return "Light Outpost";
  if (type === "CARAVANARY") return "Caravanary";
  if (type === "FUR_SYNTHESIZER") return "Fur Synthesizer";
  if (type === "ADVANCED_FUR_SYNTHESIZER") return "Advanced Fur Synthesizer";
  if (type === "IRONWORKS") return "Ironworks";
  if (type === "ADVANCED_IRONWORKS") return "Advanced Ironworks";
  if (type === "CRYSTAL_SYNTHESIZER") return "Crystal Synthesizer";
  if (type === "ADVANCED_CRYSTAL_SYNTHESIZER") return "Advanced Crystal Synthesizer";
  if (type === "FUEL_PLANT") return "Fuel Plant";
  if (type === "FOUNDRY") return "Foundry";
  if (type === "GARRISON_HALL") return "Garrison Hall";
  if (type === "CUSTOMS_HOUSE") return "Customs House";
  if (type === "GOVERNORS_OFFICE") return "Governor's Office";
  if (type === "RADAR_SYSTEM") return "Radar System";
  return "Market";
};

export const economicStructureBenefitText = (type: EconomicStructureType): string => {
  if (type === "MARKET") return "Nearby town: +50% fed gold output and +50% gold storage cap.";
  if (type === "GRANARY") return "Nearby town: +20% population growth and +20% gold storage cap.";
  if (type === "BANK") return "Nearby town: +50% city income and +1 flat income.";
  if (type === "AIRPORT") return "Launches oil-fueled bombardment against enemy territory.";
  if (type === "WOODEN_FORT") return "Provides a lighter fortified defense on this owned border tile.";
  if (type === "LIGHT_OUTPOST") return "Provides a lighter attack bonus from this owned border tile.";
  if (type === "CARAVANARY") return "Boosts the nearby town's connected-town income bonus by 25%.";
  if (type === "FUR_SYNTHESIZER") return "Converts gold into steady supply output.";
  if (type === "ADVANCED_FUR_SYNTHESIZER") return "Converts gold into 20% stronger steady supply output.";
  if (type === "IRONWORKS") return "Converts gold into steady iron output.";
  if (type === "ADVANCED_IRONWORKS") return "Converts gold into 20% stronger steady iron output.";
  if (type === "CRYSTAL_SYNTHESIZER") return "Converts gold into steady crystal output.";
  if (type === "ADVANCED_CRYSTAL_SYNTHESIZER") return "Converts gold into 20% stronger steady crystal output.";
  if (type === "FUEL_PLANT") return "Converts gold into steady oil output.";
  if (type === "FOUNDRY") return "Doubles active mine output in a 10-tile radius.";
  if (type === "GARRISON_HALL") return "Boosts settled-tile defense by 20% in a 10-tile radius.";
  if (type === "CUSTOMS_HOUSE") return "Boosts income from a nearby dock by 50%.";
  if (type === "GOVERNORS_OFFICE") return "Reduces food and settled-tile upkeep in a 10-tile radius.";
  if (type === "RADAR_SYSTEM") return "Blocks enemy airport bombardment in a 30-tile radius.";
  if (type === "FARMSTEAD") return "Improves food output on this tile.";
  if (type === "CAMP") return "Improves supply output on this tile.";
  if (type === "MINE") return "Improves iron or crystal output on this tile.";
  return "Strengthens this tile's economy.";
};

export const economicStructureBuildMs = (type: EconomicStructureType): number => {
  return economicStructureBuildDurationMs(type);
};

export const structureInfoForKey = (
  type: StructureInfoKey,
  deps: { formatCooldownShort: (ms: number) => string; prettyToken: (value: string) => string }
): StructureInfoView => {
  const structure = (base: Omit<StructureInfoView, "image">, image?: string): StructureInfoView =>
    image ? { ...base, image } : base;
  const buildTimeLabelFor = (key: StructureInfoKey): string => deps.formatCooldownShort(structureBuildDurationMs(key));
  const imageFor = (key: StructureInfoKey): string | undefined => {
    if (key === "MARKET") return "/overlays/market-overlay.svg";
    if (key === "GRANARY") return "/overlays/granary-overlay.svg";
    if (key === "OBSERVATORY") return "/overlays/observatory-overlay.svg";
    if (key === "BANK") return "/overlays/bank-overlay.svg";
    if (key === "CARAVANARY") return "/overlays/caravanary-overlay.svg";
    if (key === "FUR_SYNTHESIZER") return "/overlays/fur-synthesizer-overlay.svg";
    if (key === "ADVANCED_FUR_SYNTHESIZER") return "/overlays/advanced-fur-synthesizer-overlay.svg";
    if (key === "IRONWORKS") return "/overlays/ironworks-overlay.svg";
    if (key === "ADVANCED_IRONWORKS") return "/overlays/advanced-ironworks-overlay.svg";
    if (key === "CRYSTAL_SYNTHESIZER") return "/overlays/crystal-synthesizer-overlay.svg";
    if (key === "ADVANCED_CRYSTAL_SYNTHESIZER") return "/overlays/advanced-crystal-synthesizer-overlay.svg";
    if (key === "FUEL_PLANT") return "/overlays/fuel-plant-overlay.svg";
    if (key === "FOUNDRY") return "/overlays/foundry-overlay.svg";
    if (key === "CUSTOMS_HOUSE") return "/overlays/customs-house-overlay.svg";
    if (key === "GOVERNORS_OFFICE") return "/overlays/governors-office-overlay.svg";
    if (key === "GARRISON_HALL") return "/overlays/garrison-hall-overlay.svg";
    if (key === "AIRPORT") return "/overlays/airport-overlay.svg";
    if (key === "RADAR_SYSTEM") return "/overlays/radar-system-overlay.svg";
    return undefined;
  };
  const costBitsFor = (key: StructureInfoKey): string[] => {
    const def = structureCostDefinition(key);
    const bits = [`${def.baseGoldCost.toLocaleString()} gold`];
    if (def.resourceCost) bits.push(`${def.resourceCost.amount} ${deps.prettyToken(def.resourceCost.resource).toLowerCase()}`);
    else if (def.resourceOptions?.length) bits.push("30 iron or crystal");
    return bits;
  };
  if (type === "FORT") {
    return structure({
      title: "Fort",
      detail: "Forts add fortified defense on border or dock tiles. An active fort also stops that origin tile from being counter-taken when your attack fails.",
      glyph: "🛡",
      placement: "Build on a settled border tile or dock you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "OBSERVATORY") {
    return structure({
      title: "Observatory",
      detail: "Observatories add local vision, protect against hostile crystal actions, and let you cast crystal abilities inside their radius.",
      glyph: "◉",
      placement: "Build on empty settled land only. Not on towns, docks, or resource tiles.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "WOODEN_FORT") {
    return structure({
      title: "Wooden Fort",
      detail: "Wooden forts provide a lighter defensive anchor on border and dock tiles without consuming iron upkeep.",
      glyph: "🪵",
      placement: "Build on an owned border tile or dock with no town, resource, or other structure.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "FARMSTEAD") {
    return structure({
      title: "Farmstead",
      detail: "Farmsteads increase food yield on farm and fish tiles by 50%.",
      glyph: "🌾",
      placement: "Build on a settled farm or fish resource tile you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "CAMP") {
    return structure({
      title: "Camp",
      detail: "Camps increase supply yield on wood and fur tiles by 50%.",
      glyph: "🦊",
      placement: "Build on a settled wood or fur resource tile you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "MINE") {
    return structure({
      title: "Mine",
      detail: "Mines increase iron or crystal yield on mineral tiles by 50%.",
      glyph: "⛏",
      placement: "Build on a settled iron or crystal resource tile you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "MARKET") {
    return structure({
      title: "Market",
      detail: "Markets are built on a town support tile. They increase that fed town's gold output by 50% and its gold storage cap by 50%.",
      glyph: "◌",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "GRANARY") {
    return structure({
      title: "Granary",
      detail: "Granaries are built on a town support tile. They increase that town's population growth by 20% and raise its gold storage cap by 20%.",
      glyph: "🍞",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "BANK") {
    return structure({
      title: "Bank",
      detail: "Banks are built on a town support tile. They increase city income by 50% and add +1 flat income.",
      glyph: "🏦",
      placement: "Build on an open settled support tile for a city or larger town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "CARAVANARY") {
    return structure({
      title: "Caravanary",
      detail: "Caravanaries are built on a town support tile. They increase that town's connected-town income bonus by 25%.",
      glyph: "🐪",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "FUR_SYNTHESIZER") {
    return structure({
      title: "Fur Synthesizer",
      detail: "Fur Synthesizers convert gold upkeep into steady supply output on a support tile.",
      glyph: "📦",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "ADVANCED_FUR_SYNTHESIZER") {
    return structure({
      title: "Advanced Fur Synthesizer",
      detail: "Advanced Fur Synthesizers upgrade an existing Fur Synthesizer into a 20% stronger supply converter.",
      glyph: "🧵",
      placement: "Upgrade an existing Fur Synthesizer on its current support tile.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "LIGHT_OUTPOST") {
    return structure({
      title: "Light Outpost",
      detail: "Light outposts are cheap offensive staging points that come online quickly but hit less hard than siege outposts.",
      glyph: "⚑",
      placement: "Build on an owned border tile with no town, resource, dock, or other structure.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "IRONWORKS") {
    return structure({
      title: "Ironworks",
      detail: "Ironworks convert gold upkeep into steady iron output on a support tile.",
      glyph: "⚙",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "ADVANCED_IRONWORKS") {
    return structure({
      title: "Advanced Ironworks",
      detail: "Advanced Ironworks upgrade an existing Ironworks into a 20% stronger iron converter.",
      glyph: "⚙",
      placement: "Upgrade an existing Ironworks on its current support tile.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "CRYSTAL_SYNTHESIZER") {
    return structure({
      title: "Crystal Synthesizer",
      detail: "Crystal Synthesizers convert gold upkeep into steady crystal output on a support tile.",
      glyph: "💎",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "ADVANCED_CRYSTAL_SYNTHESIZER") {
    return structure({
      title: "Advanced Crystal Synthesizer",
      detail: "Advanced Crystal Synthesizers upgrade an existing Crystal Synthesizer into a 20% stronger crystal converter.",
      glyph: "💠",
      placement: "Upgrade an existing Crystal Synthesizer on its current support tile.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "FUEL_PLANT") {
    return structure({
      title: "Fuel Plant",
      detail: "Fuel plants convert gold upkeep into steady oil output on a support tile.",
      glyph: "🛢",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "FOUNDRY") {
    return structure({
      title: "Foundry",
      detail: "Foundries double active mine output within 10 tiles.",
      glyph: "🏭",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "CUSTOMS_HOUSE") {
    return structure({
      title: "Customs House",
      detail: "Customs houses are built beside a dock and increase that dock's income by 50%.",
      glyph: "⚓",
      placement: "Build on a settled dock tile you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "GOVERNORS_OFFICE") {
    return structure({
      title: "Governor's Office",
      detail: "Governor's offices reduce local town food upkeep and settled-tile upkeep within 10 tiles.",
      glyph: "🏛",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "GARRISON_HALL") {
    return structure({
      title: "Garrison Hall",
      detail: "Garrison halls increase settled-tile defense by 20% within 10 tiles.",
      glyph: "🪖",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "AIRPORT") {
    return structure({
      title: "Airport",
      detail: "Airports launch oil-fueled bombardments against enemy territory within 30 tiles.",
      glyph: "✈",
      placement: "Build on an open settled support tile for a large town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "RADAR_SYSTEM") {
    return structure({
      title: "Radar System",
      detail: "Radar systems block enemy airport bombardment within 30 tiles and reveal the origin.",
      glyph: "📡",
      placement: "Build on an open settled support tile for a large town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  return structure({
    title: "Siege Outpost",
    detail: "Siege outposts are offensive staging structures for border tiles. They improve attacks launched from their tile.",
    glyph: "⚔",
    placement: "Build on a settled border tile you own.",
    costBits: costBitsFor(type),
    buildTimeLabel: buildTimeLabelFor(type)
  });
};

export const structureInfoButtonHtml = (
  type: StructureInfoKey,
  deps: { formatCooldownShort: (ms: number) => string; prettyToken: (value: string) => string },
  label?: string
): string => `<button class="inline-info-link" type="button" data-structure-info="${type}">${label ?? structureInfoForKey(type, deps).title}</button>`;

export const resourceColor = (resource: string | undefined): string | undefined => {
  if (resource === "FARM") return "#e9f27b";
  if (resource === "FISH") return "#6ec9ff";
  if (resource === "FUR") return "#d6b48a";
  if (resource === "WOOD") return "#7b4f2c";
  if (resource === "IRON") return "#c7ced8";
  if (resource === "GEMS") return "#b175ff";
  return undefined;
};

export const resourceLabel = (resource: string | undefined): string => {
  if (resource === "FARM") return "GRAIN";
  if (resource === "FUR") return "FUR";
  if (resource === "FISH") return "FISH";
  if (resource === "IRON") return "IRON";
  if (resource === "GEMS") return "GEMS";
  if (resource === "WOOD") return "WOOD";
  return resource ?? "";
};

export const resourceIconForKey = (resource: string): string => {
  if (resource === "GOLD") return "◉";
  if (resource === "FOOD") return "🍞";
  if (resource === "IRON") return "⛏";
  if (resource === "CRYSTAL") return "💎";
  if (resource === "SUPPLY") return "🦊";
  if (resource === "SHARD") return "✦";
  return "•";
};

export const strategicResourceKeyForTile = (tile: Tile): "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | undefined => {
  if (tile.resource === "FARM" || tile.resource === "FISH") return "FOOD";
  if (tile.resource === "IRON") return "IRON";
  if (tile.resource === "GEMS") return "CRYSTAL";
  if (tile.resource === "WOOD" || tile.resource === "FUR") return "SUPPLY";
  return undefined;
};

export const tileProductionHtml = (tile: Tile): string => {
  const prodStrategic = Object.entries(tile.yieldRate?.strategicPerDay ?? {})
    .filter(([, value]) => Number(value) > 0)
    .map(([resource, value]) => `${resourceIconForKey(resource)} ${Number(value).toFixed(1)}/day`);
  const gpm = tile.yieldRate?.goldPerMinute ?? 0;
  const parts: string[] = [];
  if (tile.town || gpm > 0) parts.push(`${resourceIconForKey("GOLD")} ${gpm.toFixed(2)}/m`);
  parts.push(...prodStrategic);
  return parts.join(" · ");
};

export const tileUpkeepHtml = (tile: Tile): string => {
  const upkeepFromEntries = { food: 0, iron: 0, supply: 0, crystal: 0, oil: 0, gold: 0 };
  for (const entry of tile.upkeepEntries ?? []) {
    upkeepFromEntries.food += Number(entry.perMinute.FOOD ?? 0);
    upkeepFromEntries.iron += Number(entry.perMinute.IRON ?? 0);
    upkeepFromEntries.supply += Number(entry.perMinute.SUPPLY ?? 0);
    upkeepFromEntries.crystal += Number(entry.perMinute.CRYSTAL ?? 0);
    upkeepFromEntries.oil += Number(entry.perMinute.OIL ?? 0);
    upkeepFromEntries.gold += Number(entry.perMinute.GOLD ?? 0);
  }
  const parts: string[] = [];
  if (upkeepFromEntries.food > 0.001) parts.push(`${resourceIconForKey("FOOD")} ${upkeepFromEntries.food.toFixed(2)}/m`);
  if (upkeepFromEntries.iron > 0.001) parts.push(`${resourceIconForKey("IRON")} ${upkeepFromEntries.iron.toFixed(2)}/m`);
  if (upkeepFromEntries.supply > 0.001) parts.push(`${resourceIconForKey("SUPPLY")} ${upkeepFromEntries.supply.toFixed(2)}/m`);
  if (upkeepFromEntries.crystal > 0.001) parts.push(`${resourceIconForKey("CRYSTAL")} ${upkeepFromEntries.crystal.toFixed(2)}/m`);
  if (upkeepFromEntries.oil > 0.001) parts.push(`${resourceIconForKey("OIL")} ${upkeepFromEntries.oil.toFixed(2)}/m`);
  if (upkeepFromEntries.gold > 0.001) parts.push(`${resourceIconForKey("GOLD")} ${upkeepFromEntries.gold.toFixed(2)}/m`);
  if (parts.length > 0) return parts.join(" · ");
  if (tile.town && typeof tile.town.foodUpkeepPerMinute === "number") parts.push(`${resourceIconForKey("FOOD")} ${tile.town.foodUpkeepPerMinute.toFixed(2)}/m`);
  if (tile.observatory?.status === "active") parts.push(`${resourceIconForKey("CRYSTAL")} ${OBSERVATORY_UPKEEP_PER_MIN.toFixed(2)}/m`);
  return parts.join(" · ");
};

export const storedYieldSummary = (tile: Tile): string => {
  const parts: string[] = [];
  const gold = tile.yield?.gold ?? 0;
  const goldCap = tile.yieldCap?.gold ?? 0;
  const canStoreGold = Boolean(tile.town || tile.dockId || (tile.yieldRate?.goldPerMinute ?? 0) > 0.01 || gold > 0.01);
  if (canStoreGold && (gold > 0.01 || goldCap > 0)) {
    parts.push(`${resourceIconForKey("GOLD")} ${gold.toFixed(1)} / ${goldCap.toFixed(0)}`);
  }
  const strategicCap = tile.yieldCap?.strategicEach ?? 0;
  const strategicEntries = new Map<string, number>(
    Object.entries(tile.yield?.strategic ?? {}).map(([resource, value]) => [resource, Number(value)])
  );
  const primaryStrategic = strategicResourceKeyForTile(tile);
  if (primaryStrategic && strategicCap > 0 && !strategicEntries.has(primaryStrategic)) strategicEntries.set(primaryStrategic, 0);
  for (const [resource, value] of strategicEntries) {
    if (Number(value) <= 0.01 && strategicCap <= 0) continue;
    parts.push(`${resourceIconForKey(resource)} ${Number(value).toFixed(2)} / ${strategicCap.toFixed(1)}`);
  }
  return parts.join(" · ");
};

const yieldCapForResource = (tile: Tile, resource: string): number | undefined => {
  if (!tile.yieldCap) return undefined;
  if (resource === "GOLD") return tile.yieldCap.gold;
  if (resource === "FOOD" || resource === "IRON" || resource === "CRYSTAL" || resource === "SUPPLY" || resource === "SHARD") {
    return tile.yieldCap.strategicEach;
  }
  return undefined;
};

export const formatYieldSummary = (tile: Tile): string => {
  const parts: string[] = [];
  const gold = tile.yield?.gold ?? 0;
  const goldCap = yieldCapForResource(tile, "GOLD");
  if (gold > 0.01 || (goldCap ?? 0) > 0) {
    parts.push(`${resourceIconForKey("GOLD")} ${gold.toFixed(1)} / ${(goldCap ?? 0).toFixed(1)}`);
  }
  for (const key of ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD", "OIL"] as const) {
    const amount = Number(tile.yield?.strategic?.[key] ?? 0);
    const cap = yieldCapForResource(tile, key);
    if (amount <= 0.01 && (cap ?? 0) <= 0) continue;
    parts.push(`${resourceIconForKey(key)} ${amount.toFixed(1)} / ${(cap ?? 0).toFixed(1)}`);
  }
  return parts.length > 0 ? `Yield: ${parts.join("  ")}` : "";
};

export const formatUpkeepSummary = (upkeep: { food: number; iron: number; supply: number; crystal: number; gold: number }): string => {
  const parts: string[] = [];
  if (upkeep.food > 0.001) parts.push(`${resourceIconForKey("FOOD")} ${upkeep.food.toFixed(2)}/m`);
  if (upkeep.iron > 0.001) parts.push(`${resourceIconForKey("IRON")} ${upkeep.iron.toFixed(2)}/m`);
  if (upkeep.supply > 0.001) parts.push(`${resourceIconForKey("SUPPLY")} ${upkeep.supply.toFixed(2)}/m`);
  if (upkeep.crystal > 0.001) parts.push(`${resourceIconForKey("CRYSTAL")} ${upkeep.crystal.toFixed(2)}/m`);
  if (upkeep.gold > 0.001) parts.push(`${resourceIconForKey("GOLD")} ${upkeep.gold.toFixed(2)}/m`);
  return parts.length > 0 ? `Empire upkeep: ${parts.join("  ")}` : "";
};
