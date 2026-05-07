import type { DomainStrategicResourceKey, DomainTileState } from "@border-empires/game-domain";

import type { FrontierAnalysis } from "./frontier-command-planner.js";
import { evaluateSettlementCandidate } from "./ai-settlement-priority.js";

type StrategicResourceKey = DomainStrategicResourceKey;

type StrategicTile = {
  x: number;
  y: number;
  terrain: DomainTileState["terrain"];
  ownerId?: string | undefined;
  ownershipState?: string | undefined;
  dockId?: string | undefined;
  town?: unknown;
};

export type AutomationVictoryPath = "TOWN_CONTROL" | "SETTLED_TERRITORY" | "ECONOMIC_HEGEMONY";
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
  townSupportSettlementAvailable: boolean;
  townSupportExpandAvailable: boolean;
  islandExpandAvailable: boolean;
  islandSettlementAvailable: boolean;
  openingScoutAvailable: boolean;
  scoutExpandWorthwhile: boolean;
  pressureAttackScore: number;
  pressureThreatensCore: boolean;
  attackReady: boolean;
  victoryPathContender: boolean;
  hasActiveTown: boolean;
  hasActiveDock: boolean;
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
  townCount: number;
  incomePerMinute: number;
  strategicResources?: Partial<Record<StrategicResourceKey, number>>;
  ownedTiles: readonly TTile[];
  tilesByKey: ReadonlyMap<string, TTile>;
  frontierAnalysis: FrontierAnalysis;
  settlementCandidate?: TTile | undefined;
  fallbackSettlementCandidate?: TTile | undefined;
  needsFood: boolean;
  needsEconomy: boolean;
  canAttack: boolean;
  canExpand: boolean;
  economicBuildAvailable: boolean;
  fortBuildAvailable: boolean;
  siegeOutpostBuildAvailable: boolean;
  previousVictoryPath?: AutomationVictoryPath | undefined;
  pathPopulationCounts?: Partial<Record<AutomationVictoryPath, number>> | undefined;
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

const settlementSupportsTown = <TTile extends StrategicTile>(
  playerId: string,
  candidate: TTile | undefined,
  tilesByKey: ReadonlyMap<string, TTile>
): boolean => {
  if (!candidate) return false;
  const evaluation = evaluateSettlementCandidate(
    playerId,
    candidate as unknown as DomainTileState,
    tilesByKey as ReadonlyMap<string, DomainTileState>
  );
  return evaluation.townSupportNeed > 0;
};

const scoreVictoryPaths = <TTile extends StrategicTile>(
  input: StrategicSnapshotInput<TTile>
): Record<AutomationVictoryPath, VictoryPathScore> => {
  const islandGrowthAvailable =
    targetRequiresDockCrossing(input.frontierAnalysis.expand) ||
    targetRequiresDockCrossing(input.frontierAnalysis.economicExpand) ||
    Boolean(input.settlementCandidate?.dockId) ||
    Boolean(input.fallbackSettlementCandidate?.dockId);
  const townsTarget = Math.max(2, Math.ceil(Math.max(1, input.settledTileCount) / 5));
  const settledTilesTarget = Math.max(4, input.townCount * 3);
  const economyTarget = Math.max(8, input.settledTileCount * 0.55);
  const townProgress = input.townCount / townsTarget;
  const settledProgress = input.settledTileCount / settledTilesTarget;
  const economyProgress = input.incomePerMinute / economyTarget;

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
  const settledTerritoryScore =
    input.settledTileCount * 18 +
    input.frontierAnalysis.frontierNeutralTargetCount * 12 +
    (islandGrowthAvailable ? 120 : 0) +
    (input.settlementCandidate ? 36 : 0) +
    (input.fallbackSettlementCandidate ? 16 : 0) +
    (!input.needsFood && !input.needsEconomy ? 18 : -18);
  const populationCounts = {
    TOWN_CONTROL: input.pathPopulationCounts?.TOWN_CONTROL ?? 0,
    ECONOMIC_HEGEMONY: input.pathPopulationCounts?.ECONOMIC_HEGEMONY ?? 0,
    SETTLED_TERRITORY: input.pathPopulationCounts?.SETTLED_TERRITORY ?? 0
  };
  const minimumPopulation = Math.min(
    populationCounts.TOWN_CONTROL,
    populationCounts.ECONOMIC_HEGEMONY,
    populationCounts.SETTLED_TERRITORY
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
  const settledContender = settledProgress >= VICTORY_PATH_CONTENDER_PROGRESS_RATIO;
  const settledSoftContender = settledProgress >= VICTORY_PATH_SOFT_CONTENDER_PROGRESS_RATIO;

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
    SETTLED_TERRITORY: {
      score: settledTerritoryScore - crowdingPenalty("SETTLED_TERRITORY", settledContender, settledSoftContender),
      contender: settledContender,
      softContender: settledSoftContender
    }
  };
};

const chooseVictoryPath = <TTile extends StrategicTile>(input: StrategicSnapshotInput<TTile>): AutomationVictoryPath => {
  const scores = scoreVictoryPaths(input);
  const best = (Object.entries(scores) as Array<[AutomationVictoryPath, VictoryPathScore]>).sort(
    (left, right) => right[1].score - left[1].score
  )[0];
  const previous = input.previousVictoryPath;
  if (!previous) return best?.[0] ?? "SETTLED_TERRITORY";

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
  const hasActiveTown = input.townCount > 0 || input.ownedTiles.some((tile) => tile.ownershipState === "SETTLED" && Boolean(tile.town));
  const hasActiveDock = input.ownedTiles.some((tile) => tile.ownershipState === "SETTLED" && Boolean(tile.dockId));
  const growthFoundationEstablished = hasActiveTown || hasActiveDock || input.incomePerMinute >= 10;
  const canPivotToGrowth =
    input.canExpand &&
    (
      targetRequiresDockCrossing(input.frontierAnalysis.expand) ||
      targetRequiresDockCrossing(input.frontierAnalysis.economicExpand) ||
      input.frontierAnalysis.frontierOpportunityEconomic > 0 ||
      input.frontierAnalysis.frontierOpportunityScaffold > 0 ||
      Boolean(input.settlementCandidate) ||
      Boolean(input.fallbackSettlementCandidate)
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

  const townSupportSettlementAvailable =
    settlementSupportsTown(input.playerId, input.settlementCandidate, input.tilesByKey) ||
    settlementSupportsTown(input.playerId, input.fallbackSettlementCandidate, input.tilesByKey);
  const townSupportExpandAvailable =
    input.canExpand &&
    input.frontierAnalysis.frontierOpportunityTownSupport > 0 &&
    Boolean(input.frontierAnalysis.townSupportExpand);
  const islandExpandAvailable =
    primaryVictoryPath === "SETTLED_TERRITORY" &&
    input.canExpand &&
    (
      targetRequiresDockCrossing(input.frontierAnalysis.economicExpand) ||
      targetRequiresDockCrossing(input.frontierAnalysis.expand) ||
      targetRequiresDockCrossing(input.frontierAnalysis.scaffoldExpand)
    );
  const islandSettlementAvailable =
    primaryVictoryPath === "SETTLED_TERRITORY" &&
    Boolean(input.settlementCandidate?.dockId || input.fallbackSettlementCandidate?.dockId);
  const openingScoutAvailable =
    input.canExpand &&
    input.townCount === 0 &&
    input.settledTileCount <= 1 &&
    !input.settlementCandidate &&
    !input.fallbackSettlementCandidate &&
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
  const attackReady =
    input.canAttack &&
    (pressureThreatensCore || (!input.needsFood && !input.needsEconomy) || pressureAttackScore >= 180);

  let strategicFocus: AutomationStrategicFocus = "BALANCED";
  if (
    primaryVictoryPath === "SETTLED_TERRITORY" &&
    (islandExpandAvailable || islandSettlementAvailable) &&
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
        : input.settledTileCount >= Math.max(4, input.townCount * 3);

  return {
    primaryVictoryPath,
    strategicFocus,
    frontPosture,
    underThreat,
    threatCritical,
    growthFoundationEstablished,
    townSupportSettlementAvailable,
    townSupportExpandAvailable,
    islandExpandAvailable,
    islandSettlementAvailable,
    openingScoutAvailable,
    scoutExpandWorthwhile,
    pressureAttackScore,
    pressureThreatensCore,
    attackReady,
    victoryPathContender,
    hasActiveTown,
    hasActiveDock
  };
};
