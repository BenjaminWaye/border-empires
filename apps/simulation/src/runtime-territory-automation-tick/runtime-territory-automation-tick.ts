import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainTileState } from "@border-empires/game-domain";
import {
  FRONTIER_CLAIM_COST
} from "@border-empires/shared";
import type { PlayerCandidateIndex } from "../player-candidate-index/player-candidate-index.js";
import {
  isAutoClaimTarget,
  isSettledTownAnchor,
  TOWN_AUTO_FRONTIER_RADIUS
} from "../territory-automation/territory-automation.js";
import type { LockRecord, RuntimePlayer, SimulationTileWireDelta } from "../runtime-types.js";

export type TickTerritoryAutomationInput = {
  nowMs: number;
  players: Map<string, RuntimePlayer>;
  tiles: Map<string, DomainTileState>;
  locksByTile: ReadonlyMap<string, LockRecord>;
  activeFortAnchorsByOwner: ReadonlyMap<string, ReadonlyMap<string, number>>;
  playerCandidateIndex: PlayerCandidateIndex;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  nextTerritoryAutomationCommandId: (label: string, playerId: string, tileKey: string, nowMs: number) => string;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  summaryForPlayer: (playerId: string) => unknown;
  applyEconomyAccrual: (player: RuntimePlayer, nowMs: number) => void;
  updateFrontierDecay: (nowMs: number) => Promise<void>;
  autoSettlementQueueLengthForPlayer: (playerId: string) => number;
  emitPlayerStateUpdate: (input: { commandId: string; playerId: string }) => void;
  runtimeLogInfo: (payload: Record<string, unknown>, message: string) => void;
  emitEvent: (event: SimulationEvent) => void;
  /** When provided, yields the event loop between major phases and between
   *  players so the 30s watchdog never fires on a busy tick. */
  yieldToEventLoop?: () => Promise<void>;
};

export const tickTerritoryAutomation = async (input: TickTerritoryAutomationInput): Promise<void> => {
  // Use a no-op so every call site can unconditionally `await yield_()` without
  // an `if (yield_)` guard cluttering each phase boundary.
  const yield_ = input.yieldToEventLoop ?? (() => Promise.resolve());
  const _ttaStart = Date.now();
  const autoClaimedKeys = new Set<string>();
  let _claimSummaryForPlayerMs = 0;
  let _claimAnchorScanMs = 0;
  let _claimReplaceTileStateMs = 0;
  let _claimEmitMs = 0;
  let _playersProcessed = 0;
  let _anchorsIterated = 0;
  let _claimCandidatesEvaluated = 0;
  let _tilesActuallyClaimed = 0;
  // Cap claims per player per tick to bound replaceTileState cascade cost.
  // Each claim triggers topology dirty + event emission; uncapped this is
  // O(anchors × candidates) replaceTileState calls per tick.
  const MAX_CLAIMS_PER_PLAYER = 8;

  for (const playerId of input.players.keys()) {
    if (playerId.startsWith("barbarian-")) continue;
    const _t0 = Date.now();
    input.summaryForPlayer(playerId);
    const actor = input.players.get(playerId);
    if (!actor) continue;
    input.applyEconomyAccrual(actor, input.nowMs);
    _claimSummaryForPlayerMs += Date.now() - _t0;
    _playersProcessed++;

    const claimDeltas: Array<ReturnType<TickTerritoryAutomationInput["tileDeltaFromState"]>> = [];
    let claimsThisPlayer = 0;
    let claimCommandId: string | undefined;
    const fortAnchorMap = input.activeFortAnchorsByOwner.get(playerId);
    for (const anchorKey of (fortAnchorMap ? fortAnchorMap.keys() : [])) {
      _anchorsIterated++;
      const _tAnchor = Date.now();
      const anchor = input.tiles.get(anchorKey);
      if (!anchor) {
        _claimAnchorScanMs += Date.now() - _tAnchor;
        continue;
      }
      const radius = isSettledTownAnchor(anchor, playerId)
        ? TOWN_AUTO_FRONTIER_RADIUS
        : 0;
      if (radius <= 0) {
        _claimAnchorScanMs += Date.now() - _tAnchor;
        continue;
      }
      for (const targetKey of input.playerCandidateIndex.claimCandidates(anchorKey, radius)) {
        _claimCandidatesEvaluated++;
        if (actor.points < FRONTIER_CLAIM_COST) break;
        if (claimsThisPlayer >= MAX_CLAIMS_PER_PLAYER) break;
        if (targetKey === anchorKey || autoClaimedKeys.has(targetKey) || input.locksByTile.has(targetKey)) continue;
        const target = input.tiles.get(targetKey);
        if (!isAutoClaimTarget(target)) continue;
        autoClaimedKeys.add(targetKey);
        actor.points -= FRONTIER_CLAIM_COST;
        claimCommandId ??= input.nextTerritoryAutomationCommandId("frontier", playerId, "batch", input.nowMs);
        const claimedTile: DomainTileState = {
          ...target,
          ownerId: playerId,
          ownershipState: "FRONTIER"
        };
        const _tReplace = Date.now();
        input.replaceTileState(targetKey, claimedTile, claimCommandId);
        const _replaceDuration = Date.now() - _tReplace;
        _claimReplaceTileStateMs += _replaceDuration;
        _claimAnchorScanMs -= _replaceDuration;
        claimDeltas.push(input.tileDeltaFromState(claimedTile));
        _tilesActuallyClaimed++;
        claimsThisPlayer++;
      }
      _claimAnchorScanMs += Date.now() - _tAnchor;
    }

    if (claimCommandId && claimDeltas.length > 0) {
      const _tEmit = Date.now();
      input.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: claimCommandId,
        playerId,
        goldCost: FRONTIER_CLAIM_COST * claimDeltas.length,
        tileDeltas: claimDeltas
      });
      input.emitPlayerStateUpdate({ commandId: claimCommandId, playerId });
      _claimEmitMs += Date.now() - _tEmit;
    }
    // Yield between players so AI commands and gRPC dispatch can run, preventing
    // the claim loop from blocking the event loop for the full tick duration.
    await yield_();
  }

  const _ttaAfterClaim = Date.now();
  // Yield before frontier decay — it iterates all frontier tiles across all players.
  await yield_();
  await input.updateFrontierDecay(input.nowMs);
  const _ttaAfterDecay = Date.now();
  let _settleQueueNotifyMs = 0;
  let _settleQueueNotifications = 0;

  for (const playerId of input.players.keys()) {
    if (!playerId.startsWith("barbarian-") && input.autoSettlementQueueLengthForPlayer(playerId) > 0) {
      const _tSettle = Date.now();
      input.emitPlayerStateUpdate({
        commandId: input.nextTerritoryAutomationCommandId("settle-queue", playerId, "batch", input.nowMs),
        playerId
      });
      _settleQueueNotifyMs += Date.now() - _tSettle;
      _settleQueueNotifications++;
      // Yield between settlement-queue notifications (each triggers cachedEconomySnapshot).
      await yield_();
    }
  }

  const _ttaEnd = Date.now();
  const totalMs = _ttaEnd - _ttaStart;
  if (totalMs >= 100) {
    input.runtimeLogInfo(
      {
        totalMs,
        claimLoopMs: _ttaAfterClaim - _ttaStart,
        updateFrontierDecayMs: _ttaAfterDecay - _ttaAfterClaim,
        settleMs: _ttaEnd - _ttaAfterDecay,
        claim: {
          summaryForPlayerMs: _claimSummaryForPlayerMs,
          anchorScanMs: _claimAnchorScanMs,
          replaceTileStateMs: _claimReplaceTileStateMs,
          emitMs: _claimEmitMs,
          playersProcessed: _playersProcessed,
          anchorsIterated: _anchorsIterated,
          claimCandidatesEvaluated: _claimCandidatesEvaluated,
          tilesActuallyClaimed: _tilesActuallyClaimed
        },
        settle: {
          queueNotifyMs: _settleQueueNotifyMs,
          settleQueueNotifications: _settleQueueNotifications
        }
      },
      "[tick_territory_automation] phase breakdown"
    );
  }
};
