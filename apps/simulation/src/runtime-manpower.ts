import type { ManpowerBreakdown } from "@border-empires/sim-protocol";
import {
  MANPOWER_BASE_CAP,
  MANPOWER_BASE_REGEN_PER_MINUTE,
  RAIL_DEPOT_MANPOWER_REGEN_PER_MIN,
  TOWN_MANPOWER_BY_TIER,
  manpowerRegenWeightForSettlementIndex
} from "@border-empires/game-domain";

import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { RuntimePlayer } from "./runtime-types.js";

type TownTier = keyof typeof TOWN_MANPOWER_BY_TIER;

export const playerManpowerCapFromSummary = (summary: PlayerRuntimeSummary): number => {
  let cap = 0;
  for (const tier of summary.ownedTownTierByTile.values()) {
    cap += TOWN_MANPOWER_BY_TIER[tier]?.cap ?? 0;
  }
  return Math.max(MANPOWER_BASE_CAP, cap);
};

export const playerManpowerRegenPerMinuteFromSummary = (
  summary: PlayerRuntimeSummary,
  railDepotCount = 0
): number => {
  let regen = 0;
  let index = 0;
  for (const tier of summary.ownedTownTierByTile.values()) {
    const base = TOWN_MANPOWER_BY_TIER[tier]?.regenPerMinute ?? 0;
    regen += base * manpowerRegenWeightForSettlementIndex(index);
    index += 1;
  }
  const depotBonus = railDepotCount * RAIL_DEPOT_MANPOWER_REGEN_PER_MIN;
  return Math.max(MANPOWER_BASE_REGEN_PER_MINUTE, regen + depotBonus);
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
  railDepotCount = 0
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
  if (railDepotCount > 0) {
    regenLines.push({ label: "Rail Depot", amount: railDepotCount * RAIL_DEPOT_MANPOWER_REGEN_PER_MIN });
  }
  const townCap = capLines.reduce((total, line) => total + line.amount, 0);
  const townRegen = regenLines.reduce((total, line) => total + line.amount, 0);
  return {
    cap: townCap >= MANPOWER_BASE_CAP && capLines.length > 0 ? capLines : [{ label: "Base minimum", amount: MANPOWER_BASE_CAP }],
    regen:
      townRegen >= MANPOWER_BASE_REGEN_PER_MINUTE && regenLines.length > 0
        ? regenLines
        : [{ label: "Base minimum", amount: MANPOWER_BASE_REGEN_PER_MINUTE }]
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
