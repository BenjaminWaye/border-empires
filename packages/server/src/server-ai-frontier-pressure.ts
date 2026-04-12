import { DOCK_DEFENSE_MULT, combatWinChance, type Player, type Tile, type TileKey } from "@border-empires/shared";
import type { AiSeasonVictoryPathId } from "./ai/goap.js";
import type { RuntimeTileCore } from "./server-shared-types.js";
import type { AiTerritorySummary } from "./server-ai-frontier-types.js";

export interface CreateServerAiFrontierPressureDeps {
  BARBARIAN_OWNER_ID: string;
  townsByTile: Map<TileKey, unknown>;
  docksByTile: Map<TileKey, unknown>;
  economicStructuresByTile: Map<TileKey, unknown>;
  players: Map<string, Player>;
  collectPlayerCompetitionMetrics: () => Array<{ playerId: string; controlledTowns: number; incomePerMinute: number }>;
  uniqueLeader: (values: Array<{ playerId: string; value: number }>) => { playerId?: string };
  leadingPair: (values: Array<{ playerId: string; value: number }>) => { leaderPlayerId?: string };
  activeAttackBuffMult: (playerId: string) => number;
  outpostAttackMultAt: (attackerId: string, tileKey: TileKey) => number;
  attackMultiplierForTarget: (attackerId: string, target: Tile, originTileKey?: TileKey) => number;
  playerDefensiveness: (player: Player) => number;
  fortDefenseMultAt: (defenderId: string, tileKey: TileKey) => number;
  settledDefenseMultiplierForTarget: (defenderId: string, target: Tile) => number;
  ownershipDefenseMultiplierForTarget: (defenderId: string | undefined, target: Tile) => number;
  adjacentNeighborCores: (x: number, y: number) => RuntimeTileCore[];
  visibleInSnapshot: (snapshot: AiTerritorySummary["visibility"], x: number, y: number) => boolean;
  pressureAttackThreatensCore: (actor: Player, candidate?: { to: Tile }) => boolean;
  baseTileValue: (resource: Tile["resource"]) => number;
  aiEnemyPressureSignal: (
    actor: Player,
    tile: Tile,
    visibility?: AiTerritorySummary["visibility"],
    territorySummary?: Partial<Pick<AiTerritorySummary, "pressureSignalByTileKey" | "visibility" | "foodPressure" | "settlementEvaluationByKey">>
  ) => number;
  key: (x: number, y: number) => TileKey;
}

export interface ServerAiFrontierPressureRuntime {
  estimateAiPressureAttackProfile: (
    actor: Player,
    territorySummary: Pick<AiTerritorySummary, "attackCandidates" | "visibility">
  ) => { score: number; threatensCore: boolean };
  bestAiEnemyPressureAttack: (
    actor: Player,
    victoryPath: AiSeasonVictoryPathId | undefined,
    territorySummary: AiTerritorySummary
  ) => { from: Tile; to: Tile; score: number } | undefined;
}

export const createServerAiFrontierPressureRuntime = (
  deps: CreateServerAiFrontierPressureDeps
): ServerAiFrontierPressureRuntime => {
  const estimateAiPressureAttackProfile = (
    actor: Player,
    territorySummary: Pick<AiTerritorySummary, "attackCandidates" | "visibility">
  ): { score: number; threatensCore: boolean } => {
    let bestScore = 0;
    let threatensCore = false;
    for (const { to } of territorySummary.attackCandidates) {
      if (to.terrain !== "LAND" || !to.ownerId || to.ownerId === actor.id || to.ownerId === deps.BARBARIAN_OWNER_ID || actor.allies.has(to.ownerId)) continue;
      const tk = deps.key(to.x, to.y);
      let score = 0;
      const ownedAdjacency = deps.adjacentNeighborCores(to.x, to.y).reduce((count, neighbor) => count + (neighbor.ownerId === actor.id ? 1 : 0), 0);
      const settledAdjacency = deps.adjacentNeighborCores(to.x, to.y).reduce((count, neighbor) => count + (neighbor.ownerId === actor.id && neighbor.ownershipState === "SETTLED" ? 1 : 0), 0);
      score += ownedAdjacency * 95 + settledAdjacency * 70;
      if (to.ownershipState === "FRONTIER") score += 220;
      if (deps.visibleInSnapshot(territorySummary.visibility, to.x, to.y)) {
        if (deps.townsByTile.has(tk)) score += 160;
        if (to.resource) score += 100 + deps.baseTileValue(to.resource);
        if (deps.docksByTile.has(tk)) score += 130;
      }
      if (score > bestScore) bestScore = score;
      if (!threatensCore) threatensCore = deps.pressureAttackThreatensCore(actor, { to });
    }
    return { score: bestScore, threatensCore };
  };

  const bestAiEnemyPressureAttack = (
    actor: Player,
    victoryPath: AiSeasonVictoryPathId | undefined,
    territorySummary: AiTerritorySummary
  ): { from: Tile; to: Tile; score: number } | undefined => {
    const competitionMetrics = deps.collectPlayerCompetitionMetrics();
    const townLeaderId = deps.uniqueLeader(competitionMetrics.map((metric) => ({ playerId: metric.playerId, value: metric.controlledTowns }))).playerId;
    const incomeLeaderId = deps.leadingPair(competitionMetrics.map((metric) => ({ playerId: metric.playerId, value: metric.incomePerMinute }))).leaderPlayerId;
    let best: { from: Tile; to: Tile; score: number } | undefined;
    for (const { from, to } of territorySummary.attackCandidates) {
      if (to.terrain !== "LAND" || !to.ownerId || to.ownerId === actor.id || to.ownerId === deps.BARBARIAN_OWNER_ID || actor.allies.has(to.ownerId)) continue;
      const signal = deps.aiEnemyPressureSignal(actor, to, territorySummary.visibility, territorySummary);
      if (signal <= 0) continue;
      let score = signal;
      const targetKey = deps.key(to.x, to.y);
      const originTileKey = deps.key(from.x, from.y);
      const defender = deps.players.get(to.ownerId);
      const attackBase = 10 * actor.mods.attack * deps.activeAttackBuffMult(actor.id) * deps.outpostAttackMultAt(actor.id, originTileKey) * deps.attackMultiplierForTarget(actor.id, to, originTileKey);
      const defenseBase =
        10 *
        (defender?.mods.defense ?? 1) *
        (defender ? deps.playerDefensiveness(defender) : 1) *
        (defender ? deps.fortDefenseMultAt(defender.id, targetKey) : 1) *
        (deps.docksByTile.has(targetKey) ? DOCK_DEFENSE_MULT : 1) *
        (defender ? deps.settledDefenseMultiplierForTarget(defender.id, to) : 1) *
        deps.ownershipDefenseMultiplierForTarget(defender?.id, to);
      score += Math.round(combatWinChance(attackBase, defenseBase) * 220);
      if (deps.townsByTile.has(targetKey)) score += victoryPath === "TOWN_CONTROL" ? 320 : 180;
      if (deps.docksByTile.has(targetKey)) score += victoryPath === "ECONOMIC_HEGEMONY" ? 180 : 90;
      if (deps.economicStructuresByTile.has(targetKey) || Boolean(to.resource)) score += victoryPath === "ECONOMIC_HEGEMONY" ? 220 : 120;
      if (to.ownershipState === "FRONTIER") score += 120;
      if (victoryPath === "TOWN_CONTROL") score += 140;
      if (victoryPath === "ECONOMIC_HEGEMONY") score += 80;
      if (victoryPath === "TOWN_CONTROL" && to.ownerId === townLeaderId) score += 180;
      if (victoryPath === "ECONOMIC_HEGEMONY" && to.ownerId === incomeLeaderId) score += 220;
      if (defender && !defender.isAi) score += 50;
      if (!best || score > best.score) best = { from, to, score };
    }
    const minScore = victoryPath === "TOWN_CONTROL" || victoryPath === "ECONOMIC_HEGEMONY" ? 55 : 80;
    return best && best.score >= minScore ? best : undefined;
  };

  return { estimateAiPressureAttackProfile, bestAiEnemyPressureAttack };
};
