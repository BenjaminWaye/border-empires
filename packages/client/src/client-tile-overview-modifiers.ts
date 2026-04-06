import { LIGHT_OUTPOST_ATTACK_MULT, OBSERVATORY_VISION_BONUS, WOODEN_FORT_DEFENSE_MULT } from "@border-empires/shared";
import type { Tile } from "./client-types.js";

export type TileOverviewModifier = {
  reason: string;
  effect: string;
  tone: "positive" | "negative" | "neutral";
};

const percentLabel = (value: number): string => `${value >= 0 ? "+" : "-"}${Math.abs(Math.round(value))}%`;

const percentFromMultiplier = (multiplier: number): string => percentLabel((multiplier - 1) * 100);

const connectedLabel = (count: number, noun: string): string => `${count} connected ${noun}${count === 1 ? "" : "s"}`;

export const growthModifierDisplay = (
  label: "Recently captured" | "Nearby war" | "Long time peace"
): TileOverviewModifier => ({
  reason: label === "Long time peace" ? "Long-term peace" : label,
  effect: `${label === "Long time peace" ? "+100%" : "-100%"} population growth`,
  tone: label === "Long time peace" ? "positive" : "negative"
});

export const connectedTownModifier = (count: number, bonus: number): TileOverviewModifier => ({
  reason: connectedLabel(count, "town"),
  effect: `${percentLabel(bonus * 100)} gold production`,
  tone: bonus > 0 ? "positive" : bonus < 0 ? "negative" : "neutral"
});

export const dockModifierDisplay = (
  modifier: NonNullable<NonNullable<Tile["dock"]>["modifiers"]>[number]
): TileOverviewModifier => ({
  reason: modifier.label,
  effect: `${percentLabel(modifier.percent)} gold production`,
  tone: modifier.deltaGoldPerMinute > 0 ? "positive" : modifier.deltaGoldPerMinute < 0 ? "negative" : "neutral"
});

const economicStructureModifiers = (
  type: NonNullable<Tile["economicStructure"]>["type"]
): TileOverviewModifier[] => {
  if (type === "FARMSTEAD" || type === "CAMP" || type === "MINE") {
    return [{ reason: type === "FARMSTEAD" ? "Farmstead" : type === "CAMP" ? "Camp" : "Mine", effect: "+50% production output", tone: "positive" }];
  }
  if (type === "MARKET") {
    return [
      { reason: "Market", effect: "+50% fed gold production", tone: "positive" },
      { reason: "Market", effect: "+50% gold storage cap", tone: "positive" }
    ];
  }
  if (type === "GRANARY") {
    return [
      { reason: "Granary", effect: "+20% population growth", tone: "positive" },
      { reason: "Granary", effect: "+20% gold storage cap", tone: "positive" }
    ];
  }
  if (type === "BANK") {
    return [
      { reason: "Bank", effect: "+50% city income", tone: "positive" },
      { reason: "Bank", effect: "+1 gold/m city income", tone: "positive" }
    ];
  }
  if (type === "AIRPORT") return [{ reason: "Airport", effect: "Bombard enemy territory within 30 tiles", tone: "positive" }];
  if (type === "WOODEN_FORT") return [{ reason: "Wooden Fort", effect: `${percentFromMultiplier(WOODEN_FORT_DEFENSE_MULT)} defense`, tone: "positive" }];
  if (type === "LIGHT_OUTPOST") return [{ reason: "Light Outpost", effect: `${percentFromMultiplier(LIGHT_OUTPOST_ATTACK_MULT)} offense`, tone: "positive" }];
  if (type === "FUR_SYNTHESIZER") return [{ reason: "Fur Synthesizer", effect: "Converts gold into supply production", tone: "positive" }];
  if (type === "ADVANCED_FUR_SYNTHESIZER") return [{ reason: "Advanced Fur Synthesizer", effect: "+20% supply production", tone: "positive" }];
  if (type === "IRONWORKS") return [{ reason: "Ironworks", effect: "Converts gold into iron production", tone: "positive" }];
  if (type === "ADVANCED_IRONWORKS") return [{ reason: "Advanced Ironworks", effect: "+20% iron production", tone: "positive" }];
  if (type === "CRYSTAL_SYNTHESIZER") return [{ reason: "Crystal Synthesizer", effect: "Converts gold into crystal production", tone: "positive" }];
  if (type === "ADVANCED_CRYSTAL_SYNTHESIZER") return [{ reason: "Advanced Crystal Synthesizer", effect: "+20% crystal production", tone: "positive" }];
  if (type === "FUEL_PLANT") return [{ reason: "Fuel Plant", effect: "Converts gold into oil production", tone: "positive" }];
  if (type === "CARAVANARY") return [{ reason: "Caravanary", effect: "+25% connected-town gold production", tone: "positive" }];
  if (type === "FOUNDRY") return [{ reason: "Foundry", effect: "+100% mine production within 10 tiles", tone: "positive" }];
  if (type === "GARRISON_HALL") return [{ reason: "Garrison Hall", effect: "+20% defense within 10 tiles", tone: "positive" }];
  if (type === "CUSTOMS_HOUSE") return [{ reason: "Customs House", effect: "+50% dock gold production", tone: "positive" }];
  if (type === "GOVERNORS_OFFICE") return [{ reason: "Governor's Office", effect: "-20% upkeep within 10 tiles", tone: "positive" }];
  if (type === "RADAR_SYSTEM") return [{ reason: "Radar System", effect: "Blocks airport bombardment within 30 tiles", tone: "positive" }];
  return [];
};

export const tileSelfOverviewModifiers = (tile: Tile): TileOverviewModifier[] => {
  const modifiers: TileOverviewModifier[] = [];
  if (tile.town) {
    if (tile.town.connectedTownCount > 0 && tile.town.connectedTownBonus !== 0) {
      modifiers.push(connectedTownModifier(tile.town.connectedTownCount, tile.town.connectedTownBonus));
    }
    for (const modifier of tile.town.growthModifiers ?? []) modifiers.push(growthModifierDisplay(modifier.label));
    if (tile.town.hasMarket && tile.town.marketActive) modifiers.push(...economicStructureModifiers("MARKET"));
    if (tile.town.hasGranary && tile.town.granaryActive) modifiers.push(...economicStructureModifiers("GRANARY"));
    if (tile.town.hasBank && tile.town.bankActive) modifiers.push(...economicStructureModifiers("BANK"));
  }
  if (tile.dock) {
    for (const modifier of tile.dock.modifiers ?? []) modifiers.push(dockModifierDisplay(modifier));
  }
  if (tile.fort?.status === "active") modifiers.push({ reason: "Fort", effect: "+25% defense", tone: "positive" });
  if (tile.observatory?.status === "active") {
    modifiers.push({ reason: "Observatory", effect: `+${OBSERVATORY_VISION_BONUS} vision`, tone: "positive" });
  }
  if (tile.siegeOutpost?.status === "active") modifiers.push({ reason: "Siege Outpost", effect: "+25% offense", tone: "positive" });
  if (tile.economicStructure?.status === "active") modifiers.push(...economicStructureModifiers(tile.economicStructure.type));
  return modifiers;
};
