import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainTileState, FrontierCommandType } from "@border-empires/game-domain";
import {
  ATTACK_MANPOWER_COST,
  ATTACK_MANPOWER_MIN,
  FRONTIER_CLAIM_COST,
  MUSTER_SYSTEM_ENABLED,
  SWEEP_RADIUS_BY_VARIANT
} from "@border-empires/shared";
import type { PlayerCandidateIndex } from "./player-candidate-index.js";
import { simulationTileKey } from "./seed-state.js";
import {
  FORT_AUTO_FRONTIER_RADIUS,
  FORT_PATROL_GRACE_MS,
  fortAutoFrontierRadiusForTile,
  isAutoClaimTarget,
  isSettledTownAnchor,
  TOWN_AUTO_FRONTIER_RADIUS
} from "./territory-automation.js";
import type { LockRecord, RuntimePlayer } from "./runtime-types.js";
import { tickSweepStructure, type SweepStructureRuntimeInput } from "./runtime-sweep-structure-tick.js";

export type TickTerritoryAutomationInput = SweepStructureRuntimeInput & {
  nowMs: number;
  players: Map<string, RuntimePlayer>;
  tiles: Map<string, DomainTileState>;
  locksByTile: ReadonlyMap<string, LockRecord>;
  activeFortAnchorsByOwner: ReadonlyMap<string, ReadonlyMap<string, number>>;
  activeSiegeOutpostsByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  activeLightOutpostsByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  playerCandidateIndex: PlayerCandidateIndex;
  summaryForPlayer: (playerId: string) => unknown;
  applyEconomyAccrual: (player: RuntimePlayer, nowMs: number) => void;
  applyManpowerRegen: (player: RuntimePlayer, nowMs: number) => void;
  updateFrontierDecay: (nowMs: number) => void;
  autoSettlementQueueLengthForPlayer: (playerId: string) => number;
  emitPlayerStateUpdate: (input: { commandId: string; playerId: string }) => void;
  extendFortPatrolGrace: (tileKey: string, graceUntil: number) => void;
  tileHasActiveFortPatrolGrace: (tileKey: string, nowMs: number) => boolean;
  runtimeLogInfo: (payload: Record<string, unknown>, message: string) => void;
  handleFrontierCommand: (command: CommandEnvelope, actionType: FrontierCommandType) => boolean;
  emitEvent: (event: SimulationEvent) => void;
};

export const tickTerritoryAutomation = (input: TickTerritoryAutomationInput): void => {
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
      const fortRadius = fortAutoFrontierRadiusForTile(anchor, playerId, input.nowMs);
      const radius = fortRadius > 0
        ? fortRadius
        : isSettledTownAnchor(anchor, playerId)
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
        input.extendFortPatrolGrace(targetKey, input.nowMs + FORT_PATROL_GRACE_MS);
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
  }

  const _ttaAfterClaim = Date.now();
  input.updateFrontierDecay(input.nowMs);
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
    }
  }

  const siegeStats = tickTerritorySiegeAndSweeps(input);
  const _ttaEnd = Date.now();
  const totalMs = _ttaEnd - _ttaStart;
  if (totalMs >= 100) {
    input.runtimeLogInfo(
      {
        totalMs,
        claimLoopMs: _ttaAfterClaim - _ttaStart,
        updateFrontierDecayMs: _ttaAfterDecay - _ttaAfterClaim,
        settleAndSiegeMs: _ttaEnd - _ttaAfterDecay,
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
        },
        siege: siegeStats
      },
      "[tick_territory_automation] phase breakdown"
    );
  }
};

type SiegeStats = {
  attackLoopMs: number;
  outpostSweepMs: number;
  lightSweepMs: number;
  handleFrontierCommandMs: number;
  attacksIssued: number;
  outpostSweepsTicked: number;
  lightSweepsTicked: number;
};

const tickTerritorySiegeAndSweeps = (input: TickTerritoryAutomationInput): SiegeStats => {
  const stats: SiegeStats = {
    attackLoopMs: 0,
    handleFrontierCommandMs: 0,
    outpostSweepMs: 0,
    lightSweepMs: 0,
    attacksIssued: 0,
    outpostSweepsTicked: 0,
    lightSweepsTicked: 0
  };

  for (const playerId of input.players.keys()) {
    if (playerId.startsWith("barbarian-")) continue;
    const actor = input.players.get(playerId);
    if (!actor) continue;
    input.applyManpowerRegen(actor, input.nowMs);
    let availableSiegeManpower = actor.manpower;
    let availableSiegeGold = actor.points;
    if (availableSiegeManpower < ATTACK_MANPOWER_MIN || availableSiegeGold < FRONTIER_CLAIM_COST) continue;
    input.summaryForPlayer(playerId);

    const _tAttackLoop = Date.now();
    const fortAnchors = input.activeFortAnchorsByOwner.get(playerId);
    for (const tileKey of (fortAnchors ? fortAnchors.keys() : [])) {
      const fortTile = input.tiles.get(tileKey);
      const fortRadius = fortTile ? fortAutoFrontierRadiusForTile(fortTile, playerId, input.nowMs) : 0;
      if (!fortTile || fortRadius <= 0) continue;
      if (availableSiegeManpower < ATTACK_MANPOWER_MIN || availableSiegeGold < FRONTIER_CLAIM_COST) break;
      if (input.locksByTile.has(tileKey)) continue;
      const target = input.playerCandidateIndex.sortedFortAttackCandidates(tileKey, FORT_AUTO_FRONTIER_RADIUS)
        .find((candidate) => {
          const targetKey = simulationTileKey(candidate.x, candidate.y);
          return (
            !input.locksByTile.has(targetKey) &&
            !actor.allies.has(candidate.ownerId ?? "") &&
            !input.tileHasActiveFortPatrolGrace(targetKey, input.nowMs)
          );
        });
      if (!target) continue;
      const commandId = input.nextTerritoryAutomationCommandId("fort", playerId, simulationTileKey(target.x, target.y), input.nowMs);
      const _tHandleCmd = Date.now();
      input.handleFrontierCommand(
        {
          commandId,
          sessionId: `system-runtime:territory-automation:${playerId}`,
          playerId,
          clientSeq: 0,
          issuedAt: input.nowMs,
          type: "ATTACK",
          payloadJson: JSON.stringify({ fromX: fortTile.x, fromY: fortTile.y, toX: target.x, toY: target.y })
        },
        "ATTACK"
      );
      stats.handleFrontierCommandMs += Date.now() - _tHandleCmd;
      availableSiegeManpower -= ATTACK_MANPOWER_COST;
      availableSiegeGold -= FRONTIER_CLAIM_COST;
      stats.attacksIssued++;
    }
    stats.attackLoopMs += Date.now() - _tAttackLoop;

    const _tOutpostSweep = Date.now();
    if (!MUSTER_SYSTEM_ENABLED) {
      for (const tileKey of (input.activeSiegeOutpostsByOwner.get(playerId) ?? [])) {
        const outpostTile = input.tiles.get(tileKey);
        if (!outpostTile || outpostTile.siegeOutpost?.ownerId !== playerId || outpostTile.siegeOutpost.status !== "active") continue;
        const outpostData = outpostTile.siegeOutpost;
        const variant = outpostData.variant ?? "SIEGE_OUTPOST";
        tickSweepStructure(
          input,
          {
            tileKey,
            tile: outpostTile,
            sweepBudget: outpostData.sweepBudget,
            sweepActive: outpostData.sweepActive,
            sweepBudgetUpdatedAt: outpostData.sweepBudgetUpdatedAt,
            sweepRadius: SWEEP_RADIUS_BY_VARIANT[variant] ?? 5,
            commandIdPrefix: "sweep",
            applyUpdate: (fields) => ({ ...outpostTile, siegeOutpost: { ...outpostData, ...fields } })
          },
          playerId,
          actor,
          input.nowMs
        );
        stats.outpostSweepsTicked++;
      }
    }
    stats.outpostSweepMs += Date.now() - _tOutpostSweep;

    const _tLightSweep = Date.now();
    if (!MUSTER_SYSTEM_ENABLED) {
      for (const tileKey of (input.activeLightOutpostsByOwner.get(playerId) ?? [])) {
        const outpostTile = input.tiles.get(tileKey);
        if (
          !outpostTile ||
          outpostTile.economicStructure?.ownerId !== playerId ||
          outpostTile.economicStructure.type !== "LIGHT_OUTPOST" ||
          outpostTile.economicStructure.status !== "active"
        ) {
          continue;
        }
        const econData = outpostTile.economicStructure;
        tickSweepStructure(
          input,
          {
            tileKey,
            tile: outpostTile,
            sweepBudget: econData.sweepBudget,
            sweepActive: econData.sweepActive,
            sweepBudgetUpdatedAt: econData.sweepBudgetUpdatedAt,
            sweepRadius: SWEEP_RADIUS_BY_VARIANT["LIGHT_OUTPOST"],
            commandIdPrefix: "lo-sweep",
            applyUpdate: (fields) => ({ ...outpostTile, economicStructure: { ...econData, ...fields } })
          },
          playerId,
          actor,
          input.nowMs
        );
        stats.lightSweepsTicked++;
      }
    }
    stats.lightSweepMs += Date.now() - _tLightSweep;
  }
  return stats;
};
