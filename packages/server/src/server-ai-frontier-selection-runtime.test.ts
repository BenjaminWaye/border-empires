import { describe, expect, it } from "vitest";
import type { Player, Tile, TileKey } from "@border-empires/shared";

import { createServerAiFrontierSelectionRuntime } from "./server-ai-frontier-selection-runtime.js";
import { emptyPlayerEffects } from "./server-effects.js";
import type {
  AiSettlementCandidateEvaluation,
  AiTerritorySummary
} from "./server-ai-frontier-types.js";

const key = (x: number, y: number): TileKey => `${x},${y}`;
const parseKey = (tileKey: TileKey): [number, number] => {
  const [xPart, yPart] = tileKey.split(",");
  return [Number(xPart), Number(yPart)];
};

const makeActor = (): Player => ({
  id: "ai-blue",
  name: "Blue AI",
  isAi: true,
  points: 200,
  level: 1,
  techIds: new Set(),
  domainIds: new Set(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  powerups: {},
  missions: [],
  missionStats: {
    neutralCaptures: 0,
    enemyCaptures: 0,
    combatWins: 0,
    maxTilesHeld: 0,
    maxSettledTilesHeld: 0,
    maxFarmsHeld: 0,
    maxContinentsHeld: 0,
    maxTechPicks: 0
  },
  territoryTiles: new Set(),
  T: 0,
  E: 0,
  Ts: 0,
  Es: 0,
  stamina: 100,
  staminaUpdatedAt: 0,
  manpower: 100,
  manpowerUpdatedAt: 0,
  allies: new Set(),
  spawnShieldUntil: 0,
  isEliminated: false,
  respawnPending: false,
  lastActiveAt: 0,
  activityInbox: []
});

const makeTile = (x: number, y: number, overrides: Partial<Tile> = {}): Tile =>
  Object.assign({ x, y, terrain: "LAND", lastChangedAt: 0 }, overrides);

const makeTerritorySummary = (frontierTiles: Tile[], controlledTowns: number): AiTerritorySummary => ({
  visibility: {} as AiTerritorySummary["visibility"],
  settledTileCount: 0,
  frontierTileCount: frontierTiles.length,
  settledTiles: [],
  frontierTiles,
  strategicFrontierTiles: [],
  expandCandidates: [],
  activeExpandCandidates: [],
  attackCandidates: [],
  borderSettledTileKeys: new Set(),
  structureCandidateTiles: [],
  underThreat: false,
  worldFlags: new Set(),
  controlledTowns,
  neutralTownExpandCount: 0,
  neutralEconomicExpandCount: 0,
  neutralLandExpandCount: 0,
  hostileTownAttackCount: 0,
  hostileEconomicAttackCount: 0,
  barbarianAttackAvailable: false,
  enemyAttackAvailable: false,
  foodPressure: controlledTowns > 0 ? 140 : 0,
  settlementEvaluationByKey: new Map<string, AiSettlementCandidateEvaluation>(),
  scoutRevealCountByTileKey: new Map(),
  scoutRevealValueByProfileKey: new Map(),
  scoutAdjacencyByTileKey: new Map(),
  supportedTownKeysByTileKey: new Map(),
  dockSignalByTileKey: new Map(),
  economicSignalByTileKey: new Map(),
  pressureSignalByTileKey: new Map(),
  islandFootprintSignalByTileKey: new Map(),
  islandFocusTargetId: undefined,
  scoutRevealMarks: new Uint32Array(0),
  scoutRevealStamp: 0
});

const makeEvaluation = (score: number): AiSettlementCandidateEvaluation => ({
  score,
  isEconomicallyInteresting: true,
  isStrategicallyInteresting: false,
  isDefensivelyCompact: false,
  supportsImmediatePlan: true,
  townSupportSignal: 0,
  intrinsicDockValue: 0,
  islandFootprintSignal: 0
});

describe("createServerAiFrontierSelectionRuntime", () => {
  it("only settles food tiles during food emergencies", () => {
    const actor = makeActor();
    const furTile = makeTile(1, 1, { ownerId: actor.id, ownershipState: "FRONTIER", resource: "FUR" });
    const foodTile = makeTile(2, 1, { ownerId: actor.id, ownershipState: "FRONTIER", resource: "FARM" });
    const tileByKey = new Map<TileKey, Tile>([
      [key(furTile.x, furTile.y), furTile],
      [key(foodTile.x, foodTile.y), foodTile]
    ]);
    const territorySummary = makeTerritorySummary([furTile, foodTile], 2);
    const evaluationByTile = new Map<TileKey, AiSettlementCandidateEvaluation>([
      [key(furTile.x, furTile.y), makeEvaluation(500)],
      [key(foodTile.x, foodTile.y), makeEvaluation(150)]
    ]);

    const runtime = createServerAiFrontierSelectionRuntime({
      aiTerritoryVersionForPlayer: () => 1,
      pendingSettlementCountForPlayer: () => 0,
      cachedAiSettlementSelectorByPlayer: new Map(),
      now: () => 0,
      key,
      parseKey,
      aiTileLiteAt: (x, y) => tileByKey.get(key(x, y)) ?? makeTile(x, y),
      collectAiTerritorySummary: () => territorySummary,
      islandMap: () => ({ islandIdByTile: new Map() }),
      aiEconomyPriorityState: () => ({ foodCoverageLow: true, economyWeak: true }),
      bestAiIslandFocusTargetId: () => undefined,
      tileHasPendingSettlement: () => false,
      evaluateAiSettlementCandidate: (_actor, tile) => evaluationByTile.get(key(tile.x, tile.y)) ?? makeEvaluation(Number.NEGATIVE_INFINITY),
      townsByTile: new Map(),
      docksByTile: new Map(),
      fortsByTile: new Map(),
      economicStructuresByTile: new Map(),
      adjacentNeighborCores: () => [],
      isBorderTile: () => false,
      baseTileValue: () => 0,
      getOrInitStrategicStocks: () => ({}),
      getPlayerEffectsForPlayer: emptyPlayerEffects,
      canPlaceEconomicStructure: () => ({ ok: false }),
      canBuildSiegeOutpostAt: () => ({ ok: false }),
      collectPlayerCompetitionMetrics: () => [],
      uniqueLeader: () => ({}),
      leadingPair: () => ({}),
      classifyAiNeutralFrontierOpportunity: () => "waste",
      aiEconomicFrontierSignal: () => 0,
      scoreAiScoutExpandCandidate: () => 0,
      aiIslandFootprintSignal: () => 0,
      aiVictoryPathForPlayer: () => undefined,
      runtimeWarn: () => {}
    });

    const result = runtime.bestAiSettlementTile(actor, undefined, territorySummary);

    expect(result).toEqual(foodTile);
  });
});
