import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainTileState, FrontierCommandType } from "@border-empires/game-domain";
import {
  validateFrontierCommand
} from "@border-empires/game-domain";
import {
  FOREST_FRONTIER_CLAIM_MULT,
  FRONTIER_CLAIM_COST,
  FRONTIER_CLAIM_MS,
  HILLS_FRONTIER_CLAIM_PENALTY_MS,
  MUSTER_ATTACK_COST,
  grassShadeAt,
  isHillsTileAt,
  landBiomeAt,
  terrainAt
} from "@border-empires/shared";
import { isFrontierAdjacent } from "./frontier-adjacency/frontier-adjacency.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import { parseFrontierPayload } from "./runtime-command-parsers.js";
import { isAlliedOrTruced } from "./runtime-player-factory.js";
import { lockSourceFromSessionId } from "./runtime-types.js";
import type { LockRecord, LockedCombatResolution, RuntimePlayer } from "./runtime-types.js";
import type { LockedCombatInput } from "./runtime-combat-support.js";
import { additiveEffectForPlayer } from "./tech-domain-bridge/tech-domain-bridge.js";

// Floor so a stacked attackResolveSpeedReduceMs effect (e.g. Steam Vanguard)
// can never make an ATTACK resolve instantly or negatively.
const MIN_ATTACK_RESOLVE_MS = 5_000;

export type MusterSourceResult = { sourceKey: string; available: number };

/**
 * Total EXPAND claim duration for a target tile — forest multiplies it by
 * FOREST_FRONTIER_CLAIM_MULT, hills add a flat penalty (both currently 1.5x
 * the base). Pure function of terrain, so both the lock-creation
 * path (below) and the rush-buy handler (runtime-rush-buy-command.ts) can
 * independently recompute the exact same value from a tile's coordinates
 * rather than needing to store it on LockRecord.
 */
export const frontierClaimDurationMsForCoords = (x: number, y: number): number => {
  const isForestTarget = terrainAt(x, y) === "LAND" && landBiomeAt(x, y) === "GRASS" && grassShadeAt(x, y) === "DARK";
  return (
    (isForestTarget ? FRONTIER_CLAIM_MS * FOREST_FRONTIER_CLAIM_MULT : FRONTIER_CLAIM_MS) +
    (isHillsTileAt(x, y) ? HILLS_FRONTIER_CLAIM_PENALTY_MS : 0)
  );
};

export type RuntimeFrontierCommandContext = {
  now: () => number;
  players: Map<string, RuntimePlayer>;
  tiles: Map<string, DomainTileState>;
  locksByTile: Map<string, LockRecord>;
  locksByCommandId: Map<string, LockRecord>;
  musterReservedByKey: Map<string, number>;
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
  rejectCommand: (command: CommandEnvelope, code: string, message: string) => void;
  applyManpowerRegen: (player: RuntimePlayer) => void;
  emitEvent: (event: SimulationEvent) => void;
  commandTrace: ((sample: Record<string, unknown>) => void) | undefined;
  onMusterRemoteBlocked: (() => void) | undefined;
  onMusterRemoteAttack: (() => void) | undefined;
  onMusterRemoteBlockedBarbarian: (() => void) | undefined;
  scheduleLockResolution: (lock: LockRecord) => void;
  adjacentTileStates: (x: number, y: number) => DomainTileState[];
  findOwnedDockOriginForCrossing: (playerId: string, x: number, y: number) => DomainTileState | undefined;
  findOwnedAetherBridgeOriginForCrossing: (playerId: string, x: number, y: number) => DomainTileState | undefined;
  isDockCrossingTarget: (from: DomainTileState, x: number, y: number) => boolean;
  isAetherBridgeCrossingTarget: (playerId: string, x1: number, y1: number, x2: number, y2: number) => boolean;
  crossingBlockedByAetherWall: (x1: number, y1: number, x2: number, y2: number) => boolean;
  // Emperor-endorsement bonus (galaxy meta-layer Phase 1): true while the
  // tile's owner has an active Imperial Ward — blocks ATTACK-lock creation
  // outright (full invulnerability), unlike Aegis Lock's resolution-time
  // "attack always loses" mechanism.
  isTileWardedByImperialWard: (targetOwnerId: string | undefined) => boolean;
  resolveMusterSource: (playerId: string, originKey: string, required: number, preferred?: string) => MusterSourceResult | undefined;
  requiredMusterForTarget: (target: DomainTileState) => number;
  buildLockedCombatResolution: (lock: LockedCombatInput) => LockedCombatResolution | undefined;
  // Fixed-border reach (packages/shared/src/reach/reach.ts): true if (x, y)
  // is inside playerId's resolved reach set. EXPAND requires this; ATTACK
  // deliberately does not consult it.
  isInReach: (playerId: string, x: number, y: number) => boolean;
};

export const handleFrontierCommandImpl = (
  ctx: RuntimeFrontierCommandContext,
  command: CommandEnvelope,
  actionType: FrontierCommandType
): boolean => {
  const actor = ctx.players.get(command.playerId);
  const payload = parseFrontierPayload(command.payloadJson);
  if (!actor || !payload) { ctx.rejectCommand(command, "BAD_COMMAND", "invalid command payload"); return false; }
  ctx.applyManpowerRegen(actor);

  const submittedFrom = ctx.tiles.get(simulationTileKey(payload.fromX, payload.fromY));
  const to = ctx.tiles.get(simulationTileKey(payload.toX, payload.toY));
  if (!submittedFrom || !to) { ctx.rejectCommand(command, "UNKNOWN_TILE", "origin or target tile not found"); return false; }

  const from =
    submittedFrom.ownerId === actor.id
      ? submittedFrom
      : ctx.adjacentTileStates(to.x, to.y).find((candidate) => candidate.ownerId === actor.id && candidate.terrain === "LAND") ??
        ctx.findOwnedDockOriginForCrossing(actor.id, to.x, to.y) ??
        ctx.findOwnedAetherBridgeOriginForCrossing(actor.id, to.x, to.y) ??
        submittedFrom;

  const originLock = ctx.locksByTile.get(simulationTileKey(from.x, from.y));
  const targetLock = ctx.locksByTile.get(simulationTileKey(to.x, to.y));
  ctx.commandTrace?.({
    phase: "frontier_validate",
    commandId: command.commandId,
    playerId: command.playerId,
    actionType,
    submittedOrigin: { x: payload.fromX, y: payload.fromY },
    resolvedOrigin: { x: from.x, y: from.y },
    target: { x: to.x, y: to.y },
    originLockOwnerId: originLock?.playerId,
    originLockResolvesAt: originLock?.resolvesAt,
    targetLockOwnerId: targetLock?.playerId,
    targetLockResolvesAt: targetLock?.resolvesAt
  });
  if (
    (actionType === "ATTACK" || actionType === "EXPAND") &&
    from.ownershipState === "FRONTIER" &&
    from.frontierDecayKind === "ENCIRCLEMENT"
  ) {
    ctx.rejectCommand(command, "ORIGIN_CUT_OFF", "origin tile is cut off from supply and cannot launch actions");
    return false;
  }

  const isDockCrossing = ctx.isDockCrossingTarget(from, to.x, to.y);
  const expandClaimDurationMs = actionType === "EXPAND" ? frontierClaimDurationMsForCoords(to.x, to.y) : undefined;
  const requiredMuster = actionType === "ATTACK"
    ? ctx.requiredMusterForTarget(to)
    : undefined;
  const advancePreferredKey =
    payload.musterSourceX != null && payload.musterSourceY != null
      ? simulationTileKey(payload.musterSourceX, payload.musterSourceY)
      : undefined;
  const musterSource = actionType === "ATTACK" && !(to.ownerId === "barbarian-1" && !advancePreferredKey) && actor.id !== "barbarian-1"
    ? ctx.resolveMusterSource(actor.id, simulationTileKey(from.x, from.y), requiredMuster ?? MUSTER_ATTACK_COST, advancePreferredKey)
    : undefined;
  const validation = validateFrontierCommand({
    now: ctx.now(),
    actor,
    actionType,
    from,
    to,
    originLockedUntil: originLock?.resolvesAt,
    originLockOwnerId: originLock?.playerId,
    targetLockedUntil: targetLock?.resolvesAt,
    targetLockOwnerId: targetLock?.playerId,
    actionGoldCost: actor.id === "barbarian-1" ? 0 : FRONTIER_CLAIM_COST,
    isAdjacent: isFrontierAdjacent(from.x, from.y, to.x, to.y) ||
      (ctx.dockLinksByDockTileKey.get(simulationTileKey(from.x, from.y)) ?? [])
        .includes(simulationTileKey(to.x, to.y)),
    isDockCrossing,
    isBridgeCrossing: ctx.isAetherBridgeCrossingTarget(actor.id, from.x, from.y, to.x, to.y),
    targetShielded:
      (isDockCrossing ? false : ctx.crossingBlockedByAetherWall(from.x, from.y, to.x, to.y)) ||
      ctx.isTileWardedByImperialWard(to.ownerId),
    defenderIsAlliedOrTruced: Boolean(to.ownerId && isAlliedOrTruced(actor, to.ownerId)),
    expandClaimDurationMs,
    originMuster: musterSource?.available ?? (from.muster?.ownerId === actor.id ? from.muster.amount : 0),
    requiredMuster,
    isInReach: ctx.isInReach(actor.id, to.x, to.y)
  });

  if (!validation.ok) {
    if (validation.code === "INSUFFICIENT_MUSTER" && actionType === "ATTACK") {
      ctx.onMusterRemoteBlocked?.();
      if (actor.id.startsWith("barbarian-") && !to.ownerId?.startsWith("barbarian-")) {
        ctx.onMusterRemoteBlockedBarbarian?.();
      }
    }
    ctx.commandTrace?.({
      phase: "frontier_reject",
      commandId: command.commandId,
      playerId: command.playerId,
      actionType,
      code: validation.code,
      message: validation.message,
      cooldownRemainingMs: "cooldownRemainingMs" in validation ? validation.cooldownRemainingMs : undefined,
      originLockOwnerId: originLock?.playerId,
      originLockResolvesAt: originLock?.resolvesAt,
      targetLockOwnerId: targetLock?.playerId,
      targetLockResolvesAt: targetLock?.resolvesAt
    });
    ctx.rejectCommand(command, validation.code, validation.message);
    return false;
  }

  const resolvedOriginKey = simulationTileKey(validation.origin.x, validation.origin.y);
  const effectiveMusterSourceKey = musterSource?.sourceKey ?? resolvedOriginKey;
  // Steam Vanguard's attackResolveSpeedReduceMs shaves time off an ATTACK's
  // resolution lock (30s base, per COMBAT_LOCK_MS) — floored so it can never
  // resolve instantly. Does not apply to EXPAND's claim timer.
  const resolvesAt = actionType === "ATTACK"
    ? Math.max(
        ctx.now() + MIN_ATTACK_RESOLVE_MS,
        validation.resolvesAt - additiveEffectForPlayer(actor, "attackResolveSpeedReduceMs")
      )
    : validation.resolvesAt;
  const baseLock: LockRecord = {
    commandId: command.commandId,
    playerId: command.playerId,
    actionType,
    manpowerCost: validation.manpowerCost,
    originX: validation.origin.x,
    originY: validation.origin.y,
    targetX: validation.target.x,
    targetY: validation.target.y,
    originKey: resolvedOriginKey,
    targetKey: simulationTileKey(validation.target.x, validation.target.y),
    resolvesAt,
    source: lockSourceFromSessionId(command.sessionId),
    ...(actionType === "ATTACK" && actor.id !== "barbarian-1" ? { musterSourceKey: effectiveMusterSourceKey } : {})
  };
  if (baseLock.musterSourceKey && actionType === "ATTACK") {
    const prev = ctx.musterReservedByKey.get(baseLock.musterSourceKey) ?? 0;
    ctx.musterReservedByKey.set(baseLock.musterSourceKey, prev + validation.manpowerCost);
    if (musterSource && baseLock.musterSourceKey !== resolvedOriginKey) {
      ctx.onMusterRemoteAttack?.();
    }
  }
  const combatResolution = actionType === "EXPAND" ? undefined : ctx.buildLockedCombatResolution(baseLock);
  const lock: LockRecord = {
    ...baseLock,
    ...(combatResolution ? { combatResolution } : {})
  };
  ctx.locksByTile.set(lock.originKey, lock);
  ctx.locksByTile.set(lock.targetKey, lock);
  ctx.locksByCommandId.set(lock.commandId, lock);
  ctx.commandTrace?.({
    phase: "frontier_accept",
    commandId: command.commandId,
    playerId: command.playerId,
    actionType,
    origin: { x: lock.originX, y: lock.originY },
    target: { x: lock.targetX, y: lock.targetY },
    resolvesAt: lock.resolvesAt
  });
  ctx.emitEvent({
    eventType: "COMMAND_ACCEPTED",
    commandId: command.commandId,
    playerId: command.playerId,
    actionType,
    originX: validation.origin.x,
    originY: validation.origin.y,
    targetX: validation.target.x,
    targetY: validation.target.y,
    resolvesAt,
    ...(combatResolution ? { combatResult: combatResolution.result } : {})
  });
  const defenderOwnerId = combatResolution?.result.defenderOwnerId;
  if (
    actionType === "ATTACK" &&
    defenderOwnerId &&
    defenderOwnerId !== command.playerId
  ) {
    ctx.emitEvent({
      eventType: "PLAYER_MESSAGE",
      commandId: command.commandId,
      playerId: defenderOwnerId,
      messageType: "ATTACK_ALERT",
      payloadJson: JSON.stringify({
        type: "ATTACK_ALERT",
        attackerId: command.playerId,
        attackerName: actor.name ?? command.playerId,
        x: validation.target.x,
        y: validation.target.y,
        fromX: validation.origin.x,
        fromY: validation.origin.y,
        resolvesAt
      })
    });
  }
  ctx.scheduleLockResolution(lock);
  return true;
};
