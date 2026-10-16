import type { DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";

import { activeDevelopmentProcessCountForSummary, type PlayerRuntimeSummary } from "../player-runtime-summary.js";
import { plannerPlayerScopeKeyCount } from "../planner-scope-key-count.js";
import type { ResourceSlotDormancy, ResourceSlotTotals } from "../resource-slot-view/resource-slot-view.js";
import { mergePreplanDiagnostic } from "../runtime/merge-preplan-diagnostic.js";
import type { RuntimeState } from "../runtime/runtime-state.js";
import type { RuntimePlayer } from "../runtime-types.js";
import { rememberedAutomationVictoryPathCounts } from "../runtime-victory-path-counts.js";
import { foodDormantEconomicStructureKeysFromDormancy } from "../snapshot-economy-helpers.js";
import { activeAfcModuleTechIds } from "./ai-build-unlocks.js";
import { recordHotFrontierStreak, shouldForceBroadFrontierScan } from "./ai-hot-frontier-streak.js";
import { chooseAutomationPreplanCommand } from "./ai-preplan-command.js";
import type { DecisionCooldownMap } from "./ai-rejection-cooldown.js";
import type { AiTacticalView } from "./ai-tactical-view.js";
import { recordSpatialFocusOutcome, refreshSpatialFocusForSummary, type AiSpatialFocus } from "./ai-spatial-focus.js";
import type { WarPostureLatchEntry } from "./ai-war-posture-latch.js";
import { createAutomationNoopDiagnostic, planAutomationCommand, type AutomationPlannerDiagnostic } from "./automation-command-planner.js";
import type { AutomationVictoryPath } from "./automation-strategic-snapshot.js";
import { hasPlannerGatingLock } from "./planner-gating-lock.js";
import type { PlannerOwnedStructureCounts } from "./planner-owned-structure-counts.js";

// Throttle per-tick respawn attempts for eliminated AI players. Spawn
// placement is an O(n-tile) scan; 30 s cooldown keeps it from running
// every 200 ms when the map is too full to place.
const AI_RESPAWN_RETRY_INTERVAL_MS = 30_000;

export type AutomationSessionPrefix = "ai-runtime" | "system-runtime";

export type ExplainAutomationCommandOptions = {
  skipPreplan?: boolean;
  reservedDevelopmentSlots?: number;
  decisionCooldowns?: DecisionCooldownMap;
  blockedActionKeys?: ReadonlyMap<string, string>;
  beaconBoostActive?: boolean;
};

export type AutomationCommandExplanation = { command?: CommandEnvelope; diagnostic: AutomationPlannerDiagnostic };

/** What the advisor reads from the simulation runtime. Everything is a live view; nothing is copied. */
export interface RuntimeAutomationAdvisorDeps {
  readonly state: Pick<RuntimeState, "players" | "tiles" | "locksByTile" | "dockLinksByDockTileKey">;
  now(): number;
  summaryForPlayer(playerId: string): PlayerRuntimeSummary;
  respawnIfEliminated(playerId: string, commandId: string): void;
  tileKeySetToTiles(keys: Iterable<string>): DomainTileState[];
  estimatedIncomePerMinuteForPlayer(playerId: string): number;
  ownedStructureCountsForPlayer(playerId: string): PlannerOwnedStructureCounts;
  isPlayerTileInReach(playerId: string, x: number, y: number): boolean;
  resourceSlotSupplyForPlayer(playerId: string): ResourceSlotTotals;
  resourceSlotDemandForPlayer(playerId: string): ResourceSlotTotals;
  resourceSlotDormancyForPlayer(playerId: string): ResourceSlotDormancy;
  playerManpowerCap(player: RuntimePlayer): number;
  playerManpowerRegenPerMinute(player: RuntimePlayer): number;
  /** Visible aether targets around the focus front; only consulted once the player can cast (crystal-lattices or an Observatory). */
  tacticalViewForPlayer(playerId: string, focusKeys: readonly string[]): AiTacticalView;
}

/**
 * The in-process AI planner's per-player memory (victory path, war-posture
 * latch, spatial focus, hot-frontier streak, respawn throttle) and the
 * planning entry point that reads and updates it. The simulation runtime owns
 * one instance and delegates to it; the worker-thread planner reaches the same
 * memory through spatialFocusFrontTileKeys / recordDiagnosticFeedback.
 */
export class RuntimeAutomationAdvisor {
  /** Read by respawn (which clears a respawned player's entry) as well as the planner. */
  readonly victoryPathByPlayer = new Map<string, AutomationVictoryPath>();
  private readonly spatialFocusByPlayer = new Map<string, AiSpatialFocus>(); // Bounded per-AI focus front (BFS around a persistent hot-frontier origin) capping planner CPU; cleared once the player owns no territory.
  private readonly spatialFocusProductiveByPlayer = new Map<string, boolean>(); // Cached from the previous tick's planAutomationCommand diagnostic, feeding selectSpatialFocus's unproductive-streak rotation; a missing entry means "no signal yet" (treated as productive).
  private readonly hotFrontierStreakByPlayer = new Map<string, number>(); // Backs forceBroadFrontierScan — see ai-hot-frontier-streak.ts.
  private readonly warPostureLatchByPlayer = new Map<string, WarPostureLatchEntry>(); // Backs the WAR front posture's hysteresis — see ai-war-posture-latch.ts.
  private readonly lastRespawnAttemptMsByPlayer = new Map<string, number>();

  constructor(private readonly deps: RuntimeAutomationAdvisorDeps) {}

  explainNextCommand(
    playerId: string,
    clientSeq: number,
    issuedAt: number,
    sessionPrefix: AutomationSessionPrefix,
    options?: ExplainAutomationCommandOptions
  ): AutomationCommandExplanation {
    const { deps } = this;
    const { state } = deps;
    const player = state.players.get(playerId);
    if (!player) {
      return {
        diagnostic: createAutomationNoopDiagnostic(playerId, sessionPrefix, "player_missing")
      };
    }
    const summary = deps.summaryForPlayer(playerId);
    if (summary.territoryTileKeys.size <= 0) {
      this.forgetPlayer(playerId);
      if (player.isAi) {
        const nowMs = deps.now();
        const lastAttempt = this.lastRespawnAttemptMsByPlayer.get(playerId) ?? 0;
        if (nowMs - lastAttempt >= AI_RESPAWN_RETRY_INTERVAL_MS) {
          this.lastRespawnAttemptMsByPlayer.set(playerId, nowMs);
          deps.respawnIfEliminated(playerId, `ai-zero-tile-check:${playerId}:${nowMs}`);
        }
      }
    }
    const ownedTiles = deps.tileKeySetToTiles(summary.territoryTileKeys);
    const spatialFocus = refreshSpatialFocusForSummary(playerId, deps.now(), summary, this.spatialFocusByPlayer, this.spatialFocusProductiveByPlayer);
    const hasActiveLock = hasPlannerGatingLock(state.locksByTile.values(), playerId);
    let preplanDiagnostic: AutomationPlannerDiagnostic | undefined;
    if (!options?.skipPreplan) {
      const townTiles = deps.tileKeySetToTiles(summary.ownedTownTierByTile.keys()); // resolved only when preplan actually runs
      const preplan = chooseAutomationPreplanCommand({
        playerId,
        points: player.points,
        manpower: player.manpower,
        slotSupplyByResource: deps.resourceSlotSupplyForPlayer(playerId),
        slotDemandByResource: deps.resourceSlotDemandForPlayer(playerId),
        techIds: [...player.techIds],
        domainIds: player.domainIds ? [...player.domainIds] : [],
        strategicResources: { ...(player.strategicResources ?? {}) },
        settledTileCount: summary.settledTileCount,
        townCount: summary.townCount,
        incomePerMinute: deps.estimatedIncomePerMinuteForPlayer(playerId),
        hasActiveLock,
        ownedTiles, townTiles,
        clientSeq, issuedAt, sessionPrefix,
        ...(options?.decisionCooldowns ? { decisionCooldowns: options.decisionCooldowns } : {})
      });
      preplanDiagnostic = preplan.diagnostic;
      if (preplan.command) return preplan;
    }
    const forceBroadFrontierScan = shouldForceBroadFrontierScan(this.hotFrontierStreakByPlayer, playerId);
    const playerScopeKeyCount = plannerPlayerScopeKeyCount(summary);
    const plan = planAutomationCommand({
      playerId,
      points: player.points,
      manpower: player.manpower,
      ...([...player.techIds].length ? { techIds: [...player.techIds] } : {}),
      ...((player.domainIds ? [...player.domainIds] : []).length ? { domainIds: [...(player.domainIds ?? [])] } : {}),
      ...(Object.keys(player.strategicResources ?? {}).length ? { strategicResources: { ...(player.strategicResources ?? {}) } } : {}),
      settledTileCount: summary.settledTileCount,
      townCount: summary.townCount,
      incomePerMinute: deps.estimatedIncomePerMinuteForPlayer(playerId),
      hasActiveLock,
      activeDevelopmentProcessCount: activeDevelopmentProcessCountForSummary(summary),
      ...(options?.reservedDevelopmentSlots ? { reservedDevelopmentSlots: options.reservedDevelopmentSlots } : {}),
      installedModuleTechIds: activeAfcModuleTechIds(playerId, summary.ownedAfcTileKeys, state.tiles),
      tacticalView: (player.techIds.has("crystal-lattices") || (deps.ownedStructureCountsForPlayer(playerId).OBSERVATORY ?? 0) > 0)
        ? deps.tacticalViewForPlayer(playerId, [...(spatialFocus?.primaryFront ?? [])])
        : undefined,
      ownedStructureCounts: deps.ownedStructureCountsForPlayer(playerId),
      frontierTiles: deps.tileKeySetToTiles(summary.frontierTileKeys),
      hotFrontierTiles: deps.tileKeySetToTiles(summary.hotFrontierTileKeys),
      strategicFrontierTiles: deps.tileKeySetToTiles(summary.strategicFrontierTileKeys),
      buildCandidateTiles: deps.tileKeySetToTiles(summary.buildCandidateTileKeys),
      ownedTiles,
      tilesByKey: state.tiles,
      dockLinksByDockTileKey: state.dockLinksByDockTileKey,
      // Fixed-border reach: lets the AI's frontier-candidate enumeration
      // prune EXPAND targets outside the player's reach (see ReachLookup in
      // frontier-command-planner.ts). ATTACK candidates are unaffected.
      reachLookup: { isInReach: (pid, x, y) => deps.isPlayerTileInReach(pid, x, y) },
      slotSupplyByResource: deps.resourceSlotSupplyForPlayer(playerId),
      slotDemandByResource: deps.resourceSlotDemandForPlayer(playerId),
      foodDormantEconomicStructureKeys: foodDormantEconomicStructureKeysFromDormancy(deps.resourceSlotDormancyForPlayer(playerId)),
      manpowerCapacity: deps.playerManpowerCap(player),
      manpowerRegenPerMinute: deps.playerManpowerRegenPerMinute(player),
      playerScopeKeyCount,
      playerScopeTileCount: playerScopeKeyCount,
      previousVictoryPath: this.victoryPathByPlayer.get(playerId),
      pathPopulationCounts: this.victoryPathCounts(),
      previousWarPostureLatch: this.warPostureLatchByPlayer.get(playerId),
      onStrategicSnapshot: (snapshot) => {
        if (summary.territoryTileKeys.size <= 0) return;
        this.victoryPathByPlayer.set(playerId, snapshot.primaryVictoryPath);
        this.warPostureLatchByPlayer.set(playerId, snapshot.warPostureLatch);
      },
      ...(preplanDiagnostic?.preplanProgressState ? { preplanProgressState: preplanDiagnostic.preplanProgressState } : {}),
      ...(spatialFocus ? { spatialFocusFront: spatialFocus.primaryFront } : {}),
      ...(forceBroadFrontierScan ? { forceBroadFrontierScan } : {}),
      ...(options?.decisionCooldowns ? { decisionCooldowns: options.decisionCooldowns } : {}),
      ...(options?.beaconBoostActive ? { beaconBoostActive: true } : {}),
      ...(options?.blockedActionKeys ? { blockedActionKeys: options.blockedActionKeys } : {}),
      clientSeq,
      issuedAt,
      sessionPrefix
    });
    if (preplanDiagnostic?.preplanReason) {
      plan.diagnostic = mergePreplanDiagnostic(plan.diagnostic, preplanDiagnostic);
    }
    if (typeof plan.diagnostic.scanFoundActionableCandidate === "boolean") {
      this.spatialFocusProductiveByPlayer.set(playerId, plan.diagnostic.scanFoundActionableCandidate);
    } else {
      // No scan ran this tick (e.g. active_lock noop) - clear any cached
      // value instead of leaving a stale one, so the next refresh sees "no
      // signal" (treated as productive) rather than a lock-outlasting false.
      this.spatialFocusProductiveByPlayer.delete(playerId);
    }
    recordHotFrontierStreak(this.hotFrontierStreakByPlayer, playerId, plan.diagnostic.broadFallbackSkipped);
    return plan;
  }

  /** Worker-thread counterpart: the focus front the in-process path would pass as spatialFocusFront. */
  spatialFocusFrontTileKeys(playerId: string): string[] {
    const summary = this.deps.summaryForPlayer(playerId);
    const focus = refreshSpatialFocusForSummary(playerId, this.deps.now(), summary, this.spatialFocusByPlayer, this.spatialFocusProductiveByPlayer);
    return focus ? [...focus.primaryFront] : [];
  }

  /** Worker-thread counterpart of the feedback explainNextCommand records after planning. */
  recordDiagnosticFeedback(playerId: string, diagnostic: Pick<AutomationPlannerDiagnostic, "scanFoundActionableCandidate" | "broadFallbackSkipped">): void {
    recordSpatialFocusOutcome(playerId, diagnostic, this.spatialFocusProductiveByPlayer, this.hotFrontierStreakByPlayer);
  }

  private forgetPlayer(playerId: string): void {
    this.victoryPathByPlayer.delete(playerId);
    this.spatialFocusByPlayer.delete(playerId);
    this.spatialFocusProductiveByPlayer.delete(playerId);
    this.hotFrontierStreakByPlayer.delete(playerId);
    this.warPostureLatchByPlayer.delete(playerId);
  }

  private victoryPathCounts(): Partial<Record<AutomationVictoryPath, number>> {
    return rememberedAutomationVictoryPathCounts(
      this.victoryPathByPlayer,
      (playerId) => this.deps.summaryForPlayer(playerId).territoryTileKeys.size ?? 0
    );
  }
}
