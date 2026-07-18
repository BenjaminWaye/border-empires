/**
 * AI planner worker thread.
 * Runs inside a Node.js Worker so planning never blocks the main event loop.
 * The worker keeps planner state in-memory and is
 * updated incrementally via player/tile deltas.
 *
 * Message protocol (main → worker):
 *   { type: "init"; worldView: PlannerWorldView }
 *   { type: "sync_players"; players: PlannerPlayerView[] }
 *   { type: "tile_deltas"; tileDeltas: SimulationTileDelta[] }
 *   { type: "plan"; playerId: string; clientSeq: number; issuedAt: number;
 *     sessionPrefix: "ai-runtime" }
 *   { type: "pause" }
 *   { type: "resume" }
 *   { type: "shutdown" }
 *
 * Message protocol (worker → main):
 *   { type: "command"; playerId: string; command: CommandEnvelope | null;
 *     diagnostic?: AutomationPlannerDiagnostic }
 *   { type: "ready" }
 */

import { parentPort } from "node:worker_threads";
import { buildAiTrainingRecord } from "./ai-training-records.js";
import { createAiTrainingRecorder } from "./ai-training-recorder.js";
import {
  createAutomationNoopDiagnostic,
  planAutomationCommand,
  type AutomationPlannerPhase
} from "./automation-command-planner.js";
import type { AutomationPlannerDiagnostic } from "./automation-command-planner.js";
import { chooseAutomationPreplanCommand } from "./ai-preplan-command.js";
import type { AutomationVictoryPath } from "./automation-strategic-snapshot.js";
import { buildDockLinksByDockTileKey, type DockRouteDefinition } from "../dock-network/dock-network.js";
import type { PlannerDockView, PlannerPlayerView, PlannerWorldView, PlannerTileView } from "./planner-world-view.js";
import { resolvePlayerTiles as resolvePlayerTilesFromCache, type ResolvedPlayerTiles } from "./planner-tile-resolver.js";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { applyTileDelta } from "./planner-tile-delta-merge.js";
import type { SimulationTileDelta } from "./planner-tile-delta-parse.js";
import type { DecisionCooldownMap } from "./ai-rejection-cooldown.js";

if (!parentPort) throw new Error("ai-planner-worker must run inside a Worker thread");

let paused = false;
const tilesByKey = new Map<string, PlannerTileView>();
let dockLinksByDockTileKey = new Map<string, readonly string[]>();
let plannerDocks: PlannerDockView[] = [];
const playersById = new Map<string, PlannerPlayerView>();
const rememberedVictoryPathByPlayer = new Map<string, AutomationVictoryPath>();
const aiTrainingRecorder = createAiTrainingRecorder(process.env.SIMULATION_AI_TRAINING_RECORD_PATH);
const playerTileCacheById = new Map<string, { tileCollectionVersion: number } & ResolvedPlayerTiles>();

const rememberedVictoryPathCounts = (): Partial<Record<AutomationVictoryPath, number>> => {
  const counts: Partial<Record<AutomationVictoryPath, number>> = {
    TOWN_CONTROL: 0,
    ECONOMIC_HEGEMONY: 0,
    RESOURCE_MONOPOLY: 0,
    MARITIME_SUPREMACY: 0,
    DIPLOMATIC_DOMINANCE: 0
  };
  for (const [playerId, victoryPath] of rememberedVictoryPathByPlayer.entries()) {
    const player = playersById.get(playerId);
    if (!player || player.territoryTileKeys.length <= 0) continue;
    counts[victoryPath] = (counts[victoryPath] ?? 0) + 1;
  }
  return counts;
};

const plannerPlayerScopeKeyCount = (player: PlannerPlayerView): number => {
  const scopedKeys = new Set<string>();
  for (const key of player.territoryTileKeys) scopedKeys.add(key);
  for (const key of player.frontierTileKeys) scopedKeys.add(key);
  for (const key of player.hotFrontierTileKeys) scopedKeys.add(key);
  for (const key of player.strategicFrontierTileKeys) scopedKeys.add(key);
  for (const key of player.buildCandidateTileKeys) scopedKeys.add(key);
  for (const key of player.pendingSettlementTileKeys) scopedKeys.add(key);
  return scopedKeys.size;
};

const resolvedPlayerScopeTileCount = (resolved: {
  ownedTiles: readonly PlannerTileView[];
  frontierTiles: readonly PlannerTileView[];
  hotFrontierTiles: readonly PlannerTileView[];
  strategicFrontierTiles: readonly PlannerTileView[];
  buildCandidateTiles: readonly PlannerTileView[];
}): number => {
  const scopedKeys = new Set<string>();
  for (const tile of resolved.ownedTiles) scopedKeys.add(`${tile.x},${tile.y}`);
  for (const tile of resolved.frontierTiles) scopedKeys.add(`${tile.x},${tile.y}`);
  for (const tile of resolved.hotFrontierTiles) scopedKeys.add(`${tile.x},${tile.y}`);
  for (const tile of resolved.strategicFrontierTiles) scopedKeys.add(`${tile.x},${tile.y}`);
  for (const tile of resolved.buildCandidateTiles) scopedKeys.add(`${tile.x},${tile.y}`);
  return scopedKeys.size;
};

const applyTileDeltaToMap = (delta: SimulationTileDelta): void => applyTileDelta(tilesByKey, delta);

const resolvePlayerTiles = (player: PlannerPlayerView): ResolvedPlayerTiles =>
  resolvePlayerTilesFromCache(player, tilesByKey, playerTileCacheById);

const emitDiagnostic = (sample: {
  phase:
    | "resolve_player_tiles"
    | "planner_choose_frontier"
    | "planner_summarize_frontier"
    | "planner_total"
    // Frontier-analysis sub-phases (PR 1 measurement — cost-cap plan).
    | "analyze_iter_total"
    | "analyze_per_candidate"
    | "analyze_neighbor_lookups"
    | "analyze_score_calc";
  durationMs: number;
  playerId: string;
  ownedTileCount?: number;
  frontierTileCount?: number;
  queueWaitMs?: number; // gap before worker started processing this plan
  messagesAheadCount?: number; // messages handled since the prior plan
}): void => {
  parentPort!.postMessage({
    type: "diagnostic",
    diagnostic: sample
  });
};

let messagesSinceLastPlan = 0;

const choosePlannerCommand = (
  playerId: string,
  clientSeq: number,
  issuedAt: number,
  options?: {
    skipPreplan?: boolean; reservedDevelopmentSlots?: number;
    collectVisibleOnCooldown?: boolean;
    lastHeartbeatAtMs?: number;
    attackStalemateTargetTileKeys?: ReadonlySet<string>;
    decisionCooldowns?: DecisionCooldownMap;
  }
): { command: CommandEnvelope | null; diagnostic: AutomationPlannerDiagnostic } => {
  const plannerStartedAt = Date.now();
  const queueWaitMs = Math.max(0, plannerStartedAt - issuedAt);
  const messagesAheadCount = messagesSinceLastPlan;
  messagesSinceLastPlan = 0;
  const player = playersById.get(playerId);
  if (!player) {
    return {
      command: null,
      diagnostic: createAutomationNoopDiagnostic(playerId, "ai-runtime", "player_missing")
    };
  }
  if (player.territoryTileKeys.length <= 0) {
    rememberedVictoryPathByPlayer.delete(playerId);
  }
  const resolveTilesStartedAt = Date.now();
  const { frontierTiles, ownedTiles, hotFrontierTiles, strategicFrontierTiles, buildCandidateTiles, pendingSettlementTileKeys, townTiles } = resolvePlayerTiles(player);
  emitDiagnostic({
    phase: "resolve_player_tiles",
    durationMs: Math.max(0, Date.now() - resolveTilesStartedAt),
    playerId,
    ownedTileCount: ownedTiles.length,
    frontierTileCount: frontierTiles.length
  });
  let preplanDiagnostic: AutomationPlannerDiagnostic | undefined;
  if (!options?.skipPreplan) {
    const preplan = chooseAutomationPreplanCommand({
      playerId,
      points: player.points,
      ...(player.techIds ? { techIds: player.techIds } : {}),
      ...(player.domainIds ? { domainIds: player.domainIds } : {}),
      ...(player.strategicResources ? { strategicResources: player.strategicResources } : {}),
      ...(typeof player.settledTileCount === "number" ? { settledTileCount: player.settledTileCount } : {}),
      ...(typeof player.townCount === "number" ? { townCount: player.townCount } : {}),
      ...(typeof player.incomePerMinute === "number" ? { incomePerMinute: player.incomePerMinute } : {}),
      hasActiveLock: player.hasActiveLock,
      ownedTiles,
      townTiles,
      clientSeq,
      issuedAt,
      sessionPrefix: "ai-runtime",
      ...(options?.collectVisibleOnCooldown ? { collectVisibleOnCooldown: true } : {}),
      ...(typeof options?.lastHeartbeatAtMs === "number"
        ? { lastHeartbeatAtMs: options.lastHeartbeatAtMs }
        : {})
    });
    preplanDiagnostic = preplan.diagnostic;
    if (preplan.command) {
      emitDiagnostic({
        phase: "planner_total",
        durationMs: Math.max(0, Date.now() - plannerStartedAt),
        playerId,
        ownedTileCount: ownedTiles.length,
        frontierTileCount: frontierTiles.length,
        queueWaitMs,
        messagesAheadCount
      });
      return {
        command: preplan.command,
        diagnostic: preplan.diagnostic
      };
    }
  }
  const plan = planAutomationCommand({
    playerId,
    points: player.points,
    manpower: player.manpower,
    ...(player.techIds ? { techIds: player.techIds } : {}),
    ...(player.domainIds ? { domainIds: player.domainIds } : {}),
    ...(player.strategicResources ? { strategicResources: player.strategicResources } : {}),
    ...(typeof player.settledTileCount === "number" ? { settledTileCount: player.settledTileCount } : {}),
    ...(typeof player.townCount === "number" ? { townCount: player.townCount } : {}),
    ...(typeof player.incomePerMinute === "number" ? { incomePerMinute: player.incomePerMinute } : {}),
    hasActiveLock: player.hasActiveLock,
    activeDevelopmentProcessCount: player.activeDevelopmentProcessCount,
    ...(typeof options?.reservedDevelopmentSlots === "number" ? { reservedDevelopmentSlots: options.reservedDevelopmentSlots } : {}),
    ...(player.ownedStructureCounts ? { ownedStructureCounts: player.ownedStructureCounts } : {}),
    frontierTiles,
    hotFrontierTiles,
    strategicFrontierTiles,
    buildCandidateTiles,
    ownedTiles,
    tilesByKey,
    dockLinksByDockTileKey,
    playerScopeKeyCount: plannerPlayerScopeKeyCount(player),
    playerScopeTileCount: resolvedPlayerScopeTileCount({
      ownedTiles,
      frontierTiles,
      hotFrontierTiles,
      strategicFrontierTiles,
      buildCandidateTiles
    }),
    previousVictoryPath: rememberedVictoryPathByPlayer.get(playerId),
    pathPopulationCounts: rememberedVictoryPathCounts(),
    onStrategicSnapshot: (snapshot) => {
      if (player.territoryTileKeys.length <= 0) return;
      rememberedVictoryPathByPlayer.set(playerId, snapshot.primaryVictoryPath);
    },
    ...(preplanDiagnostic?.preplanProgressState ? { preplanProgressState: preplanDiagnostic.preplanProgressState } : {}),
    ...(options?.collectVisibleOnCooldown ? { collectVisibleOnCooldown: true } : {}),
    ...(options?.attackStalemateTargetTileKeys
      ? { attackStalemateTargetTileKeys: options.attackStalemateTargetTileKeys }
      : {}),
    ...(options?.decisionCooldowns ? { decisionCooldowns: options.decisionCooldowns } : {}),
    ...(player.expansionObjective ? { expansionObjective: player.expansionObjective } : {}),
    ...(typeof player.activeMusterCount === "number" ? { activeMusterCount: player.activeMusterCount } : {}),
    ...(player.musterTileKeys ? { musterTileKeys: new Set(player.musterTileKeys) } : {}),
    clientSeq,
    issuedAt,
    sessionPrefix: "ai-runtime",
    onPhaseTiming: (sample) => {
      const phaseByPlannerPhase = {
        choose_frontier: "planner_choose_frontier",
        summarize_frontier: "planner_summarize_frontier",
        analyze_iter_total: "analyze_iter_total",
        analyze_per_candidate: "analyze_per_candidate",
        analyze_neighbor_lookups: "analyze_neighbor_lookups",
        analyze_score_calc: "analyze_score_calc"
      } as const satisfies Record<AutomationPlannerPhase, string>;
      emitDiagnostic({
        phase: phaseByPlannerPhase[sample.phase],
        durationMs: sample.durationMs,
        playerId,
        ownedTileCount: ownedTiles.length,
        frontierTileCount: frontierTiles.length
      });
    }
  });
  if (preplanDiagnostic?.preplanReason) {
    plan.diagnostic = {
      ...plan.diagnostic,
      preplanReason: preplanDiagnostic.preplanReason,
      ...(typeof preplanDiagnostic.preplanNeedsEconomy === "boolean"
        ? { preplanNeedsEconomy: preplanDiagnostic.preplanNeedsEconomy }
        : {}),
      ...(typeof preplanDiagnostic.preplanNeedsFood === "boolean"
        ? { preplanNeedsFood: preplanDiagnostic.preplanNeedsFood }
        : {}),
      ...(typeof preplanDiagnostic.preplanTechChoiceAffordable === "boolean"
        ? { preplanTechChoiceAffordable: preplanDiagnostic.preplanTechChoiceAffordable }
        : {}),
      ...(typeof preplanDiagnostic.preplanDomainChoiceAffordable === "boolean"
        ? { preplanDomainChoiceAffordable: preplanDiagnostic.preplanDomainChoiceAffordable }
        : {}),
      ...(preplanDiagnostic.preplanProgressState
        ? { preplanProgressState: preplanDiagnostic.preplanProgressState }
        : {})
    };
  }
  // Only build the (tile-sorting) training record when recording is actually on.
  if (aiTrainingRecorder.enabled) {
    aiTrainingRecorder.record(
      buildAiTrainingRecord({
        player,
        issuedAt,
        clientSeq,
        ownedTiles,
        frontierTiles,
        hotFrontierTiles,
        strategicFrontierTiles,
        buildCandidateTiles,
        pendingSettlementTileKeys,
        ...(plannerDocks.length ? { docks: plannerDocks } : {}),
        ...(plan.command ? { command: plan.command } : {}),
        diagnostic: plan.diagnostic
      })
    );
  }
  emitDiagnostic({
    phase: "planner_total",
    durationMs: Math.max(0, Date.now() - plannerStartedAt),
    playerId,
    ownedTileCount: ownedTiles.length,
    frontierTileCount: frontierTiles.length,
    queueWaitMs,
    messagesAheadCount
  });
  return {
    command: plan.command ?? null,
    diagnostic: plan.diagnostic
  };
};

// ─── Message handler ──────────────────────────────────────────────────────────

parentPort.on("message", (msg: unknown) => {
  if (!msg || typeof msg !== "object") return;
  const message = msg as Record<string, unknown>;

  if (message.type !== "plan") messagesSinceLastPlan += 1;

  switch (message.type) {
    case "pause":
      paused = true;
      break;

    case "resume":
      paused = false;
      break;

    case "shutdown":
      void aiTrainingRecorder.flush().finally(() => {
        process.exit(0);
      });
      break;

    case "plan": {
      const issuedAt = message.issuedAt as number;
      if (paused) {
        parentPort!.postMessage({ type: "command", playerId: message.playerId, command: null });
        break;
      }
      try {
        const stalemateRaw = message.attackStalemateTargetTileKeys;
        const stalemateSet = Array.isArray(stalemateRaw)
          ? new Set<string>(stalemateRaw as string[])
          : undefined;
        const cooldownRaw = message.decisionCooldowns;
        const decisionCooldowns = cooldownRaw && typeof cooldownRaw === "object"
          ? cooldownRaw as DecisionCooldownMap
          : undefined;
        const plan = choosePlannerCommand(
          message.playerId as string,
          message.clientSeq as number,
          issuedAt,
          {
            skipPreplan: message.skipPreplan === true,
            ...(typeof message.reservedDevelopmentSlots === "number" ? { reservedDevelopmentSlots: message.reservedDevelopmentSlots as number } : {}),
            collectVisibleOnCooldown: message.collectVisibleOnCooldown === true,
            ...(typeof message.lastHeartbeatAtMs === "number"
              ? { lastHeartbeatAtMs: message.lastHeartbeatAtMs as number }
              : {}),
            ...(stalemateSet ? { attackStalemateTargetTileKeys: stalemateSet } : {}),
            ...(decisionCooldowns ? { decisionCooldowns } : {})
          }
        );
        parentPort!.postMessage({ type: "command", playerId: message.playerId, command: plan.command, diagnostic: plan.diagnostic });
      } catch (err) {
        parentPort!.postMessage({
          type: "error",
          playerId: message.playerId,
          message: err instanceof Error ? err.message : String(err)
        });
      }
      break;
    }

    case "init": {
      const worldView = message.worldView as PlannerWorldView;
      tilesByKey.clear();
      playersById.clear();
      rememberedVictoryPathByPlayer.clear();
      playerTileCacheById.clear();
      plannerDocks = (worldView.docks ?? []).map((dock) => ({
        ...dock,
        ...(dock.connectedDockIds?.length ? { connectedDockIds: [...dock.connectedDockIds] } : {})
      }));
      for (const tile of worldView.tiles) {
        tilesByKey.set(`${tile.x},${tile.y}`, tile);
      }
      dockLinksByDockTileKey = buildDockLinksByDockTileKey(plannerDocks as DockRouteDefinition[]);
      for (const player of worldView.players) {
        playersById.set(player.id, player);
      }
      break;
    }

    case "sync_players": {
      const players = (message.players as Partial<PlannerPlayerView>[]) ?? [];
      for (const player of players) {
        // When topology is unchanged the main thread sends a compact view
        // (no large tile-key arrays). Merge with the cached player so the
        // planner always has a complete view.
        const existing = playersById.get(player.id!);
        const merged: PlannerPlayerView = existing
          ? { ...existing, ...player } as PlannerPlayerView
          : player as PlannerPlayerView;
        if ((merged.territoryTileKeys?.length ?? 0) <= 0) {
          rememberedVictoryPathByPlayer.delete(merged.id);
        }
        const cached = playerTileCacheById.get(merged.id);
        if (cached && cached.tileCollectionVersion !== merged.tileCollectionVersion) {
          playerTileCacheById.delete(merged.id);
        }
        playersById.set(merged.id, merged);
      }
      break;
    }

    case "tile_deltas": {
      const tileDeltas = (message.tileDeltas as SimulationTileDelta[]) ?? [];
      for (const tileDelta of tileDeltas) {
        applyTileDeltaToMap(tileDelta);
      }
      break;
    }
  }
});

parentPort.postMessage({ type: "ready" });

const METRICS_INTERVAL_MS = 5_000;
setInterval(() => {
  parentPort!.postMessage({ type: "metrics", memoryUsage: process.memoryUsage() });
}, METRICS_INTERVAL_MS).unref();
