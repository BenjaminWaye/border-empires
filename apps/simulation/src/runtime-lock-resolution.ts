import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import {
  FRONTIER_CLAIM_COST,
  MUSTER_SYSTEM_ENABLED
} from "@border-empires/shared";
import { capturedStructureFields } from "./capture-structures/capture-structures.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import { capturedTownAftermath } from "./runtime-capture-aftermath.js";
import { isAiControlledActor } from "./runtime-player-factory.js";
import { applyResourceTileSteal, type RuntimeResourceStealContext } from "./runtime-resource-steal.js";
import { FORT_PATROL_GRACE_MS } from "./territory-automation/territory-automation.js";
import type { LockRecord, LockedCombatResolution, SimulationTileWireDelta } from "./runtime-types.js";

export type RuntimeLockResolutionContext = {
  players: Map<string, DomainPlayer>;
  tiles: Map<string, DomainTileState>;
  locksByTile: Map<string, LockRecord>;
  locksByCommandId: Map<string, LockRecord>;
  musterReservedByKey: Map<string, number>;
  barbarianTileProgress: Map<string, number>;
  now: () => number;
  emitEvent: (event: SimulationEvent) => void;
  emitPlayerStateUpdate: (command: { commandId: string; playerId: string }) => void;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  buildCaptureRevealTileDeltas: (playerId: string, centerX: number, centerY: number) => SimulationTileWireDelta[];
  buildLockedCombatResolution: (lock: LockRecord) => LockedCombatResolution | undefined;
  isTileShieldedByAegisLock: (actorId: string, targetX: number, targetY: number) => boolean;
  consumeOriginMuster: (originKey: string, playerId: string, amount: number) => void;
  applyFortGarrisonAttrition: (targetKey: string, attackingForce: number) => void;
  applyLockedManpowerDelta: (player: DomainPlayer, manpowerDelta: number) => number;
  applySettledCapturePlunder: (input: { attacker: DomainPlayer; defender: DomainPlayer; gold: number; defenderGoldLoss: number }) => void;
  playerManpowerCap: (player: DomainPlayer) => number;
  extendFortPatrolGrace: (tileKey: string, graceUntil: number) => void;
  clearFortPatrolGrace: (tileKey: string) => void;
  onCaptureRevealBuilt: ((sample: { commandId: string; playerId: string; tileCount: number; durationMs: number }) => void) | undefined;
  applyBarbarianWalkOrMultiply: (lock: LockRecord, previousTarget: DomainTileState | undefined) => void;
  applyEncirclement: (changedKeys: string[], playerId: string, commandId: string, options?: { bfsCap?: number; skipCutOff?: boolean }) => void;
  applyEncirclementForExpand: (targetKey: string, playerId: string, commandId: string, options?: { bfsCap?: number }) => void;
  relocateSettlementForPlayer: (playerId: string, commandId: string, population: number) => boolean;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  respawnPlayerOnUnownedLand: (playerId: string, commandId: string) => boolean;
  respawnIfEliminated: (playerId: string, commandId: string) => void;
  ensureGrossIncomeSettlementForPlayer: (playerId: string, commandId: string) => boolean;
  applyBreachToNeighbors?: ((capturedTile: DomainTileState, attackerId: string) => DomainTileState[]) | undefined;
};

export function releaseMusterReservation(context: RuntimeLockResolutionContext, lock: LockRecord): void {
  if (!lock.musterSourceKey) return;
  const prev = context.musterReservedByKey.get(lock.musterSourceKey) ?? 0;
  const next = Math.max(0, prev - lock.manpowerCost);
  if (next === 0) context.musterReservedByKey.delete(lock.musterSourceKey);
  else context.musterReservedByKey.set(lock.musterSourceKey, next);
}

export function resolveLock(context: RuntimeLockResolutionContext, lock: LockRecord): void {
  releaseMusterReservation(context, lock);
  const originLock = context.locksByTile.get(lock.originKey);
  const targetLock = context.locksByTile.get(lock.targetKey);
  const originMatches = originLock?.commandId === lock.commandId;
  const targetMatches = targetLock?.commandId === lock.commandId;
  if (originMatches) context.locksByTile.delete(lock.originKey);
  if (targetMatches) context.locksByTile.delete(lock.targetKey);
  context.locksByCommandId.delete(lock.commandId);
  if (!originMatches || !targetMatches) return;

  const previousTarget = context.tiles.get(lock.targetKey);
  const previousOwnerId = previousTarget?.ownerId;
  const targetWasSettled = previousTarget?.ownershipState === "SETTLED";
  const combatResolution = lock.combatResolution ?? context.buildLockedCombatResolution(lock);
  const combatResult = combatResolution?.result;
  const attacker = context.players.get(lock.playerId);
  const defender = previousOwnerId ? context.players.get(previousOwnerId) : undefined;
  const blockedByAegisLock =
    lock.actionType === "ATTACK" &&
    Boolean(previousOwnerId) &&
    previousOwnerId !== lock.playerId &&
    context.isTileShieldedByAegisLock(lock.playerId, lock.targetX, lock.targetY);
  const attackerWon = blockedByAegisLock ? false : combatResult?.attackerWon ?? false;
  const originLost = Boolean(combatResult?.changes.some((change) => change.x === lock.originX && change.y === lock.originY));

  if (attacker && (lock.actionType === "EXPAND" || lock.actionType === "ATTACK")) {
    attacker.points = Math.max(0, attacker.points - FRONTIER_CLAIM_COST);
  }
  context.emitEvent({
    eventType: "COMBAT_RESOLVED",
    commandId: lock.commandId,
    playerId: lock.playerId,
    actionType: lock.actionType,
    originX: lock.originX,
    originY: lock.originY,
    targetX: lock.targetX,
    targetY: lock.targetY,
    attackerWon,
    ...(typeof combatResult?.manpowerDelta === "number" && combatResult.manpowerDelta < -0.01 ? { manpowerDelta: combatResult.manpowerDelta } : {}),
    ...(typeof combatResult?.pillagedGold === "number" && combatResult.pillagedGold > 0.01 ? { pillagedGold: combatResult.pillagedGold } : {}),
    ...(combatResult?.pillagedStrategic && Object.keys(combatResult.pillagedStrategic).length > 0 ? { pillagedStrategic: combatResult.pillagedStrategic } : {}),
    ...(combatResult ? { combatResult } : {})
  });

  if (attacker && typeof combatResult?.manpowerDelta === "number") {
    if (MUSTER_SYSTEM_ENABLED && lock.actionType === "ATTACK") {
      const isBarbRaid = previousTarget?.ownerId === "barbarian-1";
      if (lock.playerId === "barbarian-1") {
        // Barbarian-origin attacks are rate-limited by tile cooldown, not manpower.
      } else if (isBarbRaid) {
        // Advance-mode barbarian raids drain the muster flag pool. Manual
        // raids without a flag fall back to the player's global pool.
        const sourceKey = lock.musterSourceKey ?? lock.originKey;
        const sourceTile = context.tiles.get(sourceKey);
        if (sourceTile?.muster?.ownerId === lock.playerId) {
          context.consumeOriginMuster(sourceKey, lock.playerId, lock.manpowerCost);
        } else {
          attacker.manpower = Math.max(0, attacker.manpower - lock.manpowerCost);
        }
      } else {
        context.consumeOriginMuster(lock.musterSourceKey ?? lock.originKey, lock.playerId, lock.manpowerCost);
        if (!attackerWon) context.applyFortGarrisonAttrition(lock.targetKey, lock.manpowerCost);
      }
    } else {
      context.applyLockedManpowerDelta(attacker, combatResult.manpowerDelta);
    }
  }
  if (attackerWon && attacker && defender && targetWasSettled && combatResolution) {
    context.applySettledCapturePlunder({
      attacker,
      defender,
      gold: combatResolution.result.pillagedGold,
      defenderGoldLoss: combatResolution.defenderGoldLoss
    });
  }
  if (attackerWon && attacker && defender && previousTarget?.resource && !combatResolution?.targetRecentlyPillaged && previousOwnerId && previousOwnerId !== lock.playerId) {
    applyResourceTileSteal(context, attacker, defender, previousTarget.resource, previousTarget.economicStructure?.type);
  }

  let settlementRelocationPopulation: number | undefined;
  if (attackerWon) {
    const townAftermath = capturedTownAftermath(previousTarget?.town, previousOwnerId, lock.playerId, context.now());
    settlementRelocationPopulation = townAftermath.settlementRelocationPopulation;
    const resolvedTarget: DomainTileState = {
      x: lock.targetX,
      y: lock.targetY,
      terrain: previousTarget?.terrain ?? "LAND",
      ...(previousTarget?.resource ? { resource: previousTarget.resource } : {}),
      ...(previousTarget?.dockId ? { dockId: previousTarget.dockId } : {}),
      ...(previousTarget?.shardSite ? { shardSite: previousTarget.shardSite } : {}),
      ...(townAftermath.town ? { town: townAftermath.town } : {}),
      ...capturedStructureFields(previousTarget, lock.playerId),
      ownerId: lock.playerId,
      ownershipState: lock.playerId === "barbarian-1" ? "SETTLED" : "FRONTIER"
    };
    const hadMuster = Boolean(previousTarget?.muster);
    if (previousTarget?.muster?.ownerId && previousTarget.muster.amount > 0) {
      const musterOwner = context.players.get(previousTarget.muster.ownerId);
      if (musterOwner) {
        musterOwner.manpower = Math.min(context.playerManpowerCap(musterOwner), musterOwner.manpower + previousTarget.muster.amount);
      }
    }
    context.replaceTileState(lock.targetKey, resolvedTarget, lock.commandId);
    if (resolvedTarget.ownershipState === "FRONTIER") context.extendFortPatrolGrace(lock.targetKey, context.now() + FORT_PATROL_GRACE_MS);
    else context.clearFortPatrolGrace(lock.targetKey);

    let tileDeltas: SimulationTileWireDelta[];
    // Only human captors get the vision-radius capture-reveal square; AI-
    // controlled actors (autopilot "ai-<n>" AND the barbarian faction) have no
    // WS subscriber, so building/broadcasting an (2r+1)² reveal block for them
    // is pure waste. Barbarians roam neutral wilderness, so that block is dozens
    // of ownerId:null deltas that the broadcast path forwards to every human as
    // ownership-clears (visibility filter's includeOwnershipClears), flooding
    // clients with mid-map neutral tiles on every barbarian capture. Keying off
    // isAiControlledActor rather than attacker.isAi is load-bearing: barbarians
    // carry isAi:false by design (see runtime-player-factory.ts).
    //
    // EXPAND also skips the full scan: the target tile is always adjacent to
    // territory the player already had vision over, so a (2r+1)² reveal scan
    // finds nothing new — it was only ever paying for redundant re-sends of
    // already-revealed tiles. With observatory/tech vision-radius bonuses this
    // scan can hit 400+ tiles per single-tile EXPAND, which synchronously
    // blocks the sim's event loop for 150-800ms+ and has caused gateway submit
    // timeouts (SIMULATION_UNAVAILABLE) during rapid-fire expand chains. ATTACK
    // keeps the full reveal: capturing deep enemy territory can genuinely
    // expose tiles outside the player's prior vision.
    if (isAiControlledActor(lock.playerId, attacker?.isAi) || lock.actionType === "EXPAND") {
      tileDeltas = [context.tileDeltaFromState(resolvedTarget)];
    } else {
      const measure = Boolean(context.onCaptureRevealBuilt);
      const startedAt = measure ? context.now() : 0;
      tileDeltas = context.buildCaptureRevealTileDeltas(lock.playerId, lock.targetX, lock.targetY);
      if (measure) {
        context.onCaptureRevealBuilt?.({
          commandId: lock.commandId,
          playerId: lock.playerId,
          tileCount: tileDeltas.length,
          durationMs: Math.max(0, context.now() - startedAt)
        });
      }
    }
    context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: lock.commandId, playerId: lock.playerId, tileDeltas });
    const breachedTiles = context.applyBreachToNeighbors?.(resolvedTarget, lock.playerId);
    if (breachedTiles && breachedTiles.length > 0) {
      context.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: `breach:${lock.targetKey}:${context.now()}`,
        playerId: "__broadcast__",
        tileDeltas: breachedTiles.map((t) => context.tileDeltaFromState(t))
      });
    }
    if (hadMuster) {
      context.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: `${lock.commandId}:bc`,
        playerId: "__broadcast__",
        tileDeltas: [{ x: resolvedTarget.x, y: resolvedTarget.y, ownerId: resolvedTarget.ownerId, ownershipState: resolvedTarget.ownershipState, musterJson: "" }]
      });
    }
    if (lock.playerId === "barbarian-1") context.applyBarbarianWalkOrMultiply(lock, previousTarget);
    else if (previousTarget?.ownerId === "barbarian-1") context.barbarianTileProgress.delete(lock.targetKey);
  } else if (originLost && previousOwnerId) {
    resolveLostOrigin(context, lock, previousOwnerId);
  }

  applyCombatEncirclement(context, lock, attackerWon, originLost, previousOwnerId);
  // Skip emitPlayerStateUpdate for AI-only resolutions — AI players have no
  // WS subscribers, so the PLAYER_UPDATE (defensibility rebuild + economy
  // snapshot + JSON.stringify + SQLite enqueue) is pure wasted work.
  // Human defenders still get their update even when attacked by an AI.
  if (attacker && !attacker.isAi) context.emitPlayerStateUpdate({ commandId: lock.commandId, playerId: attacker.id });
  if (originLost && defender && !defender.isAi) context.emitPlayerStateUpdate({ commandId: lock.commandId, playerId: defender.id });
  if (originLost) context.respawnIfEliminated(lock.playerId, lock.commandId);
  if (attackerWon && previousOwnerId && previousOwnerId !== lock.playerId) {
    if (settlementRelocationPopulation !== undefined) {
      const relocated = context.relocateSettlementForPlayer(previousOwnerId, lock.commandId, settlementRelocationPopulation);
      if (!relocated && context.summaryForPlayer(previousOwnerId).territoryTileKeys.size > 0) {
        context.respawnPlayerOnUnownedLand(previousOwnerId, lock.commandId);
      }
    }
    context.respawnIfEliminated(previousOwnerId, lock.commandId);
    context.ensureGrossIncomeSettlementForPlayer(previousOwnerId, lock.commandId);
    if (!defender?.isAi) context.emitPlayerStateUpdate({ commandId: lock.commandId, playerId: previousOwnerId });
  }
}

function resolveLostOrigin(context: RuntimeLockResolutionContext, lock: LockRecord, previousOwnerId: string): void {
  const previousOrigin = context.tiles.get(lock.originKey);
  if (!previousOrigin) return;
  const originOwnershipState = previousOwnerId === "barbarian-1" ? "SETTLED" : "FRONTIER";
  const { muster: _discardMuster, ...strippedOrigin } = previousOrigin;
  const resolvedOrigin: DomainTileState = {
    ...strippedOrigin,
    ownerId: previousOwnerId,
    ownershipState: originOwnershipState,
    frontierDecayAt: undefined,
    frontierDecayKind: undefined,
    ...capturedStructureFields(previousOrigin, previousOwnerId)
  };
  context.replaceTileState(lock.originKey, resolvedOrigin, lock.commandId);
  if (originOwnershipState === "FRONTIER") context.extendFortPatrolGrace(lock.originKey, context.now() + FORT_PATROL_GRACE_MS);
  else context.clearFortPatrolGrace(lock.originKey);
  const tileDeltas = [context.tileDeltaFromState(resolvedOrigin)];

  const hadMuster = Boolean(previousOrigin.muster);
  if (previousOrigin.muster?.ownerId && previousOrigin.muster.amount > 0) {
    const musterOwner = context.players.get(previousOrigin.muster.ownerId);
    if (musterOwner) {
      musterOwner.manpower = Math.min(context.playerManpowerCap(musterOwner), musterOwner.manpower + previousOrigin.muster.amount);
    }
  }

  if (previousOwnerId === "barbarian-1") {
    const defenderTile = context.tiles.get(lock.targetKey);
    if (defenderTile?.ownerId === "barbarian-1" && !context.locksByTile.has(lock.targetKey)) {
      const releasedDefender: DomainTileState = {
        x: defenderTile.x,
        y: defenderTile.y,
        terrain: defenderTile.terrain,
        ...(defenderTile.resource ? { resource: defenderTile.resource } : {}),
        ...(defenderTile.dockId ? { dockId: defenderTile.dockId } : {}),
        ...(defenderTile.town ? { town: defenderTile.town } : {}),
        ...(defenderTile.shardSite ? { shardSite: defenderTile.shardSite } : {}),
        ...(defenderTile.economicStructure ? { economicStructure: defenderTile.economicStructure } : {})
      };
      context.replaceTileState(lock.targetKey, releasedDefender, lock.commandId);
      context.barbarianTileProgress.delete(lock.targetKey);
      tileDeltas.push(context.tileDeltaFromState(releasedDefender));
    }
  }

  context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: lock.commandId, playerId: lock.playerId, tileDeltas });

  if (hadMuster) {
    context.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: `${lock.commandId}:bc`,
      playerId: "__broadcast__",
      tileDeltas: [{ x: previousOrigin.x, y: previousOrigin.y, ownerId: resolvedOrigin.ownerId, ownershipState: resolvedOrigin.ownershipState, musterJson: "" }]
    });
  }
}

function applyCombatEncirclement(
  context: RuntimeLockResolutionContext,
  lock: LockRecord,
  attackerWon: boolean,
  originLost: boolean,
  previousOwnerId: string | undefined
): void {
  if (lock.actionType === "ATTACK") {
    const encirclementChangedKeys: string[] = [];
    if (attackerWon) encirclementChangedKeys.push(lock.targetKey);
    if (originLost) encirclementChangedKeys.push(lock.originKey);
    if (encirclementChangedKeys.length === 0) return;
    const affectedPlayerIds = new Set<string>();
    if (attackerWon && previousOwnerId) affectedPlayerIds.add(previousOwnerId);
    if (attackerWon) affectedPlayerIds.add(lock.playerId);
    if (originLost) affectedPlayerIds.add(lock.playerId);
    if (originLost && previousOwnerId) affectedPlayerIds.add(previousOwnerId);
    for (const pid of affectedPlayerIds) {
      context.applyEncirclement(encirclementChangedKeys, pid, lock.commandId, { bfsCap: 2000 });
    }
  } else if (lock.actionType === "EXPAND" && attackerWon) {
    context.applyEncirclementForExpand(lock.targetKey, lock.playerId, lock.commandId, { bfsCap: 2000 });
  }
}
