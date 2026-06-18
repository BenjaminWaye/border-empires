import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import {
  FRONTIER_CLAIM_COST,
  MUSTER_SYSTEM_ENABLED
} from "@border-empires/shared";
import { capturedStructureFields } from "./capture-structures/capture-structures.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import { SYNTHETIC_SETTLEMENT_POPULATION } from "./runtime-hydration.js";
import {
  TOWN_CAPTURE_POPULATION_LOSS_MULT,
  TOWN_CAPTURE_SHOCK_MS
} from "./runtime-structure-rules/runtime-structure-rules.js";
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
  applyEncirclementForExpand: (targetKey: string, playerId: string, commandId: string) => void;
  relocateSettlementForPlayer: (playerId: string, commandId: string, population: number) => boolean;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  respawnPlayerOnUnownedLand: (playerId: string, commandId: string) => boolean;
  respawnIfEliminated: (playerId: string, commandId: string) => void;
  ensureGrossIncomeSettlementForPlayer: (playerId: string, commandId: string) => boolean;
};

export type RuntimeResourceStealContext = {
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
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
  const attackerWon = combatResult?.attackerWon ?? false;
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
      if (isBarbRaid) {
        attacker.manpower = Math.max(0, attacker.manpower - lock.manpowerCost);
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

  let settlementCaptureRelocationPopulation: number | undefined;
  if (attackerWon) {
    let capturedTown = previousTarget?.town;
    const isSettlementCapture =
      !!capturedTown &&
      capturedTown.populationTier === "SETTLEMENT" &&
      !!previousOwnerId &&
      previousOwnerId !== lock.playerId;
    if (capturedTown && previousOwnerId && previousOwnerId !== lock.playerId) {
      const popBefore = typeof capturedTown.population === "number" ? capturedTown.population : SYNTHETIC_SETTLEMENT_POPULATION;
      const popAfter = Math.max(1, popBefore * TOWN_CAPTURE_POPULATION_LOSS_MULT);
      const captureShockUntil = context.now() + TOWN_CAPTURE_SHOCK_MS;
      if (isSettlementCapture) {
        settlementCaptureRelocationPopulation = popAfter;
        capturedTown = undefined;
      } else {
        capturedTown = { ...capturedTown, population: popAfter, populationBeforeCapture: popBefore, captureShockUntil };
      }
    }
    const resolvedTarget: DomainTileState = {
      x: lock.targetX,
      y: lock.targetY,
      terrain: previousTarget?.terrain ?? "LAND",
      ...(previousTarget?.resource ? { resource: previousTarget.resource } : {}),
      ...(previousTarget?.dockId ? { dockId: previousTarget.dockId } : {}),
      ...(capturedTown ? { town: capturedTown } : {}),
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
    if (attacker?.isAi) {
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
    if (hadMuster) {
      context.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: `${lock.commandId}:bc`,
        playerId: "__broadcast__",
        tileDeltas: [{ x: resolvedTarget.x, y: resolvedTarget.y, musterJson: "" }]
      });
    }
    if (lock.playerId === "barbarian-1") context.applyBarbarianWalkOrMultiply(lock, previousTarget);
    else if (previousTarget?.ownerId === "barbarian-1") context.barbarianTileProgress.delete(lock.targetKey);
  } else if (originLost && previousOwnerId) {
    resolveLostOrigin(context, lock, previousOwnerId);
  }

  applyCombatEncirclement(context, lock, attackerWon, originLost, previousOwnerId);
  if (attacker) context.emitPlayerStateUpdate({ commandId: lock.commandId, playerId: attacker.id });
  if (originLost && defender) context.emitPlayerStateUpdate({ commandId: lock.commandId, playerId: defender.id });
  if (originLost) context.respawnIfEliminated(lock.playerId, lock.commandId);
  if (attackerWon && previousOwnerId && previousOwnerId !== lock.playerId) {
    if (settlementCaptureRelocationPopulation !== undefined) {
      const relocated = context.relocateSettlementForPlayer(previousOwnerId, lock.commandId, settlementCaptureRelocationPopulation);
      if (!relocated && context.summaryForPlayer(previousOwnerId).territoryTileKeys.size > 0) {
        context.respawnPlayerOnUnownedLand(previousOwnerId, lock.commandId);
      }
    }
    context.respawnIfEliminated(previousOwnerId, lock.commandId);
    context.ensureGrossIncomeSettlementForPlayer(previousOwnerId, lock.commandId);
    context.emitPlayerStateUpdate({ commandId: lock.commandId, playerId: previousOwnerId });
  }
}

function resolveLostOrigin(context: RuntimeLockResolutionContext, lock: LockRecord, previousOwnerId: string): void {
  const previousOrigin = context.tiles.get(lock.originKey);
  if (!previousOrigin) return;
  const originOwnershipState = previousOwnerId === "barbarian-1" ? "SETTLED" : "FRONTIER";
  const resolvedOrigin: DomainTileState = {
    ...previousOrigin,
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

  if (previousOwnerId === "barbarian-1") {
    const defenderTile = context.tiles.get(lock.targetKey);
    if (defenderTile?.ownerId === "barbarian-1" && !context.locksByTile.has(lock.targetKey)) {
      const releasedDefender: DomainTileState = {
        x: defenderTile.x,
        y: defenderTile.y,
        terrain: defenderTile.terrain,
        ...(defenderTile.resource ? { resource: defenderTile.resource } : {}),
        ...(defenderTile.dockId ? { dockId: defenderTile.dockId } : {})
      };
      context.replaceTileState(lock.targetKey, releasedDefender, lock.commandId);
      context.barbarianTileProgress.delete(lock.targetKey);
      tileDeltas.push(context.tileDeltaFromState(releasedDefender));
    }
  }

  context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: lock.commandId, playerId: lock.playerId, tileDeltas });
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
    context.applyEncirclementForExpand(lock.targetKey, lock.playerId, lock.commandId);
  }
}

export function applyResourceTileSteal(
  context: RuntimeResourceStealContext,
  attacker: DomainPlayer,
  defender: DomainPlayer,
  tileResource: string | undefined,
  structureType?: string
): void {
  const resourceMap: Record<string, "IRON" | "CRYSTAL" | "SUPPLY" | "FOOD" | "OIL"> = {
    IRON: "IRON",
    GEMS: "CRYSTAL",
    FUR: "SUPPLY",
    WOOD: "SUPPLY",
    FARM: "FOOD",
    FISH: "FOOD",
    OIL: "OIL"
  };
  const synthMap: Record<string, "IRON" | "CRYSTAL" | "SUPPLY"> = {
    IRONWORKS: "IRON",
    ADVANCED_IRONWORKS: "IRON",
    CRYSTAL_SYNTHESIZER: "CRYSTAL",
    ADVANCED_CRYSTAL_SYNTHESIZER: "CRYSTAL",
    FUR_SYNTHESIZER: "SUPPLY",
    ADVANCED_FUR_SYNTHESIZER: "SUPPLY"
  };
  const resource = (tileResource ? resourceMap[tileResource] : undefined)
    ?? (structureType ? synthMap[structureType] : undefined);
  if (!resource) return;

  const defenderBalance = defender.strategicResources?.[resource] ?? 0;
  if (defenderBalance <= 0) return;

  const defenderSummary = context.summaryForPlayer(defender.id);
  const sp = defenderSummary.strategicProductionPerMinute;
  const syn = defenderSummary.synthesizerCapBonus;
  const perTileRateByResource: Record<string, number> = {
    IRON: 60 / 1440,
    CRYSTAL: 36 / 1440,
    SUPPLY: 60 / 1440,
    FOOD: 72 / 1440,
    OIL: 48 / 1440
  };
  const perTileRate = perTileRateByResource[resource] ?? (60 / 1440);
  const synthBonusUnits = (syn[resource as "IRON" | "CRYSTAL" | "SUPPLY"] ?? 0) / 30;
  const tileEquivCount = Math.max(1, Math.round((sp[resource] ?? 0) / perTileRate + synthBonusUnits));
  const stolen = defenderBalance / tileEquivCount;
  if (stolen <= 0.01) return;

  defender.strategicResources = { ...(defender.strategicResources ?? {}), [resource]: Math.max(0, defenderBalance - stolen) };
  attacker.strategicResources = { ...(attacker.strategicResources ?? {}), [resource]: ((attacker.strategicResources?.[resource] ?? 0) + stolen) };
}
