import type { ManpowerBreakdown } from "@border-empires/sim-protocol";
import {
  GARRISON_HALL_MANPOWER_CAP_BONUS,
  LOGISTICS_GUILD_STANDALONE_REGEN_PER_MINUTE,
  MANPOWER_REGEN_GLOBAL_FLOOR,
  POPULATION_BUREAU_REGEN_PER_MANPOWER_BUILDING,
  RAIL_DEPOT_NETWORK_MANPOWER_CAP_PER_GARRISON_HALL,
  RAIL_DEPOT_NETWORK_MANPOWER_REGEN_PER_LOGISTICS_GUILD,
  STARTING_CAPITAL_MANPOWER_CAP,
  STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE,
  TOWN_MANPOWER_BY_TIER,
  manpowerRegenWeightForSettlementIndex
} from "@border-empires/game-domain";

import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { RuntimePlayer } from "./runtime-types.js";

type TownTier = keyof typeof TOWN_MANPOWER_BY_TIER;

// Starting capital (docs/manpower-economy-rewrite-plan.md §4.3) is a separate,
// always-present manpower source — distinct from TOWN_MANPOWER_BY_TIER.SETTLEMENT
// — and is added on top of every owned town's contribution rather than acting
// as a Math.max floor. A floor would mask a captured town's own contribution
// (e.g. a first SETTLEMENT town would add nothing if its regen sat under the
// floor); additive keeps "capture a town -> visibly more manpower" true from
// town #1 onward.
// §4.4: Garrison Hall grants a flat, unconditional manpower-cap bonus to
// the town it's built in (docs/manpower-economy-rewrite-plan.md §4.4) —
// garrisonHallCount is a simple count of the player's own Garrison Halls,
// regardless of network. railDepotNetworkGarrisonHallCount is the sum,
// across every one of the player's Rail-Depot-anchored connected-town
// networks, of the Garrison Halls in that network (see
// railDepotNetworkGarrisonHallCountForPlayer in economy-network.ts) — kept
// as a separate parameter since it uses a different per-Garrison-Hall rate.
export const playerManpowerCapFromSummary = (
  summary: PlayerRuntimeSummary,
  garrisonHallCount = 0,
  // Tech-tree redesign: this is now Assembly Works' network amplification of
  // Ancillary Factory (Garrison Hall) — Rail Depot no longer touches it.
  assemblyWorksNetworkGarrisonHallCount = 0
): number => {
  let cap = 0;
  for (const tier of summary.ownedTownTierByTile.values()) {
    cap += TOWN_MANPOWER_BY_TIER[tier]?.cap ?? 0;
  }
  cap += garrisonHallCount * GARRISON_HALL_MANPOWER_CAP_BONUS;
  cap += assemblyWorksNetworkGarrisonHallCount * RAIL_DEPOT_NETWORK_MANPOWER_CAP_PER_GARRISON_HALL;
  return STARTING_CAPITAL_MANPOWER_CAP + cap;
};

export const playerManpowerRegenPerMinuteFromSummary = (
  summary: PlayerRuntimeSummary,
  // Tech-tree redesign: Rail Depot's job narrows to Logistics Guild
  // amplification only (see railDepotNetworkLogisticsGuildCountForPlayer).
  railDepotNetworkLogisticsGuildCount = 0,
  logisticsGuildCount = 0,
  populationBureauManpowerBuildingCount = 0,
  // Galactic meta-layer v0 Dyson Array stand-in (§5, §12 of
  // docs/galactic-campaign-design.md): the most recent season's Planet
  // winner's one-time starting bonus, granted via pendingGalacticWonderBonus.
  // See DomainPlayer.galacticWonderManpowerRegenBonusPerMinute.
  galacticWonderManpowerRegenBonusPerMinute = 0
): number => {
  let regen = 0;
  let index = 0;
  for (const tier of summary.ownedTownTierByTile.values()) {
    const base = TOWN_MANPOWER_BY_TIER[tier]?.regenPerMinute ?? 0;
    regen += base * manpowerRegenWeightForSettlementIndex(index);
    index += 1;
  }
  const logisticsGuildStandaloneBonus = logisticsGuildCount * LOGISTICS_GUILD_STANDALONE_REGEN_PER_MINUTE;
  const railDepotNetworkBonus = railDepotNetworkLogisticsGuildCount * RAIL_DEPOT_NETWORK_MANPOWER_REGEN_PER_LOGISTICS_GUILD;
  const populationBureauBonus = populationBureauManpowerBuildingCount * POPULATION_BUREAU_REGEN_PER_MANPOWER_BUILDING;
  return Math.max(
    MANPOWER_REGEN_GLOBAL_FLOOR,
    STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE +
      regen +
      logisticsGuildStandaloneBonus +
      railDepotNetworkBonus +
      populationBureauBonus +
      galacticWonderManpowerRegenBonusPerMinute
  );
};

const townTierLabel = (tier: TownTier, count: number): string => {
  const labels: Record<TownTier, { singular: string; plural: string }> = {
    SETTLEMENT: { singular: "Settlement", plural: "Settlements" },
    TOWN: { singular: "Town", plural: "Towns" },
    CITY: { singular: "City", plural: "Cities" },
    GREAT_CITY: { singular: "Great City", plural: "Great Cities" },
    METROPOLIS: { singular: "Metropolis", plural: "Metropolises" }
  };
  const label = labels[tier];
  if (count === 1) return label.singular;
  return `${count} ${label.plural}`;
};

const manpowerRegenWeightNote = (weight: number): string | undefined => {
  if (weight === 1) return undefined;
  return `${Math.round(weight * 100)}% scaling`;
};

export const playerManpowerBreakdownFromSummary = (
  summary: PlayerRuntimeSummary,
  garrisonHallCount = 0,
  assemblyWorksNetworkGarrisonHallCount = 0,
  railDepotNetworkLogisticsGuildCount = 0,
  logisticsGuildCount = 0,
  populationBureauManpowerBuildingCount = 0,
  galacticWonderManpowerRegenBonusPerMinute = 0
): ManpowerBreakdown => {
  const capByTier = new Map<TownTier, { count: number; amount: number }>();
  const regenByTierAndWeight = new Map<string, { tier: TownTier; count: number; amount: number; weight: number }>();
  let index = 0;
  for (const tier of summary.ownedTownTierByTile.values()) {
    const capBase = TOWN_MANPOWER_BY_TIER[tier]?.cap ?? 0;
    if (capBase !== 0) {
      const current = capByTier.get(tier) ?? { count: 0, amount: 0 };
      capByTier.set(tier, { count: current.count + 1, amount: current.amount + capBase });
    }
    const regenBase = TOWN_MANPOWER_BY_TIER[tier]?.regenPerMinute ?? 0;
    if (regenBase !== 0) {
      const weight = manpowerRegenWeightForSettlementIndex(index);
      const key = `${tier}:${weight}`;
      const current = regenByTierAndWeight.get(key) ?? { tier, count: 0, amount: 0, weight };
      regenByTierAndWeight.set(key, { ...current, count: current.count + 1, amount: current.amount + regenBase * weight });
    }
    index += 1;
  }
  const capLines = [...capByTier.entries()].map(([tier, line]) => ({
    label: townTierLabel(tier, line.count),
    amount: line.amount
  }));
  const regenLines = [...regenByTierAndWeight.values()].map((line) => {
    const note = manpowerRegenWeightNote(line.weight);
    return {
      label: townTierLabel(line.tier, line.count),
      amount: line.amount,
      ...(note ? { note } : {})
    };
  });
  const capLinesWithGarrisonHall =
    garrisonHallCount > 0
      ? [...capLines, { label: "Ancillary Factory", amount: garrisonHallCount * GARRISON_HALL_MANPOWER_CAP_BONUS }]
      : capLines;
  if (logisticsGuildCount > 0) {
    regenLines.push({ label: "Logistics Guild", amount: logisticsGuildCount * LOGISTICS_GUILD_STANDALONE_REGEN_PER_MINUTE });
  }
  if (railDepotNetworkLogisticsGuildCount > 0) {
    regenLines.push({
      label: "Rail Depot Network",
      amount: railDepotNetworkLogisticsGuildCount * RAIL_DEPOT_NETWORK_MANPOWER_REGEN_PER_LOGISTICS_GUILD
    });
  }
  if (populationBureauManpowerBuildingCount > 0) {
    regenLines.push({
      label: "Population Bureau",
      amount: populationBureauManpowerBuildingCount * POPULATION_BUREAU_REGEN_PER_MANPOWER_BUILDING
    });
  }
  if (galacticWonderManpowerRegenBonusPerMinute > 0) {
    regenLines.push({ label: "Galactic Wonder", amount: galacticWonderManpowerRegenBonusPerMinute });
  }
  const capLinesWithRailDepotNetwork =
    assemblyWorksNetworkGarrisonHallCount > 0
      ? [
          ...capLinesWithGarrisonHall,
          { label: "Assembly Works Network", amount: assemblyWorksNetworkGarrisonHallCount * RAIL_DEPOT_NETWORK_MANPOWER_CAP_PER_GARRISON_HALL }
        ]
      : capLinesWithGarrisonHall;
  // Starting Capital is always present (§4.3) — unlike the old floor-based
  // "Base minimum" fallback, it's listed unconditionally alongside any town
  // lines rather than only appearing when there are no towns.
  return {
    cap: [{ label: "Starting Capital", amount: STARTING_CAPITAL_MANPOWER_CAP }, ...capLinesWithRailDepotNetwork],
    regen: [{ label: "Starting Capital", amount: STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE }, ...regenLines]
  };
};

export const effectiveManpowerAt = (
  player: RuntimePlayer,
  cap: number,
  regenPerMinute: number,
  nowMs: number
): number => {
  if (!Number.isFinite(player.manpower)) return cap;
  if (!Number.isFinite(player.manpowerUpdatedAt)) return Math.min(cap, Math.max(0, player.manpower));
  const updatedAt = player.manpowerUpdatedAt ?? nowMs;
  const elapsedMinutes = Math.max(0, (nowMs - updatedAt) / 60_000);
  const nextManpower = elapsedMinutes > 0 ? player.manpower + elapsedMinutes * regenPerMinute : player.manpower;
  return Math.max(0, Math.min(cap, nextManpower));
};
