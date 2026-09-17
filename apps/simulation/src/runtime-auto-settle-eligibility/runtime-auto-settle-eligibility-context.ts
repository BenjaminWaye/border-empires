// Composition-root wiring for runtime-auto-settle-eligibility.ts, extracted
// out of runtime.ts (SimulationRuntime) to keep that already-oversized file
// from growing further -- see scripts/check-file-line-limits.mjs and
// AGENTS.md's file-growth rule. Mirrors the same "deps bag -> composed
// context" pattern as runtime-progression-command-context.ts.
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { simulationTileKey } from "../seed-state/seed-state.js";
import { isAutoSettlementResourceTechRevealed } from "../territory-automation/territory-automation.js";
import { tileResourceMatchesRevealCategory } from "../tech-domain-bridge/tech-domain-bridge.js";
import { settleRejectionForActor } from "../runtime-settlement-rules.js";
import {
  drainEligibleFrontierQueue,
  evaluateAndAttemptSettle,
  hasGrownTownSupportRing,
  orderedEligibleFrontierTiles,
  reconcileEligibleFrontierQueueForOwner,
  removeEligibleFrontierTile,
  syncTownSupportRingForTileChange,
  type EligibleFrontierByOwner,
  type EvaluateTileEligibilityDeps,
  type GrownTownSupportRingByOwner,
  type SettleAttemptContext
} from "./runtime-auto-settle-eligibility.js";

export interface AutoSettleEligibilityRuntimeDeps {
  readonly tiles: ReadonlyMap<string, DomainTileState>;
  readonly players: ReadonlyMap<string, DomainPlayer>;
  readonly locksByTile: ReadonlyMap<string, unknown>;
  readonly pendingSettlementsByTile: ReadonlyMap<string, unknown>;
  readonly frontierTilesByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  readonly eligibleFrontierByOwner: EligibleFrontierByOwner;
  readonly grownTownSupportRingByOwner: GrownTownSupportRingByOwner;
  readonly isVisible: (playerId: string, tileKey: string) => boolean;
  readonly isPlayerTileInReach: (playerId: string, x: number, y: number) => boolean;
  readonly hasAvailableDevelopmentSlot: (playerId: string) => boolean;
  readonly startSettlementProcess: (input: {
    commandId: string;
    playerId: string;
    targetKey: string;
    target: DomainTileState;
    startedAt: number;
  }) => void;
  readonly nextTerritoryAutomationCommandId: (label: string, playerId: string, tileKey: string, nowMs: number) => string;
  readonly now: () => number;
}

export interface AutoSettleEligibilityRuntime {
  depsForPlayer(playerId: string): EvaluateTileEligibilityDeps;
  settleAttemptContext(): SettleAttemptContext;
  /** Hook for every tile mutation -- frontier-membership and town-support-ring maintenance. */
  maintainForTileChange(tileKey: string, previous: DomainTileState | undefined, next: DomainTileState): void;
  /** Tech-unlock hook: sweeps this player's frontier resource tiles of the newly-revealed category only. */
  sweepFrontierResourceTechUnlock(playerId: string, revealedCategory: string): void;
  /** Slot-freed drain -- call after a settlement/build completes. */
  drainForOwner(ownerId: string): number;
  /** Bounded reconciliation safety net -- call once per player per territory-automation tick. */
  reconcileForOwner(ownerId: string): number;
  /** Ordered {x, y} snapshot for autoSettlementQueueForPlayer, pre-filtered through isBlocked. */
  orderedQueueForPlayer(playerId: string): Array<{ x: number; y: number }>;
}

export const buildAutoSettleEligibilityRuntime = (deps: AutoSettleEligibilityRuntimeDeps): AutoSettleEligibilityRuntime => {
  const isBlocked = (tileKey: string): boolean => deps.locksByTile.has(tileKey) || deps.pendingSettlementsByTile.has(tileKey);

  const depsForPlayer = (playerId: string): EvaluateTileEligibilityDeps => {
    const player = deps.players.get(playerId);
    return {
      getTile: (tileKey) => deps.tiles.get(tileKey),
      isBlocked,
      isInReach: (tile) => deps.isPlayerTileInReach(playerId, tile.x, tile.y),
      hasTownSupport: (tile) => hasGrownTownSupportRing(deps.grownTownSupportRingByOwner, playerId, simulationTileKey(tile.x, tile.y)),
      isRevealedToPlayer: (tile) =>
        deps.isVisible(playerId, simulationTileKey(tile.x, tile.y)) && isAutoSettlementResourceTechRevealed(tile, player)
    };
  };

  const settleAttemptContext = (): SettleAttemptContext => ({
    getTile: (tileKey) => deps.tiles.get(tileKey),
    isBlocked,
    isInReach: (playerId, tile) => deps.isPlayerTileInReach(playerId, tile.x, tile.y),
    settleRejectionForActor: (playerId) => {
      const actor = deps.players.get(playerId);
      return Boolean(actor && settleRejectionForActor(actor));
    },
    hasAvailableDevelopmentSlot: (playerId) => deps.hasAvailableDevelopmentSlot(playerId),
    startSettlementProcess: (input) => deps.startSettlementProcess(input),
    nextCommandId: (playerId, tileKey) => deps.nextTerritoryAutomationCommandId("auto-settle", playerId, tileKey, deps.now()),
    now: () => deps.now()
  });

  const maintainForTileChange = (tileKey: string, previous: DomainTileState | undefined, next: DomainTileState): void => {
    const prevIsFrontier = previous?.ownershipState === "FRONTIER" && Boolean(previous.ownerId);
    const nextIsFrontier = next.ownershipState === "FRONTIER" && Boolean(next.ownerId);
    if (prevIsFrontier && (previous!.ownerId !== next.ownerId || !nextIsFrontier)) {
      removeEligibleFrontierTile(deps.eligibleFrontierByOwner, previous!.ownerId!, tileKey);
    }
    const ringDeltas = syncTownSupportRingForTileChange({
      tileKey,
      previous,
      next,
      tiles: deps.tiles,
      grownTownSupportRingByOwner: deps.grownTownSupportRingByOwner
    });
    if (nextIsFrontier) {
      evaluateAndAttemptSettle(deps.eligibleFrontierByOwner, next.ownerId!, tileKey, depsForPlayer(next.ownerId!), settleAttemptContext());
    }
    // A town tier upgrade or capture can widen/transfer a ring, making OTHER
    // already-FRONTIER tiles newly eligible (rule 6) -- re-evaluate just
    // those tiles for the affected owner, not a frontier-wide sweep.
    for (const delta of ringDeltas) {
      const ownerFrontier = deps.frontierTilesByOwner.get(delta.ownerId);
      if (!ownerFrontier) continue;
      const evalDeps = depsForPlayer(delta.ownerId);
      const settleCtx = settleAttemptContext();
      for (const ringTileKey of delta.newlyCoveredTileKeys) {
        if (ownerFrontier.has(ringTileKey)) evaluateAndAttemptSettle(deps.eligibleFrontierByOwner, delta.ownerId, ringTileKey, evalDeps, settleCtx);
      }
    }
  };

  const sweepFrontierResourceTechUnlock = (playerId: string, revealedCategory: string): void => {
    const frontierKeys = deps.frontierTilesByOwner.get(playerId);
    if (!frontierKeys) return;
    const evalDeps = depsForPlayer(playerId);
    const settleCtx = settleAttemptContext();
    for (const tileKey of frontierKeys) {
      const tile = deps.tiles.get(tileKey);
      if (!tile?.resource || !tileResourceMatchesRevealCategory(tile.resource, revealedCategory)) continue;
      evaluateAndAttemptSettle(deps.eligibleFrontierByOwner, playerId, tileKey, evalDeps, settleCtx);
    }
  };

  return {
    depsForPlayer,
    settleAttemptContext,
    maintainForTileChange,
    sweepFrontierResourceTechUnlock,
    drainForOwner: (ownerId) => drainEligibleFrontierQueue(deps.eligibleFrontierByOwner, ownerId, settleAttemptContext()),
    reconcileForOwner: (ownerId) => {
      const frontierKeys = deps.frontierTilesByOwner.get(ownerId);
      if (!frontierKeys) return 0;
      return reconcileEligibleFrontierQueueForOwner(deps.eligibleFrontierByOwner, ownerId, frontierKeys, depsForPlayer(ownerId));
    },
    orderedQueueForPlayer: (playerId) =>
      orderedEligibleFrontierTiles(deps.eligibleFrontierByOwner, playerId).filter(({ x, y }) => !isBlocked(simulationTileKey(x, y)))
  };
};
