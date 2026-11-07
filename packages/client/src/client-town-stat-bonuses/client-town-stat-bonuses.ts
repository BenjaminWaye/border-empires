// Every bonus/penalty feeding a settled own-town's Coin production and
// Manpower contribution cards, written out under the card itself so the
// player can see *why* the number is what it is — connected-town bonus (and
// which town's Trade Nexus switches it on), tier multiplier, support ring,
// Mercantile Charter and per-building totals. Mirrors the factors in
// apps/simulation/src/live-town-summary.ts's goldPerMinute product; terrain
// and coastal modifiers are rendered separately by townStatGridHtml.
import { townPopulationMultiplier } from "@border-empires/game-domain";
import type { TownTerrainProfileId } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { townStatModifiersForProfile } from "../client-town-terrain-modifiers/client-town-terrain-modifiers.js";

export type TownStatBonus = {
  label: string;
  effect: string;
  tone: "positive" | "negative" | "neutral";
};

type Town = NonNullable<Tile["town"]>;

const TIER_LABELS: Record<string, string> = {
  CITY: "City tier",
  GREAT_CITY: "Great City tier",
  METROPOLIS: "Metropolis tier"
};

const percent = (value: number): string => `${value >= 0 ? "+" : "−"}${Math.abs(Math.round(value))}%`;

const toneFor = (value: number): TownStatBonus["tone"] => (value > 0 ? "positive" : value < 0 ? "negative" : "neutral");

const listNames = (names: readonly string[]): string =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

const connectedTownBonus = (town: Town): TownStatBonus | undefined => {
  if (town.populationTier === "SETTLEMENT" || town.connectedTownCount <= 0) return undefined;
  const label = `${town.connectedTownCount} connected ${town.connectedTownCount === 1 ? "town" : "towns"}`;
  if (town.connectedTownBonus === 0) {
    return { label, effect: "+0% — build a Trade Nexus in this network to enable", tone: "neutral" };
  }
  const nexusNames = town.tradeNexusTownNames ?? [];
  const source = nexusNames.length > 0 ? ` (Trade Nexus in ${listNames(nexusNames)})` : "";
  return { label, effect: `${percent(town.connectedTownBonus * 100)}${source}`, tone: toneFor(town.connectedTownBonus) };
};

const GOLD_STAT = /coin|gold/i;
const MANPOWER_STAT = /manpower/i;

const buildingBonuses = (town: Town, matches: RegExp): TownStatBonus[] =>
  (town.townModifierTotals ?? []).flatMap((group) =>
    group.modifiers
      .filter((modifier) => matches.test(modifier.statLabel))
      .map((modifier) => ({ label: group.heading, effect: `${modifier.statLabel} ${modifier.valueText}`, tone: modifier.tone }))
  );

// includeBuildings: false leaves out per-building lines for surfaces that
// already list the town's buildings separately (HUD v2 "In this town").
export const townGoldBonuses = (town: Town, options: { includeBuildings?: boolean } = {}): TownStatBonus[] => {
  if (town.populationTier === "SETTLEMENT") return [];
  if (!town.isFed) return [{ label: "Unfed", effect: "coin production stopped", tone: "negative" }];
  const bonuses: TownStatBonus[] = [];
  const tierMult = townPopulationMultiplier(town.populationTier);
  if (tierMult !== 1) {
    bonuses.push({ label: TIER_LABELS[town.populationTier] ?? "Town tier", effect: percent((tierMult - 1) * 100), tone: toneFor(tierMult - 1) });
  }
  const connected = connectedTownBonus(town);
  if (connected) bonuses.push(connected);
  if (Number.isFinite(town.supportMax) && town.supportMax > 0 && Number.isFinite(town.supportCurrent) && town.supportCurrent < town.supportMax) {
    bonuses.push({
      label: `Support ${town.supportCurrent}/${town.supportMax}`,
      effect: percent((town.supportCurrent / town.supportMax - 1) * 100),
      tone: "negative"
    });
  }
  if (town.firstThreeTownGoldMult && town.firstThreeTownGoldMult !== 1) {
    bonuses.push({ label: "Mercantile Charter", effect: percent((town.firstThreeTownGoldMult - 1) * 100), tone: toneFor(town.firstThreeTownGoldMult - 1) });
  }
  if (town.clearingHouseActive && (town.clearingHouseTownNames?.length ?? 0) > 0) {
    bonuses.push({ label: "Clearing House", effect: `raises Manufactory coin bonus (from ${listNames(town.clearingHouseTownNames!)})`, tone: "positive" });
  }
  if (options.includeBuildings !== false) bonuses.push(...buildingBonuses(town, GOLD_STAT));
  return bonuses;
};

export const townManpowerBonuses = (town: Town): TownStatBonus[] => buildingBonuses(town, MANPOWER_STAT);

// Everything the stat grid's Coin/Manpower cards need beyond their headline
// numbers: terrain/coastal modifiers plus the full bonus breakdown.
export const townStatGridModifiers = (town: Town, terrainProfile: TownTerrainProfileId, coastal: boolean) => ({
  townModifiers: townStatModifiersForProfile(terrainProfile, coastal),
  goldBonuses: townGoldBonuses(town),
  manpowerBonuses: townManpowerBonuses(town)
});

// Building groups still worth their own "<count> <Building>" heading below
// the stat grid: coin/manpower lines already appear inside the cards, so
// they're dropped here (and a group left empty is dropped entirely).
export const townModifierGroupsOutsideStatCards = (town: Town): NonNullable<Town["townModifierTotals"]> =>
  (town.townModifierTotals ?? []).flatMap((group) => {
    const modifiers = group.modifiers.filter((modifier) => !GOLD_STAT.test(modifier.statLabel) && !MANPOWER_STAT.test(modifier.statLabel));
    return modifiers.length > 0 ? [{ ...group, modifiers }] : [];
  });
