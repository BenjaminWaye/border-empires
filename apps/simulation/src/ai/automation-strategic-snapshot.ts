import { GOLD_RESCALE_DIVISOR, type DomainStrategicResourceKey } from "@border-empires/game-domain";
import { ATTACK_MANPOWER_MIN, MUSTER_MAX_TILES } from "@border-empires/shared";

import type { FrontierAnalysis } from "./frontier-command-planner.js";
import { hasLandConnectedThreat, nextWarPostureLatch, type WarPostureLatchEntry } from "./ai-war-posture-latch.js";
import {
  chooseVictoryPath,
  targetRequiresDockCrossing,
  type AutomationVictoryPath,
  type StrategicTile,
  type WorldVictoryProgress
} from "./victory-path-scoring.js";

export type { AutomationVictoryPath } from "./victory-path-scoring.js";

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

export type AutomationStrategicFocus =
  | "BALANCED"
  | "ECONOMIC_RECOVERY"
  | "ISLAND_FOOTPRINT"
  | "MILITARY_PRESSURE"
  | "BORDER_CONTAINMENT";
export type AutomationFrontPosture = "BREAK" | "CONTAIN" | "TRUCE" | "WAR";

export type AutomationStrategicSnapshot = {
  primaryVictoryPath: AutomationVictoryPath;
  /** Progress ratio for primaryVictoryPath specifically — see victory-path-scoring.ts VictoryPathScore.progress.
   *  Feeds build-need-vector.ts's VICTORY need (§7.2 of
   *  docs/ai-structure-building-rewrite-plan.md); not otherwise consumed by
   *  the planner today. */
  primaryVictoryPathProgress: number;
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
  hasActiveTown: boolean;
  hasActiveDock: boolean;
  /** Passthrough — tile keys of this player's currently active muster flags. */
  musterTileKeys?: ReadonlySet<string>;
  /** Round-trips through the caller like primaryVictoryPath — see ai-war-posture-latch.ts. */
  warPostureLatch: WarPostureLatchEntry;
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
  siegeBatteryBuildAvailable: boolean;
  previousVictoryPath?: AutomationVictoryPath | undefined;
  pathPopulationCounts?: Partial<Record<AutomationVictoryPath, number>> | undefined;
  /** Real season-victory standings for this player — see victory-path-scoring.ts. */
  worldVictoryProgress?: WorldVictoryProgress | undefined;
  activeMusterCount?: number;
  musterTileKeys?: ReadonlySet<string>;
  previousWarPostureLatch?: WarPostureLatchEntry | undefined;
};

export const buildAutomationStrategicSnapshot = <TTile extends StrategicTile>(
  input: StrategicSnapshotInput<TTile>
): AutomationStrategicSnapshot => {
  const hasActiveTown = input.townCount > 0 || input.ownedTiles.some((tile) => tile.ownershipState === "SETTLED" && Boolean(tile.town));
  const hasActiveDock = input.ownedTiles.some((tile) => tile.ownershipState === "SETTLED" && Boolean(tile.dockId));
  // §24.5: 10 is an old-scale gold/min figure; rescaled by the same
  // GOLD_RESCALE_DIVISOR (§6.1) the source constants use. In practice this
  // branch is nearly moot either way — a player with neither an active town
  // nor an active dock has essentially zero income in this economy model, so
  // hasActiveTown/hasActiveDock already cover the real signal.
  const growthFoundationEstablished = hasActiveTown || hasActiveDock || input.incomePerMinute >= 10 / GOLD_RESCALE_DIVISOR;
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
  const { path: primaryVictoryPath, progress: primaryVictoryPathProgress } = chooseVictoryPath(input);
  // §24.5: kept as an income/tempo signal (not swapped to manpower) per the
  // plan's own reasoning — this gates willingness to break for combat on
  // "is the economy already earning well," which is what gold income
  // measures; only the stale old-scale threshold needed rescaling.
  const opportunisticBreakPressure =
    pressureAttackScore >= (primaryVictoryPath === "TOWN_CONTROL" ? 120 : 180) &&
    canPivotToGrowth &&
    !input.needsFood &&
    input.incomePerMinute >= 10 / GOLD_RESCALE_DIVISOR;

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

  // WAR overrides every posture above — see hasLandConnectedThreat's doc
  // (ai-war-posture-latch.ts) for the enemy/barbarian asymmetry, and that
  // file's module comment for the hysteresis below.
  const threatNow = hasLandConnectedThreat({
    pressureThreatensCore,
    enemyAttack: input.frontierAnalysis.enemyAttack,
    barbarianAttack: input.frontierAnalysis.barbarianAttack
  });
  const warPostureLatch = nextWarPostureLatch(input.previousWarPostureLatch, threatNow);
  if (warPostureLatch.active) {
    frontPosture = "WAR";
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

  return {
    primaryVictoryPath,
    primaryVictoryPathProgress,
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
    musterReady: attackReady && (input.activeMusterCount ?? 0) < MUSTER_MAX_TILES,
    manpowerSufficient,
    hasActiveTown,
    hasActiveDock,
    ...(input.musterTileKeys ? { musterTileKeys: input.musterTileKeys } : {}),
    warPostureLatch
  };
};
