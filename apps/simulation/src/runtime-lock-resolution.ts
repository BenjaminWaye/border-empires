import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { CombatBroadcastPayload, SimulationEvent } from "@border-empires/sim-protocol";
import {
  FRONTIER_CLAIM_COST
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
  // Activates a dormant watchtower (see server-worldgen-watchtowers.ts / the
  // Tile.watchtower feature) the first time a player expands onto its tile:
  // grants that player a one-time 10-second vision pulse over the
  // surrounding area, then reverts to normal fog-of-war. No-op if the tile
  // has no watchtower or it was already activated.
  maybeActivateWatchtower: (targetKey: string, x: number, y: number, playerId: string, commandId: string) => void;
  // Drains a server-durable "claim continuation" (see player-runtime-
  // summary.ts / runtime-claim-continuation-command-handlers.ts) registered
  // for this tile, if any -- i.e. auto-SETTLE (+ auto-BUILD) it now that a
  // winning EXPAND actually landed ownership. No-op if none was registered.
  maybeDrainClaimContinuation: (targetKey: string, x: number, y: number, playerId: string) => void;
  // Out-of-reach decay (see runtime-out-of-reach-decay.ts): returns the decay
  // deadline for a FRONTIER tile this player just took outside their own
  // reach, or undefined if the tile is in reach or sits in an actively
  // contested reach zone (2+ players' live anchors overlap it), which is
  // exempt. Applies to EXPAND and ATTACK alike -- both land ground the player
  // may not be able to hold.
  outOfReachDecayDeadline: (playerId: string, x: number, y: number) => number | undefined;
  registerOutOfReachDecay: (tileKey: string, deadlineAt: number) => void;
  // Out-of-reach auto-settle for a captured/claimed town or dock tile (see
  // runtime.ts's canAutoSettleCapturedAnchor / autoSettleCapturedAnchor).
  // Pure eligibility check first (can the player pay + do they have a free
  // development slot), then the mutating start -- kept separate so the
  // caller can decide whether to stamp a decay timer BEFORE attempting the
  // mutation, never after (no reason to pay a settle cost only to also decay).
  canAutoSettleCapturedAnchor: (playerId: string) => boolean;
  autoSettleCapturedAnchor: (playerId: string, targetKey: string, target: DomainTileState, commandId: string) => void;
  // Server-side waypoint/expand-queue auto-drain (runtime-waypoint-queue-
  // command-handlers.ts) -- called unconditionally once this EXPAND/ATTACK
  // lock is done resolving (win, loss, or stale/superseded), win or lose, so
  // a queued next target keeps advancing while the player is offline. See
  // that module's tryDrainWaypointQueue doc comment.
  tryDrainWaypointQueue: (playerId: string) => void;
  // Territory activity feed for GET /api/activity (see
  // ../territory-flip-log/territory-flip-log.ts) -- called for every tile
  // whose ownerId actually changes, win or lose, real player or neutral/
  // barbarian. No-op cost when unset (tests that don't care about the
  // activity feed can omit it).
  recordTileFlip?: (flip: { tileId: string; x: number; y: number; fromOwner: string | undefined; toOwner: string | undefined; at: number }) => void;
};

export function releaseMusterReservation(context: RuntimeLockResolutionContext, lock: LockRecord): void {
  if (!lock.musterSourceKey) return;
  const prev = context.musterReservedByKey.get(lock.musterSourceKey) ?? 0;
  const next = Math.max(0, prev - lock.manpowerCost);
  if (next === 0) context.musterReservedByKey.delete(lock.musterSourceKey);
  else context.musterReservedByKey.set(lock.musterSourceKey, next);
}

/** Refunds an EXPAND lock's manpower cost, charged up front at lock creation (runtime-frontier-command.ts) -- called from every path that drops the lock before it reaches its own resolution deduction. */
export function refundExpandManpower(context: RuntimeLockResolutionContext, lock: Pick<LockRecord, "playerId" | "manpowerCost">): void {
  const player = context.players.get(lock.playerId);
  if (player) player.manpower = Math.min(context.playerManpowerCap(player), player.manpower + lock.manpowerCost);
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
  if (!originMatches || !targetMatches) {
    // Stale/superseded lock, never reaching the deduction below -- refund the
    // EXPAND manpower charged up front at lock creation (runtime-frontier-
    // command.ts) since this lock is being dropped, not resolved.
    if (lock.actionType === "EXPAND") refundExpandManpower(context, lock);
    if (lock.actionType === "EXPAND" || lock.actionType === "ATTACK") context.tryDrainWaypointQueue(lock.playerId);
    return;
  }

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
  // Two opposing forces actually clashed (not an uncontested EXPAND onto
  // neutral land) — the client's battle overlay FX keys off this payload to
  // decide whether/how to animate the target tile. See simulation.proto's
  // combat_json doc comment for the wire shape.
  const hasDefendingForce = lock.actionType === "ATTACK" && Boolean(previousOwnerId) && previousOwnerId !== lock.playerId;
  const combatBroadcastJson = hasDefendingForce && previousOwnerId
    ? JSON.stringify({
        attackerOwnerId: lock.playerId,
        defenderOwnerId: previousOwnerId,
        attackerWon,
        originX: lock.originX,
        originY: lock.originY,
        at: context.now()
      } satisfies CombatBroadcastPayload)
    : undefined;

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
    if (lock.actionType === "ATTACK") {
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
    }
    // EXPAND's manpower cost (combatResult.manpowerDelta) was already charged
    // up front at lock creation (runtime-frontier-command.ts) -- resolution
    // no longer re-applies it here, only echoes the value in the
    // COMBAT_RESOLVED event above for client display.
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
    // Barbarians resolve to SETTLED (below) and are never reach-gated, so only
    // real players' FRONTIER claims can carry an out-of-reach deadline.
    const outOfReachDecayAt =
      lock.playerId === "barbarian-1"
        ? undefined
        : context.outOfReachDecayDeadline(lock.playerId, lock.targetX, lock.targetY);
    // Towns and docks are the reach anchors themselves -- decaying one away
    // for being out of reach is a dead end (no reach to grow into it with),
    // so a captured/claimed town or dock tries to auto-settle instead of
    // decaying, provided the player can pay the usual settle cost and has a
    // free development slot. If not, it falls back to decaying like any
    // other out-of-reach tile -- see canAutoSettleCapturedAnchor's doc comment.
    const isAnchorStructureTile = Boolean(townAftermath.town) || Boolean(previousTarget?.dockId);
    const willAutoSettle =
      outOfReachDecayAt !== undefined && isAnchorStructureTile && context.canAutoSettleCapturedAnchor(lock.playerId);
    const resolvedTarget: DomainTileState = {
      x: lock.targetX,
      y: lock.targetY,
      terrain: previousTarget?.terrain ?? "LAND",
      ...(previousTarget?.resource ? { resource: previousTarget.resource } : {}),
      ...(previousTarget?.dockId ? { dockId: previousTarget.dockId } : {}),
      ...(previousTarget?.shardSite ? { shardSite: previousTarget.shardSite } : {}),
      ...(previousTarget?.naturalWonder ? { naturalWonder: previousTarget.naturalWonder } : {}),
      ...(previousTarget?.watchtower ? { watchtower: previousTarget.watchtower } : {}),
      ...(townAftermath.town ? { town: townAftermath.town } : {}),
      ...capturedStructureFields(previousTarget, lock.playerId, context.now()),
      ownerId: lock.playerId,
      ownershipState: lock.playerId === "barbarian-1" ? "SETTLED" : "FRONTIER",
      ...(outOfReachDecayAt !== undefined && !willAutoSettle
        ? { frontierDecayAt: outOfReachDecayAt, frontierDecayKind: "OUT_OF_REACH" as const }
        : {})
    };
    // Capturing a tile destroys any muster flag staged on it — the accumulated
    // manpower is lost, not refunded to the previous owner's pool. resolvedTarget
    // never carries `muster` forward (see the object literal above), so the flag
    // itself is already gone; this just drops the pooled manpower with it.
    const hadMuster = Boolean(previousTarget?.muster);
    context.replaceTileState(lock.targetKey, resolvedTarget, lock.commandId);
    if (previousOwnerId !== resolvedTarget.ownerId) {
      context.recordTileFlip?.({
        tileId: lock.targetKey,
        x: lock.targetX,
        y: lock.targetY,
        fromOwner: previousOwnerId,
        toOwner: resolvedTarget.ownerId,
        at: context.now()
      });
    }
    if (willAutoSettle) context.autoSettleCapturedAnchor(lock.playerId, lock.targetKey, resolvedTarget, lock.commandId);
    else if (outOfReachDecayAt !== undefined) context.registerOutOfReachDecay(lock.targetKey, outOfReachDecayAt);
    if (resolvedTarget.ownershipState === "FRONTIER") context.extendFortPatrolGrace(lock.targetKey, context.now() + FORT_PATROL_GRACE_MS);
    else context.clearFortPatrolGrace(lock.targetKey);
    if (lock.actionType === "EXPAND") {
      context.maybeActivateWatchtower(lock.targetKey, lock.targetX, lock.targetY, lock.playerId, lock.commandId);
      if (resolvedTarget.ownershipState === "FRONTIER") {
        context.maybeDrainClaimContinuation(lock.targetKey, lock.targetX, lock.targetY, lock.playerId);
      }
    }

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
    // EXPAND and ATTACK both skip the full scan: both target tiles adjacent
    // to territory the player already had vision over, so a (2r+1)² reveal
    // scan finds nothing new — it was only ever paying for redundant re-sends
    // of already-revealed tiles. With observatory/tech vision-radius bonuses
    // this scan can hit 400+ tiles per single-tile capture, which
    // synchronously blocks the sim's event loop for 150-800ms+ and has caused
    // gateway submit timeouts (SIMULATION_UNAVAILABLE) during rapid-fire
    // expand chains.
    // The previous owner (if this was a real capture, not an EXPAND onto
    // neutral land) just lost this exact tile and needs to see its resolved
    // state — including any muster flag being cleared — even if losing it
    // dropped their fog-of-war coverage in the same instant. See
    // SimulationTileWireDelta.forceVisibleForPlayerId's doc comment.
    const capturedFromPlayerId = previousOwnerId && previousOwnerId !== lock.playerId ? previousOwnerId : undefined;
    if (isAiControlledActor(lock.playerId, attacker?.isAi) || lock.actionType === "EXPAND" || lock.actionType === "ATTACK") {
      tileDeltas = [{
        ...context.tileDeltaFromState(resolvedTarget),
        ...(combatBroadcastJson ? { combatJson: combatBroadcastJson } : {}),
        ...(capturedFromPlayerId ? { forceVisibleForPlayerId: capturedFromPlayerId } : {})
      }];
    } else {
      const measure = Boolean(context.onCaptureRevealBuilt);
      const startedAt = measure ? context.now() : 0;
      tileDeltas = context.buildCaptureRevealTileDeltas(lock.playerId, lock.targetX, lock.targetY);
      if (capturedFromPlayerId) {
        const targetIndex = tileDeltas.findIndex((delta) => delta.x === lock.targetX && delta.y === lock.targetY);
        if (targetIndex >= 0) tileDeltas[targetIndex]!.forceVisibleForPlayerId = capturedFromPlayerId;
      }
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
  } else {
    if (originLost && previousOwnerId) resolveLostOrigin(context, lock, previousOwnerId);
    // Attacker lost and nothing about the target tile itself changed, so no
    // TILE_DELTA_BATCH would otherwise fire for it — emit a combat-only
    // delta so the defender/bystanders still see the battle overlay FX.
    if (hasDefendingForce) {
      context.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: `${lock.commandId}:combat`,
        playerId: lock.playerId,
        tileDeltas: [{ x: lock.targetX, y: lock.targetY, combatJson: combatBroadcastJson }]
      });
    }
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
  if (lock.actionType === "EXPAND" || lock.actionType === "ATTACK") context.tryDrainWaypointQueue(lock.playerId);
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
    ...capturedStructureFields(previousOrigin, previousOwnerId, context.now())
  };
  context.replaceTileState(lock.originKey, resolvedOrigin, lock.commandId);
  if (previousOrigin.ownerId !== resolvedOrigin.ownerId) {
    context.recordTileFlip?.({
      tileId: lock.originKey,
      x: previousOrigin.x,
      y: previousOrigin.y,
      fromOwner: previousOrigin.ownerId,
      toOwner: resolvedOrigin.ownerId,
      at: context.now()
    });
  }
  if (originOwnershipState === "FRONTIER") context.extendFortPatrolGrace(lock.originKey, context.now() + FORT_PATROL_GRACE_MS);
  else context.clearFortPatrolGrace(lock.originKey);
  // lock.playerId (the attacker) just lost this exact tile — force it visible
  // to them even if losing ownership dropped their fog-of-war coverage of it
  // in the same instant, so they actually see the muster flag getting
  // cleared below instead of it lingering stale in their client cache. See
  // SimulationTileWireDelta.forceVisibleForPlayerId's doc comment.
  const originDelta = context.tileDeltaFromState(resolvedOrigin);
  originDelta.forceVisibleForPlayerId = lock.playerId;
  const tileDeltas = [originDelta];

  // The origin's muster flag (already stripped via `_discardMuster` above) is
  // destroyed along with its staged manpower — no refund to the player who
  // just lost the tile.
  const hadMuster = Boolean(previousOrigin.muster);

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
        ...(defenderTile.naturalWonder ? { naturalWonder: defenderTile.naturalWonder } : {}),
        ...(defenderTile.watchtower ? { watchtower: defenderTile.watchtower } : {}),
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
    if (originLost) affectedPlayerIds.add(lock.playerId);
    if (originLost && previousOwnerId) affectedPlayerIds.add(previousOwnerId);
    for (const pid of affectedPlayerIds) {
      context.applyEncirclement(encirclementChangedKeys, pid, lock.commandId, { bfsCap: 2000 });
    }
  } else if (lock.actionType === "EXPAND" && attackerWon) {
    context.applyEncirclementForExpand(lock.targetKey, lock.playerId, lock.commandId, { bfsCap: 2000 });
  }
}
