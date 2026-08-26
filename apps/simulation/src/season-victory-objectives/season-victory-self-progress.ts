import { type ResourceType, type SeasonVictoryPathId } from "@border-empires/shared";
import {
  SEASON_VICTORY_ECONOMY_MIN_INCOME,
  SEASON_VICTORY_RESOURCE_MONOPOLY_SHARE,
  VICTORY_RESOURCE_TYPES
} from "@border-empires/game-domain";

import type { VictoryMetrics } from "./season-victory-objectives.js";
import { allianceBlocForPlayer, clamp01 } from "./season-victory-objectives.js";

// Split out of season-victory-objectives.ts to stay under the repo's 500-line
// file cap — these are the two per-player self-progress helpers
// (computeSeasonVictory's per-player loop), kept beside the base objectives
// they mirror the math of.

export const objectiveSelfProgressLabel = (
  objectiveId: SeasonVictoryPathId,
  playerId: string,
  metricsByPlayerId: Map<string, VictoryMetrics>,
  townTarget: number,
  maritimeDockTarget: number,
  diplomaticControlTarget: number,
  totalResourceCounts: Record<ResourceType, number>,
  ownedResourceCountsByPlayerId: Map<string, Record<ResourceType, number>>,
  playerAlliesById: ReadonlyMap<string, ReadonlySet<string>>,
  competitivePlayerIds: ReadonlySet<string>
): string | undefined => {
  const metric = metricsByPlayerId.get(playerId);
  if (!metric) return undefined;
  if (objectiveId === "TOWN_CONTROL") return `${metric.towns}/${townTarget} towns`;
  if (objectiveId === "ECONOMIC_HEGEMONY") return `${(metric.incomePerMinute * 1440).toFixed(1)} gold/day`;
  if (objectiveId === "RESOURCE_MONOPOLY") {
    const owned = ownedResourceCountsByPlayerId.get(playerId) ?? { FARM: 0, TITANIUM: 0, GEMS: 0, FISH: 0, UMBRITE: 0 };
    let bestResource: ResourceType | undefined;
    let bestOwned = 0;
    let bestTotal = 0;
    for (const resource of VICTORY_RESOURCE_TYPES) {
      const total = totalResourceCounts[resource] ?? 0;
      if (total <= 0) continue;
      const value = owned[resource] ?? 0;
      if (value > bestOwned) {
        bestOwned = value;
        bestTotal = total;
        bestResource = resource;
      }
    }
    return bestResource ? `${bestOwned}/${bestTotal} ${bestResource}` : "No resource control";
  }
  if (objectiveId === "MARITIME_SUPREMACY") return `${metric.dockTiles}/${maritimeDockTarget} docks`;
  const bloc = allianceBlocForPlayer(playerId, playerAlliesById, competitivePlayerIds);
  const blocControlledTiles = [...bloc].reduce((sum, memberId) => sum + (metricsByPlayerId.get(memberId)?.controlledTiles ?? 0), 0);
  return `${blocControlledTiles}/${diplomaticControlTarget} alliance-controlled land`;
};

// Numeric companion to objectiveSelfProgressLabel: a player's own 0..1
// progress fraction on `objectiveId`, using the same math each objective's
// leader progress already uses (see computeSeasonVictory), just evaluated
// for `playerId` instead of only the leader. Used by the galactic
// meta-layer's Outpost/Stipend tiering (docs/galactic-campaign-design.md §3)
// to find a non-winning player's best-path completion fraction.
export const objectiveSelfProgress = (
  objectiveId: SeasonVictoryPathId,
  playerId: string,
  metricsByPlayerId: Map<string, VictoryMetrics>,
  townTarget: number,
  maritimeDockTarget: number,
  diplomaticControlTarget: number,
  totalResourceCounts: Record<ResourceType, number>,
  ownedResourceCountsByPlayerId: Map<string, Record<ResourceType, number>>,
  playerAlliesById: ReadonlyMap<string, ReadonlySet<string>>,
  competitivePlayerIds: ReadonlySet<string>,
  economicHegemonyLeaderIncomePerMinute: number
): number => {
  const metric = metricsByPlayerId.get(playerId);
  if (!metric) return 0;
  if (objectiveId === "TOWN_CONTROL") return clamp01(metric.towns / townTarget);
  if (objectiveId === "ECONOMIC_HEGEMONY") {
    // No single-constraint fraction makes sense for a non-leader (winning
    // needs both a minimum income AND a lead over the runner-up) — using the
    // fraction of the current leader's income as the denominator gives a
    // reasonable "how close to the front" proxy without re-deriving the
    // leader/runner-up pairing per candidate player.
    const denominator = Math.max(economicHegemonyLeaderIncomePerMinute, SEASON_VICTORY_ECONOMY_MIN_INCOME);
    return denominator > 0 ? clamp01(metric.incomePerMinute / denominator) : 0;
  }
  if (objectiveId === "RESOURCE_MONOPOLY") {
    const owned = ownedResourceCountsByPlayerId.get(playerId) ?? { FARM: 0, TITANIUM: 0, GEMS: 0, FISH: 0, UMBRITE: 0 };
    let bestShare = 0;
    for (const resource of VICTORY_RESOURCE_TYPES) {
      const total = totalResourceCounts[resource] ?? 0;
      if (total <= 0) continue;
      const share = (owned[resource] ?? 0) / total;
      if (share > bestShare) bestShare = share;
    }
    return SEASON_VICTORY_RESOURCE_MONOPOLY_SHARE > 0 ? clamp01(bestShare / SEASON_VICTORY_RESOURCE_MONOPOLY_SHARE) : 0;
  }
  if (objectiveId === "MARITIME_SUPREMACY") return clamp01(metric.dockTiles / maritimeDockTarget);
  const bloc = allianceBlocForPlayer(playerId, playerAlliesById, competitivePlayerIds);
  const blocControlledTiles = [...bloc].reduce((sum, memberId) => sum + (metricsByPlayerId.get(memberId)?.controlledTiles ?? 0), 0);
  return clamp01(blocControlledTiles / diplomaticControlTarget);
};
