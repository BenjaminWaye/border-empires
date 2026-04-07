import { LIGHT_OUTPOST_ATTACK_MULT, WOODEN_FORT_DEFENSE_MULT } from "@border-empires/shared";
import type { Tile } from "./client-types.js";

export type TileOverviewModifier = {
  reason: string;
  effect: string;
  tone: "positive" | "negative" | "neutral";
};

const percentLabel = (value: number): string => `${value >= 0 ? "+" : "-"}${Math.abs(Math.round(value))}%`;

const multiplierPercentLabel = (value: number): string => percentLabel((value - 1) * 100);

const connectedLabel = (count: number): string => `${count} connected ${count === 1 ? "town" : "towns"}`;

const activeSupportStructureModifiers = (tile: NonNullable<Tile["town"]>): TileOverviewModifier[] => {
  const modifiers: TileOverviewModifier[] = [];
  if (tile.hasMarket && tile.marketActive) {
    modifiers.push({ reason: "Market", effect: "+50% fed gold production", tone: "positive" });
    modifiers.push({ reason: "Market", effect: "+50% gold storage cap", tone: "positive" });
  }
  if (tile.hasGranary && tile.granaryActive) {
    modifiers.push({ reason: "Granary", effect: "+20% population growth", tone: "positive" });
    modifiers.push({ reason: "Granary", effect: "+20% gold storage cap", tone: "positive" });
  }
  if (tile.hasBank && tile.bankActive) {
    modifiers.push({ reason: "Bank", effect: "+50% city income", tone: "positive" });
  }
  return modifiers;
};

const activeEconomicStructureModifiers = (tile: NonNullable<Tile["economicStructure"]>): TileOverviewModifier[] => {
  if (tile.type === "FARMSTEAD" || tile.type === "CAMP" || tile.type === "MINE") {
    return [{ reason: tile.type === "FARMSTEAD" ? "Farmstead" : tile.type === "CAMP" ? "Camp" : "Mine", effect: "+50% production output", tone: "positive" }];
  }
  if (tile.type === "WOODEN_FORT") return [{ reason: "Wooden Fort", effect: `${multiplierPercentLabel(WOODEN_FORT_DEFENSE_MULT)} defense`, tone: "positive" }];
  if (tile.type === "LIGHT_OUTPOST") return [{ reason: "Light Outpost", effect: `${multiplierPercentLabel(LIGHT_OUTPOST_ATTACK_MULT)} offense`, tone: "positive" }];
  if (tile.type === "CARAVANARY") return [{ reason: "Caravanary", effect: "+25% connected-town gold production", tone: "positive" }];
  if (tile.type === "CUSTOMS_HOUSE") return [{ reason: "Customs House", effect: "+50% dock gold production", tone: "positive" }];
  return [];
};

export const tileOverviewModifiersForTile = (tile: Tile): TileOverviewModifier[] => {
  const modifiers: TileOverviewModifier[] = [];

  if (tile.town) {
    if (tile.town.connectedTownCount > 0 && tile.town.connectedTownBonus !== 0) {
      modifiers.push({
        reason: connectedLabel(tile.town.connectedTownCount),
        effect: `${percentLabel(tile.town.connectedTownBonus * 100)} gold production`,
        tone: tile.town.connectedTownBonus > 0 ? "positive" : "negative"
      });
    }
    for (const growth of tile.town.growthModifiers ?? []) {
      modifiers.push({
        reason: growth.label === "Long time peace" ? "Long-term peace" : growth.label,
        effect: `${growth.label === "Long time peace" ? "+100%" : "-100%"} population growth`,
        tone: growth.deltaPerMinute > 0 ? "positive" : growth.deltaPerMinute < 0 ? "negative" : "neutral"
      });
    }
    modifiers.push(...activeSupportStructureModifiers(tile.town));
  }

  for (const modifier of tile.dock?.modifiers ?? []) {
    modifiers.push({
      reason: modifier.label,
      effect: `${percentLabel(modifier.percent)} gold production`,
      tone: modifier.deltaGoldPerMinute > 0 ? "positive" : modifier.deltaGoldPerMinute < 0 ? "negative" : "neutral"
    });
  }

  if (tile.fort?.status === "active") modifiers.push({ reason: "Fort", effect: "+25% defense", tone: "positive" });
  if (tile.siegeOutpost?.status === "active") modifiers.push({ reason: "Siege Outpost", effect: "+25% offense", tone: "positive" });
  if (tile.economicStructure?.status === "active") modifiers.push(...activeEconomicStructureModifiers(tile.economicStructure));

  return modifiers;
};
