import { FORT_DEFENSE_MULT, LIGHT_OUTPOST_ATTACK_MULT, WOODEN_FORT_DEFENSE_MULT } from "@border-empires/shared";
import type { Tile } from "../client-types.js";

export type TileOverviewModifier = {
  reason: string;
  effect: string;
  tone: "positive" | "negative" | "neutral";
};

const percentLabel = (value: number): string => `${value >= 0 ? "+" : "-"}${Math.abs(Math.round(value))}%`;

const multiplierPercentLabel = (value: number): string => percentLabel((value - 1) * 100);

const connectedLabel = (count: number): string => `${count} connected ${count === 1 ? "town" : "towns"}`;

const fortModifierForTile = (tile: NonNullable<Tile["fort"]>): TileOverviewModifier => {
  if (tile.variant === "THUNDER_BASTION") return { reason: "Thunder Bastion", effect: "8x defense", tone: "positive" };
  if (tile.variant === "IRON_BASTION") return { reason: "Iron Bastion", effect: "4x defense", tone: "positive" };
  return { reason: "Fort", effect: `${FORT_DEFENSE_MULT}x defense`, tone: "positive" };
};

const hasActiveTownCaptureShock = (tile: Tile, nowMs = Date.now()): boolean =>
  typeof tile.town?.captureShockUntil === "number" && tile.town.captureShockUntil > nowMs;

const activeSupportStructureModifiers = (tile: NonNullable<Tile["town"]>): TileOverviewModifier[] => {
  const modifiers: TileOverviewModifier[] = [];
  if (tile.hasMarket && tile.marketActive) {
    modifiers.push({ reason: "Market", effect: "+50% town gold production", tone: "positive" });
    modifiers.push({ reason: "Market", effect: "higher production raises gold cap", tone: "positive" });
  }
  if (tile.hasSeedGranary && tile.seedGranaryActive) {
    modifiers.push({ reason: "Seed Granary", effect: "+30% population growth", tone: "positive" });
  } else if (tile.hasGranary && tile.granaryActive) {
    if (tile.seedGranaryBuffed) {
      modifiers.push({ reason: "Granary (Seed Granary boost)", effect: "+30% population growth", tone: "positive" });
    } else {
      modifiers.push({ reason: "Granary", effect: "+15% population growth", tone: "positive" });
    }
  }
  if (tile.hasBank && tile.bankActive) {
    modifiers.push({ reason: "Bank", effect: "+50% city income", tone: "positive" });
  }
  if (tile.hasClearingHouse && tile.clearingHouseActive) {
    modifiers.push({ reason: "Clearing House", effect: "+25% Market effect, +20% Bank effect, +0.5 Bank income", tone: "positive" });
  }
  return modifiers;
};

const activeEconomicStructureModifiers = (tile: NonNullable<Tile["economicStructure"]>): TileOverviewModifier[] => {
  if (tile.type === "FARMSTEAD" || tile.type === "WATERWORKS" || tile.type === "CAMP") {
    return [{
      reason: tile.type === "FARMSTEAD" ? "Farmstead (farm food only)" : tile.type === "WATERWORKS" ? "Waterworks (radius support)" : "Camp",
      effect: tile.type === "WATERWORKS" ? "+50% farmstead food; raises food cap" : tile.type === "CAMP" ? "+50% supply, +15 supply cap" : "+50% farm food, +18 food cap",
      tone: "positive"
    }];
  }
  if (tile.type === "WOODEN_FORT") return [{ reason: "Wooden Fort", effect: `${multiplierPercentLabel(WOODEN_FORT_DEFENSE_MULT)} defense`, tone: "positive" }];
  if (tile.type === "LIGHT_OUTPOST") return [{ reason: "Light Outpost", effect: `${multiplierPercentLabel(LIGHT_OUTPOST_ATTACK_MULT)} offense`, tone: "positive" }];
  if (tile.type === "CARAVANARY") return [{ reason: "Caravanary", effect: "+25% connected-town gold production", tone: "positive" }];
  if (tile.type === "CUSTOMS_HOUSE") return [{ reason: "Harbor Exchange", effect: "+1 gold / minute per connected owned dock", tone: "positive" }];
  return [];
};

export const tileOverviewModifiersForTile = (tile: Tile): TileOverviewModifier[] => {
  const modifiers: TileOverviewModifier[] = [];
  const nowMs = Date.now();

  if (tile.town) {
    const inCaptureShock = hasActiveTownCaptureShock(tile, nowMs);
    if (inCaptureShock) {
      modifiers.push({
        reason: "Recently captured",
        effect: tile.ownershipState === "SETTLED" ? "population growth paused" : "town manpower and production paused until settled",
        tone: "negative"
      });
    }
    if (tile.town.populationTier !== "SETTLEMENT" && tile.town.connectedTownCount > 0 && tile.town.connectedTownBonus !== 0) {
      modifiers.push({
        reason: connectedLabel(tile.town.connectedTownCount),
        effect: `${percentLabel(tile.town.connectedTownBonus * 100)} gold production`,
        tone: tile.town.connectedTownBonus > 0 ? "positive" : "negative"
      });
    }
    for (const growth of tile.town.growthModifiers ?? []) {
      if (inCaptureShock) continue;
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

  if (tile.fort?.status === "active" && (tile.fort.disabledUntil ?? 0) <= nowMs) {
    modifiers.push(fortModifierForTile(tile.fort));
  }
  if (tile.siegeOutpost?.status === "active") modifiers.push({ reason: "Siege Outpost", effect: "+25% offense", tone: "positive" });
  if (tile.economicStructure?.status === "active" && tile.economicStructure.type === "MINE") {
    modifiers.push({
      reason: "Mine",
      effect: tile.resource === "IRON" ? "+50% iron production" : tile.resource === "GEMS" ? "+50% crystal production" : "+50% strategic resource production",
      tone: "positive"
    });
  }
  if (tile.economicStructure?.status === "active") modifiers.push(...activeEconomicStructureModifiers(tile.economicStructure));

  return modifiers;
};
