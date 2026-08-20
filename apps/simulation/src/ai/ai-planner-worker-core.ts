/**
 * AI planner worker core — the actual planning logic that used to run
 * directly inside ai-planner-worker.ts's top-level `parentPort` handler.
 *
 * Extracted so the SAME logic can run either:
 *  - standalone, inside its own dedicated Worker (ai-planner-worker.ts —
 *    still used as the default/fallback path and by every existing test), or
 *  - multiplexed alongside the system-job core inside a single shared Worker
 *    (combined-producer-worker.ts — the P3 thread-consolidation path).
 *
 * IMPORTANT: no scheduling/gating/decision logic changes here — this is a
 * mechanical extraction. `post` replaces the old direct `parentPort!.postMessage`
 * call so the caller controls message shape (e.g. adding a `channel` tag).
 */

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

export const createAiPlannerWorkerCore = (post: (msg: Record<string, unknown>) => void) => {
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
      | "analyze_iter_total"
      | "analyze_per_candidate"
      | "analyze_neighbor_lookups"
      | "analyze_score_calc";
    durationMs: number;
    playerId: string;
    ownedTileCount?: number;
    frontierTileCount?: number;
    queueWaitMs?: number;
    messagesAheadCount?: number;
  }): void => {
    post({
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
        manpower: player.manpower,
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
          : {}),
        ...(options?.decisionCooldowns ? { decisionCooldowns: options.decisionCooldowns } : {})
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
    // Fixed-border reach (packages/shared/src/reach/reach.ts): this worker
    // thread has no access to the main-thread runtime's live reachBorder, so
    // it can't compute reach itself the way runtime.ts's direct in-process
    // call does — the main thread instead resolves it server-side and syncs
    // the tile-key SET via PlannerPlayerView.reachTileKeys (see
    // buildRuntimePlannerPlayerViews). Before this, reachLookup was never
    // wired in the worker path at all, meaning the ai-runtime session
    // (SIMULATION_AI_WORKER=1, the path actually running in staging/prod)
    // proposed EXPAND targets with zero reach awareness — the server's
    // authoritative OUT_OF_REACH check then rejected roughly half of every
    // AI's EXPAND attempts, every single tick, forever (confirmed live:
    // sim_ai_command_rejected_code_total{code="OUT_OF_REACH"} tracked almost
    // exactly the accepted EXPAND count, and stuck empires never grew past
    // their first few claimed tiles despite abundant room left in reach).
    const reachTileKeySet = player.reachTileKeys ? new Set(player.reachTileKeys) : undefined;
    const reachLookup = reachTileKeySet ? { isInReach: (_pid: string, x: number, y: number) => reachTileKeySet.has(`${x},${y}`) } : undefined;
    const plan = planAutomationCommand({
      playerId,
      points: player.points,
      manpower: player.manpower,
      ...(reachLookup ? { reachLookup } : {}),
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
      // Phase 1 of docs/ai-structure-building-rewrite-plan.md (§9): pass
      // through only if the sync_players payload actually carried them (see
      // PlannerPlayerView's doc comment) — planAutomationCommand's needVector
      // gate requires all four or none.
      ...(typeof player.manpowerCapacity === "number" ? { manpowerCapacity: player.manpowerCapacity } : {}),
      ...(typeof player.manpowerRegenPerMinute === "number"
        ? { manpowerRegenPerMinute: player.manpowerRegenPerMinute }
        : {}),
      ...(player.slotSupplyByResource ? { slotSupplyByResource: player.slotSupplyByResource } : {}),
      ...(player.slotDemandByResource ? { slotDemandByResource: player.slotDemandByResource } : {}),
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

  const handleMessage = (msg: unknown): void => {
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

      case "plan": {
        const issuedAt = message.issuedAt as number;
        if (paused) {
          post({ type: "command", playerId: message.playerId, command: null });
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
          post({ type: "command", playerId: message.playerId, command: plan.command, diagnostic: plan.diagnostic });
        } catch (err) {
          post({
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
  };

  return {
    handleMessage,
    shutdown: (): Promise<void> => aiTrainingRecorder.flush()
  };
};

export type AiPlannerWorkerCore = ReturnType<typeof createAiPlannerWorkerCore>;
