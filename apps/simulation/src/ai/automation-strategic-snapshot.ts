import type { DomainStrategicResourceKey, DomainTileState } from "@border-empires/game-domain";
import { ATTACK_MANPOWER_MIN, MUSTER_MAX_TILES, MUSTER_SYSTEM_ENABLED } from "@border-empires/shared";

import type { FrontierAnalysis } from "./frontier-command-planner.js";

// Scales required manpower with threat level — matches legacy tempo-policy:
//   threatCritical → ATTACK_MIN  (gamble allowed when desperate)
//   underThreat    → ATTACK_MIN +5
//   weak economy / one-town early game → ATTACK_MIN +15 (need real surplus)
//   default        → ATTACK_MIN +10
// Prevents AIs from launching marginal attacks that lose them their regen window.
const requiredAttackManpower = (input: {
  underThreat: boolean;
  threatCritical: boolean;
  needsEconomy: boolean;
  townCount: number;
}): number => {
  if (input.threatCritical) return ATTACK_MANPOWER_MIN;
  if (input.underThreat) return ATTACK_MANPOWER_MIN + 5;
  if (input.needsEconomy || input.townCount <= 1) return ATTACK_MANPOWER_MIN + 15;
  return ATTACK_MANPOWER_MIN + 10;
};

type StrategicResourceKey = DomainStrategicResourceKey;

type StrategicTile = {
  x: number;
  y: number;
  terrain: DomainTileState["terrain"];
  ownerId?: string | undefined;
  ownershipState?: string | undefined;
  dockId?: string | undefined;
  resource?: DomainTileState["resource"] | undefined;
  town?: unknown;
};

export type AutomationVictoryPath =
  | "TOWN_CONTROL"
  | "ECONOMIC_HEGEMONY"
  | "RESOURCE_MONOPOLY"
  | "MARITIME_SUPREMACY"
  | "DIPLOMATIC_DOMINANCE";
export type AutomationStrategicFocus =
  | "BALANCED"
  | "ECONOMIC_RECOVERY"
  | "ISLAND_FOOTPRINT"
  | "MILITARY_PRESSURE"
  | "BORDER_CONTAINMENT";
export type AutomationFrontPosture = "BREAK" | "CONTAIN" | "TRUCE";

export type AutomationStrategicSnapshot = {
  primaryVictoryPath: AutomationVictoryPath;
  strategicFocus: AutomationStrategicFocus;
  frontPosture: AutomationFrontPosture;
  underThreat: boolean;
  threatCritical: boolean;
  growthFoundationEstablished: boolean;
  townSupportExpandAvailable: boolean;
  islandExpandAvailable: boolean;
  openingScoutAvailable: boolean;
  scoutExpandWorthwhile: boolean;
  pressureAttackScore: number;
  pressureThreatensCore: boolean;
  attackReady: boolean;
  /** Under the muster system, AI stages manpower via SET_MUSTER rather than direct ATTACK. */
  musterReady: boolean;
  manpowerSufficient: boolean;
  victoryPathContender: boolean;
  hasActiveTown: boolean;
  hasActiveDock: boolean;
  /** Passthrough — tile keys of this player's currently active muster flags. */
  musterTileKeys?: ReadonlySet<string>;
};

type VictoryPathScore = {
  score: number;
  contender: boolean;
  softContender: boolean;
};

type StrategicSnapshotInput<TTile extends StrategicTile> = {
  playerId: string;
  points: number;
  manpower: number;
  settledTileCount: number;
  // Settled + frontier owned tiles. Required: the caller computes this in
  // the same owned-tiles sweep that produces settledTileCount/townCount, so
  // we never need to re-walk ownedTiles here.
  controlledTileCount: number;
  townCount: number;
  incomePerMinute: number;
  strategicResources?: Partial<Record<StrategicResourceKey, number>>;
  ownedTiles: readonly TTile[];
  tilesByKey: ReadonlyMap<string, TTile>;
  frontierAnalysis: FrontierAnalysis;
  needsFood: boolean;
  needsEconomy: boolean;
  canAttack: boolean;
  canExpand: boolean;
  economicBuildAvailable: boolean;
  fortBuildAvailable: boolean;
  siegeOutpostBuildAvailable: boolean;
  previousVictoryPath?: AutomationVictoryPath | undefined;
  pathPopulationCounts?: Partial<Record<AutomationVictoryPath, number>> | undefined;
  activeMusterCount?: number;
  musterTileKeys?: ReadonlySet<string>;
};

const VICTORY_PATH_REPIVOT_MARGIN = 28;
const VICTORY_PATH_EMERGENCY_REPIVOT_MARGIN = 56;
const VICTORY_PATH_POPULATION_PENALTY = 18;
const VICTORY_PATH_CONTENDER_PROGRESS_RATIO = 0.72;
const VICTORY_PATH_SOFT_CONTENDER_PROGRESS_RATIO = 0.58;
const VICTORY_PATH_CONTENDER_ECONOMY_RATIO = 1;
const VICTORY_PATH_SOFT_CONTENDER_ECONOMY_RATIO = 0.8;

const targetRequiresDockCrossing = (
  selection:
    | FrontierAnalysis["attack"]
    | FrontierAnalysis["expand"]
    | FrontierAnalysis["economicExpand"]
    | FrontierAnalysis["scaffoldExpand"]
    | FrontierAnalysis["scoutExpand"]
): boolean =>
  Boolean(
    selection &&
      (
        (selection.from.dockId && selection.target.dockId) ||
        Math.abs(selection.from.x - selection.target.x) > 1 ||
        Math.abs(selection.from.y - selection.target.y) > 1
      )
  );

const ownedResourceTileCounts = <TTile extends StrategicTile>(
  playerId: string,
  ownedTiles: readonly TTile[]
): Map<NonNullable<DomainTileState["resource"]>, number> => {
  const counts = new Map<NonNullable<DomainTileState["resource"]>, number>();
  for (const tile of ownedTiles) {
    if (tile.ownerId !== playerId || tile.ownershipState !== "SETTLED" || !tile.resource) continue;
    counts.set(tile.resource, (counts.get(tile.resource) ?? 0) + 1);
  }
  return counts;
};

const ownedDockTileCount = <TTile extends StrategicTile>(
  playerId: string,
  ownedTiles: readonly TTile[]
): number => {
  let count = 0;
  for (const tile of ownedTiles) {
    if (tile.ownerId === playerId && tile.ownershipState === "SETTLED" && tile.dockId) count += 1;
  }
  return count;
};

const scoreVictoryPaths = <TTile extends StrategicTile>(
  input: StrategicSnapshotInput<TTile>
): Record<AutomationVictoryPath, VictoryPathScore> => {
  const islandGrowthAvailable =
    targetRequiresDockCrossing(input.frontierAnalysis.expand) ||
    targetRequiresDockCrossing(input.frontierAnalysis.economicExpand);
  const townsTarget = Math.max(2, Math.ceil(Math.max(1, input.settledTileCount) / 5));
  const controlledTileCount = input.controlledTileCount;
  const diplomaticControlTarget = Math.max(4, input.townCount * 3);
  const economyTarget = Math.max(8, input.settledTileCount * 0.55);
  const townProgress = input.townCount / townsTarget;
  const diplomaticControlProgress = controlledTileCount / diplomaticControlTarget;
  const economyProgress = input.incomePerMinute / economyTarget;

  const resourceCounts = ownedResourceTileCounts(input.playerId, input.ownedTiles);
  // Find the resource type the AI has accumulated the most of — this is the
  // candidate resource for a RESOURCE_MONOPOLY win. Concentration matters more
  // than absolute count for path-selection (the win threshold is 80% of one
  // resource type globally, so AI needs to focus on a single type).
  let topResourceCount = 0;
  for (const value of resourceCounts.values()) {
    if (value > topResourceCount) topResourceCount = value;
  }
  const dockCount = ownedDockTileCount(input.playerId, input.ownedTiles);

  // RESOURCE_MONOPOLY contender progress is approximated by raw concentration:
  // 4 tiles of one resource ≈ contender, 6+ ≈ strong contender. Without
  // world-wide totals in scope we can't compute the real 80%-monopoly ratio.
  const resourceMonopolyTarget = 6;
  const resourceMonopolyProgress = topResourceCount / resourceMonopolyTarget;

  // MARITIME_SUPREMACY progress is approximated by settled dock count. The
  // authoritative world dock target only exists in the status scorer.
  const maritimeSupremacyTarget = 3;
  const maritimeSupremacyProgress = dockCount / maritimeSupremacyTarget;

  const townControlScore =
    input.townCount * 140 +
    input.frontierAnalysis.frontierEnemyTargetCount * 22 +
    (input.frontierAnalysis.attack ? Math.min(140, Math.max(0, input.frontierAnalysis.attack.score - 120) * 0.35) : 0) +
    (!input.needsFood && !input.needsEconomy ? 24 : -30);
  const economicHegemonyScore =
    input.incomePerMinute * 18 +
    (input.economicBuildAvailable ? 110 : 0) +
    input.frontierAnalysis.frontierOpportunityEconomic * 44 +
    (!input.needsFood ? 18 : -24) +
    (input.needsEconomy ? -12 : 0);
  const diplomaticDominanceScore =
    controlledTileCount * 18 +
    input.frontierAnalysis.frontierNeutralTargetCount * 18 +
    input.frontierAnalysis.frontierOpportunityScout * 10 +
    input.frontierAnalysis.frontierOpportunityScaffold * 8 +
    (islandGrowthAvailable ? 120 : 0) +
    (!input.needsFood && !input.needsEconomy ? 18 : -18);
  const resourceMonopolyScore =
    topResourceCount * 60 +
    input.frontierAnalysis.frontierOpportunityEconomic * 22 +
    (input.economicBuildAvailable ? 40 : 0) +
    (!input.needsFood && !input.needsEconomy ? 16 : -20);
  // MARITIME_SUPREMACY is the multi-dock naval path. A single dock is still
  // broad diplomatic expansion; require at least two docks before naval growth
  // dominates path choice.
  const maritimeSupremacyScore =
    dockCount * 60 +
    (dockCount >= 2 && islandGrowthAvailable ? 160 : 0) +
    (!input.needsFood ? 12 : -16);
  const populationCounts = {
    TOWN_CONTROL: input.pathPopulationCounts?.TOWN_CONTROL ?? 0,
    ECONOMIC_HEGEMONY: input.pathPopulationCounts?.ECONOMIC_HEGEMONY ?? 0,
    RESOURCE_MONOPOLY: input.pathPopulationCounts?.RESOURCE_MONOPOLY ?? 0,
    MARITIME_SUPREMACY: input.pathPopulationCounts?.MARITIME_SUPREMACY ?? 0,
    DIPLOMATIC_DOMINANCE: input.pathPopulationCounts?.DIPLOMATIC_DOMINANCE ?? 0
  };
  const minimumPopulation = Math.min(
    populationCounts.TOWN_CONTROL,
    populationCounts.ECONOMIC_HEGEMONY,
    populationCounts.RESOURCE_MONOPOLY,
    populationCounts.MARITIME_SUPREMACY,
    populationCounts.DIPLOMATIC_DOMINANCE
  );
  const crowdingPenalty = (path: AutomationVictoryPath, contender: boolean, softContender: boolean): number => {
    const overMinimum = Math.max(0, populationCounts[path] - minimumPopulation);
    if (contender) return 0;
    if (softContender) return Math.max(0, overMinimum * VICTORY_PATH_POPULATION_PENALTY - Math.round(VICTORY_PATH_POPULATION_PENALTY * 0.7));
    return overMinimum * VICTORY_PATH_POPULATION_PENALTY;
  };
  const townControlContender = townProgress >= VICTORY_PATH_CONTENDER_PROGRESS_RATIO;
  const townControlSoftContender = townProgress >= VICTORY_PATH_SOFT_CONTENDER_PROGRESS_RATIO;
  const economicContender = economyProgress >= VICTORY_PATH_CONTENDER_ECONOMY_RATIO;
  const economicSoftContender = economyProgress >= VICTORY_PATH_SOFT_CONTENDER_ECONOMY_RATIO;
  const diplomaticDominanceContender = diplomaticControlProgress >= VICTORY_PATH_CONTENDER_PROGRESS_RATIO;
  const diplomaticDominanceSoftContender = diplomaticControlProgress >= VICTORY_PATH_SOFT_CONTENDER_PROGRESS_RATIO;
  const resourceMonopolyContender = resourceMonopolyProgress >= VICTORY_PATH_CONTENDER_PROGRESS_RATIO;
  const resourceMonopolySoftContender = resourceMonopolyProgress >= VICTORY_PATH_SOFT_CONTENDER_PROGRESS_RATIO;
  const maritimeSupremacyContender = maritimeSupremacyProgress >= VICTORY_PATH_CONTENDER_PROGRESS_RATIO;
  const maritimeSupremacySoftContender = maritimeSupremacyProgress >= VICTORY_PATH_SOFT_CONTENDER_PROGRESS_RATIO;

  return {
    TOWN_CONTROL: {
      score: townControlScore - crowdingPenalty("TOWN_CONTROL", townControlContender, townControlSoftContender),
      contender: townControlContender,
      softContender: townControlSoftContender
    },
    ECONOMIC_HEGEMONY: {
      score: economicHegemonyScore - crowdingPenalty("ECONOMIC_HEGEMONY", economicContender, economicSoftContender),
      contender: economicContender,
      softContender: economicSoftContender
    },
    RESOURCE_MONOPOLY: {
      score: resourceMonopolyScore - crowdingPenalty("RESOURCE_MONOPOLY", resourceMonopolyContender, resourceMonopolySoftContender),
      contender: resourceMonopolyContender,
      softContender: resourceMonopolySoftContender
    },
    MARITIME_SUPREMACY: {
      score: maritimeSupremacyScore - crowdingPenalty("MARITIME_SUPREMACY", maritimeSupremacyContender, maritimeSupremacySoftContender),
      contender: maritimeSupremacyContender,
      softContender: maritimeSupremacySoftContender
    },
    DIPLOMATIC_DOMINANCE: {
      score: diplomaticDominanceScore - crowdingPenalty("DIPLOMATIC_DOMINANCE", diplomaticDominanceContender, diplomaticDominanceSoftContender),
      contender: diplomaticDominanceContender,
      softContender: diplomaticDominanceSoftContender
    }
  };
};

const chooseVictoryPath = <TTile extends StrategicTile>(input: StrategicSnapshotInput<TTile>): AutomationVictoryPath => {
  const scores = scoreVictoryPaths(input);
  const best = (Object.entries(scores) as Array<[AutomationVictoryPath, VictoryPathScore]>).sort(
    (left, right) => right[1].score - left[1].score
  )[0];
  const previous = input.previousVictoryPath;
  if (!previous) return best?.[0] ?? "DIPLOMATIC_DOMINANCE";

  const previousScore = scores[previous];
  if (previousScore.contender) return previous;
  if (!best) return previous;
  if (best[0] === previous) return previous;
  if (previousScore.softContender && best[1].score < previousScore.score + VICTORY_PATH_EMERGENCY_REPIVOT_MARGIN) {
    return previous;
  }
  if (best[1].score < previousScore.score + VICTORY_PATH_REPIVOT_MARGIN) return previous;
  return best[0];
};

export const buildAutomationStrategicSnapshot = <TTile extends StrategicTile>(
  input: StrategicSnapshotInput<TTile>
): AutomationStrategicSnapshot => {
  const controlledTileCount = input.controlledTileCount;
  const hasActiveTown = input.townCount > 0 || input.ownedTiles.some((tile) => tile.ownershipState === "SETTLED" && Boolean(tile.town));
  const hasActiveDock = input.ownedTiles.some((tile) => tile.ownershipState === "SETTLED" && Boolean(tile.dockId));
  const growthFoundationEstablished = hasActiveTown || hasActiveDock || input.incomePerMinute >= 10;
  const canPivotToGrowth =
    input.canExpand &&
    (
      targetRequiresDockCrossing(input.frontierAnalysis.expand) ||
      targetRequiresDockCrossing(input.frontierAnalysis.economicExpand) ||
      input.frontierAnalysis.frontierOpportunityEconomic > 0 ||
      input.frontierAnalysis.frontierOpportunityTownSupport > 0 ||
      input.frontierAnalysis.frontierOpportunityScaffold > 0
    );
  const pressureAttackScore =
    (input.frontierAnalysis.attack?.score ?? 0) +
    input.frontierAnalysis.frontierEnemyTargetCount * 85 +
    (input.frontierAnalysis.frontierEnemyTargetCount > 0 && hasActiveTown ? 40 : 0);
  const strainedGrowth = input.needsFood || input.needsEconomy;
  const pressureThreatensCore =
    input.frontierAnalysis.frontierEnemyTargetCount > 0 &&
    (
      strainedGrowth ||
      pressureAttackScore >= (strainedGrowth || !canPivotToGrowth ? 220 : 420) ||
      input.frontierAnalysis.frontierEnemyTargetCount >= Math.max(2, input.frontierAnalysis.frontierNeutralTargetCount + 1) ||
      (!canPivotToGrowth && input.frontierAnalysis.frontierNeutralTargetCount === 0)
    );
  const underThreat = input.frontierAnalysis.frontierEnemyTargetCount > 0 && (pressureThreatensCore || input.needsFood || input.needsEconomy);
  const threatCritical =
    pressureThreatensCore &&
    (
      pressureAttackScore >= 350 ||
      input.frontierAnalysis.frontierEnemyTargetCount >= Math.max(2, input.frontierAnalysis.frontierNeutralTargetCount + 1)
    );
  const primaryVictoryPath = chooseVictoryPath(input);
  const opportunisticBreakPressure =
    pressureAttackScore >= (primaryVictoryPath === "TOWN_CONTROL" ? 120 : 180) &&
    canPivotToGrowth &&
    !input.needsFood &&
    input.incomePerMinute >= 10;

  let frontPosture: AutomationFrontPosture = "BREAK";
  if (!pressureThreatensCore && pressureAttackScore > 0 && canPivotToGrowth) {
    frontPosture =
      underThreat && (input.needsFood || input.needsEconomy) && primaryVictoryPath !== "TOWN_CONTROL" && !opportunisticBreakPressure
        ? "TRUCE"
        : "CONTAIN";
  }
  if (
    pressureThreatensCore ||
    (primaryVictoryPath === "TOWN_CONTROL" && pressureAttackScore >= 160) ||
    opportunisticBreakPressure
  ) {
    frontPosture = "BREAK";
  }

  const townSupportExpandAvailable =
    input.canExpand &&
    !input.needsFood &&
    input.frontierAnalysis.frontierOpportunityTownSupport > 0 &&
    Boolean(input.frontierAnalysis.townSupportExpand);
  // Diplomatic and maritime wins both reward reach. Diplomatic wants broad
  // territorial pressure, while maritime specifically favors dock-crossing.
  const islandFocusedPath =
    primaryVictoryPath === "DIPLOMATIC_DOMINANCE" || primaryVictoryPath === "MARITIME_SUPREMACY";
  const islandExpandAvailable =
    islandFocusedPath &&
    input.canExpand &&
    (
      targetRequiresDockCrossing(input.frontierAnalysis.economicExpand) ||
      targetRequiresDockCrossing(input.frontierAnalysis.expand) ||
      targetRequiresDockCrossing(input.frontierAnalysis.scaffoldExpand)
    );
  const openingScoutAvailable =
    input.canExpand &&
    input.townCount === 0 &&
    input.settledTileCount <= 1 &&
    Boolean(input.frontierAnalysis.scoutExpand);
  const scoutExpandWorthwhile =
    input.canExpand &&
    Boolean(input.frontierAnalysis.scoutExpand) &&
    !pressureThreatensCore &&
    (
      openingScoutAvailable ||
      (!growthFoundationEstablished && input.frontierAnalysis.frontierOpportunityScout > 0) ||
      input.frontierAnalysis.frontierOpportunityWaste > 0
    );
  const manpowerSufficient =
    input.manpower >= requiredAttackManpower({
      underThreat,
      threatCritical,
      needsEconomy: input.needsEconomy,
      townCount: input.townCount
    });
  const attackReady = input.canAttack && manpowerSufficient;
  const resourceContenderThreshold = Math.ceil(6 * VICTORY_PATH_CONTENDER_PROGRESS_RATIO);
  const resourcePathContender = [...ownedResourceTileCounts(input.playerId, input.ownedTiles).values()].some(
    (count) => count >= resourceContenderThreshold
  );

  let strategicFocus: AutomationStrategicFocus = "BALANCED";
  if (
    primaryVictoryPath === "DIPLOMATIC_DOMINANCE" &&
    islandExpandAvailable &&
    growthFoundationEstablished &&
    !pressureThreatensCore
  ) {
    strategicFocus = "ISLAND_FOOTPRINT";
  } else if (
    frontPosture === "BREAK" &&
    pressureAttackScore >= (primaryVictoryPath === "TOWN_CONTROL" ? 100 : 180) &&
    (primaryVictoryPath === "TOWN_CONTROL" || primaryVictoryPath === "ECONOMIC_HEGEMONY") &&
    !input.needsFood
  ) {
    strategicFocus = "MILITARY_PRESSURE";
  } else if (input.needsFood || input.needsEconomy) {
    strategicFocus = "ECONOMIC_RECOVERY";
  } else if (frontPosture === "CONTAIN" || frontPosture === "TRUCE") {
    strategicFocus = "BORDER_CONTAINMENT";
  } else if (primaryVictoryPath === "TOWN_CONTROL" && pressureAttackScore > 0) {
    strategicFocus = "MILITARY_PRESSURE";
  }

  const victoryPathContender =
    primaryVictoryPath === "TOWN_CONTROL"
      ? input.townCount >= Math.max(2, Math.ceil(input.settledTileCount / 5))
      : primaryVictoryPath === "ECONOMIC_HEGEMONY"
        ? input.incomePerMinute >= Math.max(8, input.settledTileCount * 0.55)
        : primaryVictoryPath === "RESOURCE_MONOPOLY"
          ? resourcePathContender
          : primaryVictoryPath === "MARITIME_SUPREMACY"
            ? ownedDockTileCount(input.playerId, input.ownedTiles) >= 3
            : controlledTileCount >= Math.max(4, input.townCount * 3);

  return {
    primaryVictoryPath,
    strategicFocus,
    frontPosture,
    underThreat,
    threatCritical,
    growthFoundationEstablished,
    townSupportExpandAvailable,
    islandExpandAvailable,
    openingScoutAvailable,
    scoutExpandWorthwhile,
    pressureAttackScore,
    pressureThreatensCore,
    attackReady,
    musterReady: MUSTER_SYSTEM_ENABLED && attackReady && (input.activeMusterCount ?? 0) < MUSTER_MAX_TILES,
    manpowerSufficient,
    victoryPathContender,
    hasActiveTown,
    hasActiveDock,
    ...(input.musterTileKeys ? { musterTileKeys: input.musterTileKeys } : {})
  };
};
